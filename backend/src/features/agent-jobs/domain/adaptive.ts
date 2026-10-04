import { estimateCase } from '@actionbridge/benefits-engine';
import { plainDate, type DentalCaseInput, type MissingFact, type MissingFieldBlock } from '@actionbridge/contracts';
import { questionBlocks, setField, specFor, valueForAnswer } from './questions.js';

/**
 * Adaptive question planning (doc 05 §4, judging: "adaptive missing-data questions").
 * The engine decides WHAT is missing; this decides HOW to ask: the same detail across several
 * procedures becomes one question, the most decisive questions come first, at most four per
 * step, and a skipped detail is never asked again — it becomes a question to take to the
 * dentist or insurer instead.
 */
export interface AdaptiveState {
  /** Field paths, or `group:<key>`, the user answered "I don't know" to. */
  skipped: string[];
  /** Group keys the user chose to answer one by one. */
  expanded: string[];
}

export type GroupKey = 'network' | 'allowedCents' | 'contractualWriteoffCents' | 'deductibleApplies' | 'maximumApplies';

const GROUP_PATH: Record<GroupKey, string> = {
  network: 'procedures.all.network',
  allowedCents: 'procedures.all.allowedCents',
  contractualWriteoffCents: 'procedures.all.contractualWriteoffCents',
  deductibleApplies: 'policy.deductibleAppliesByCategory.all',
  maximumApplies: 'policy.annualMaximumAppliesByCategory.all',
};

export const MAX_QUESTIONS_PER_STEP = 4;

const PRIORITY: [RegExp, number][] = [
  [/^coverageMode$/, 0],
  [/^planYears\.[^.]+\.insurerAlreadyPaidCents$/, 1],
  [/^planYears\.[^.]+\.annualMaximumCents$/, 2],
  [/^planYears\.[^.]+\.(annualDeductibleCents|deductibleAlreadyMetCents)$/, 3],
  [/\.network$/, 4],
  [/\.providerChargeCents$/, 5],
  [/\.allowedCents$/, 6],
  [/\.contractualWriteoffCents$/, 7],
  [/\.proposedDate$/, 8],
  [/^policy\./, 9],
];
const priorityOf = (fieldPath: string) => PRIORITY.find(([pattern]) => pattern.test(fieldPath))?.[1] ?? 10;

export function groupKeyOf(fieldPath: string): GroupKey | null {
  const [root, id, field] = fieldPath.split('.');
  if (root === 'procedures' && id !== 'all') {
    if (field === 'network' || field === 'allowedCents' || field === 'contractualWriteoffCents') return field;
  }
  if (root === 'policy' && field !== 'all') {
    if (id === 'deductibleAppliesByCategory') return 'deductibleApplies';
    if (id === 'annualMaximumAppliesByCategory') return 'maximumApplies';
  }
  return null;
}

function isSkipped(fieldPath: string, state: AdaptiveState): boolean {
  const key = groupKeyOf(fieldPath);
  return state.skipped.includes(fieldPath) || (key !== null && state.skipped.includes(`group:${key}`));
}

export interface PlannedStep {
  blocks: MissingFieldBlock[];
  /** Conversational header for the step, e.g. "3 quick questions and I can calculate your estimate." */
  message: string;
  /** Missing facts the user already skipped; they become next-step questions, never asked again. */
  skippedFacts: MissingFact[];
  /** Missing facts with no in-app question (e.g. benefit-year dates); shown as "add in case details". */
  unanswerable: MissingFact[];
}

export function planStep(missing: MissingFact[], input: DentalCaseInput, state: AdaptiveState, expectedRevision: number): PlannedStep {
  const skippedFacts = missing.filter((m) => isSkipped(m.fieldPath, state));
  const open = missing.filter((m) => !isSkipped(m.fieldPath, state));

  // One unit = one question: a grouped detail, or a single fact.
  const groups = new Map<GroupKey, MissingFact[]>();
  const singles: MissingFact[] = [];
  for (const fact of open) {
    const key = groupKeyOf(fact.fieldPath);
    if (key && !state.expanded.includes(key)) groups.set(key, [...(groups.get(key) ?? []), fact]);
    else singles.push(fact);
  }
  const units: { priority: number; build: (n: number) => MissingFieldBlock | null; facts: MissingFact[] }[] = [];
  for (const [key, facts] of groups) {
    if (facts.length < 2) {
      singles.push(...facts);
      continue;
    }
    units.push({ priority: Math.min(...facts.map((f) => priorityOf(f.fieldPath))), facts, build: (n) => groupedBlock(key, facts, input, expectedRevision, n) });
  }
  const unanswerable: MissingFact[] = [];
  for (const fact of singles) {
    if (!specFor(fact, input)) {
      unanswerable.push(fact);
      continue;
    }
    units.push({
      priority: priorityOf(fact.fieldPath),
      facts: [fact],
      build: (n) => {
        const block = questionBlocks([fact], input, expectedRevision).blocks[0];
        return block ? { ...block, id: `q-${n}`, questionId: `q-${n}` } : null;
      },
    });
  }

  units.sort((a, b) => a.priority - b.priority);
  const chosen = units.slice(0, MAX_QUESTIONS_PER_STEP);
  const blocks = chosen.flatMap((unit, index) => {
    const block = unit.build(index + 1);
    return block ? [block] : [];
  });

  // When a single balance is all that stands between the user and an estimate, show what it is worth.
  if (units.length === 1 && blocks[0]) {
    const range = impactRange(units[0]!.facts[0]!, input);
    if (range) blocks[0] = { ...blocks[0], reason: `${blocks[0].reason} Depending on your answer, your estimate ranges from ${range}.`.slice(0, 300) };
  }

  const count = blocks.length;
  const message =
    count === 0
      ? ''
      : units.length > count
        ? `${count} quick questions to start — a few more after these.`
        : `${count === 1 ? 'One quick question' : `${count} quick questions`} and I can calculate your estimate.`;
  return { blocks, message, skippedFacts, unanswerable };
}

function money(cents: number): string {
  return `$${Math.floor(cents / 100).toLocaleString('en-US')}.${String(cents % 100).padStart(2, '0')}`;
}

/** "$725.00 to $1,200.00" when the answer's lowest and highest plausible values change the engine result. */
function impactRange(fact: MissingFact, input: DentalCaseInput): string | null {
  const [root, id, field] = fact.fieldPath.split('.');
  const year = root === 'planYears' && id ? input.planYears[id] : undefined;
  if (!year) return null;
  let bounds: [number, number] | null = null;
  if (field === 'insurerAlreadyPaidCents' && year.annualMaximumCents !== null) bounds = [0, year.annualMaximumCents];
  if (field === 'deductibleAlreadyMetCents' && year.annualDeductibleCents !== null) bounds = [0, year.annualDeductibleCents];
  if (!bounds) return null;
  const costs = bounds.map((value) => {
    const result = estimateCase(setField(input, fact.fieldPath, value));
    return result.status === 'estimated' ? result.totals.patientPaysCents : null;
  });
  if (costs[0] == null || costs[1] == null || costs[0] === costs[1]) return null;
  const [low, high] = [Math.min(costs[0], costs[1]), Math.max(costs[0], costs[1])];
  return `${money(low)} to ${money(high)}`;
}

function groupedBlock(key: GroupKey, facts: MissingFact[], input: DentalCaseInput, expectedRevision: number, n: number): MissingFieldBlock {
  const procedures = facts.flatMap((f) => input.procedures.filter((p) => p.id === f.fieldPath.split('.')[1]));
  const categories = [...new Set(facts.map((f) => f.fieldPath.split('.')[2] as string))];
  const count = procedures.length;
  const base = {
    id: `q-${n}`,
    type: 'missing_field' as const,
    questionId: `q-${n}`,
    fieldPath: GROUP_PATH[key],
    inputType: 'single_select' as const,
    allowedResponseModes: ['tap' as const],
    required: true,
    allowUnknown: true,
    sourceRefs: [],
    expectedRevision,
  };
  switch (key) {
    case 'network':
      return {
        ...base,
        label: 'Is your dentist in your plan’s network?',
        reason: `In-network dentists accept your plan’s allowed amounts, which usually lowers what you pay. This applies to all ${count} procedures.`,
        options: [
          { id: 'in', label: 'In network' },
          { id: 'out', label: 'Out of network' },
        ],
      };
    case 'allowedCents':
      return {
        ...base,
        label: 'Does your plan allow the dentist’s full charge?',
        reason: `Your plan pays a share of its allowed amount, not of the full charge. Your dentist’s office can tell you. This applies to ${count} procedures.`,
        options: [
          { id: 'same_as_charge', label: 'Yes, the allowed amount equals the charge' },
          { id: 'each', label: 'No, I’ll enter each amount' },
        ],
      };
    case 'contractualWriteoffCents': {
      const differenceKnown = procedures.every((p) => p.allowedCents !== null && p.providerChargeCents !== null);
      const allIn = procedures.every((p) => p.network === 'in');
      const difference = { id: 'difference', label: 'Yes, the difference between charge and allowed amount' };
      const none = { id: 'none', label: 'No, there is no write-off' };
      const each = { id: 'each', label: 'I’ll enter each amount' };
      return {
        ...base,
        label: 'Does your dentist write off part of these charges?',
        reason: allIn
          ? 'In-network dentists usually write off the difference between their charge and your plan’s allowed amount, so you are not billed for it.'
          : 'A write-off is the part of a charge the dentist agrees not to bill you. Enter it only if your dentist confirms one.',
        options: differenceKnown ? (allIn ? [difference, none, each] : [none, difference, each]) : [none, each],
      };
    }
    case 'deductibleApplies':
    case 'maximumApplies': {
      const list = categories.join(' and ');
      return {
        ...base,
        label: key === 'deductibleApplies' ? `Does your deductible apply to ${list} services?` : `Do ${list} services count toward your annual maximum?`,
        reason: key === 'deductibleApplies' ? 'Your plan summary lists this for each type of service.' : 'Most plans count basic and major services toward the annual maximum. Check your plan summary.',
        options: [
          { id: 'yes', label: 'Yes, for all of these services' },
          { id: 'no', label: 'No' },
          { id: 'each', label: 'It depends on the service' },
        ],
      };
    }
  }
}

export interface AppliedAnswer {
  input: DentalCaseInput;
  /** Concrete fields set by this answer, for provenance records. */
  changed: { fieldPath: string; value: string | number | boolean }[];
  expand: GroupKey | null;
}

/** Applies one validated answer; grouped answers fill every still-missing field in the group. */
export function applyAnswer(input: DentalCaseInput, block: MissingFieldBlock, value: unknown): AppliedAnswer | { error: string } {
  if (block.fieldPath === NEXT_YEAR_PATH) {
    if (value === 'same') return withUnchangedNextYear(input);
    if (value === 'different') return { input, changed: [], expand: null };
    return { error: `That answer is not valid for: ${block.label}` };
  }
  const key = (Object.entries(GROUP_PATH).find(([, path]) => path === block.fieldPath)?.[0] ?? null) as GroupKey | null;
  if (key === null) {
    const mapped = valueForAnswer(block, value, input);
    if (!mapped.ok) return { error: `That answer is not valid for: ${block.label}` };
    return { input: setField(input, block.fieldPath, mapped.value), changed: [{ fieldPath: block.fieldPath, value: mapped.value as string | number | boolean }], expand: null };
  }
  if (typeof value !== 'string' || !block.options.some((o) => o.id === value)) return { error: `That answer is not valid for: ${block.label}` };
  if (value === 'each') return { input, changed: [], expand: key };

  let next = structuredClone(input);
  const changed: AppliedAnswer['changed'] = [];
  if (key === 'deductibleApplies' || key === 'maximumApplies') {
    if (!next.policy) return { error: 'Add your plan’s coverage rules first.' };
    const mapName = key === 'deductibleApplies' ? 'deductibleAppliesByCategory' : 'annualMaximumAppliesByCategory';
    const map = { ...next.policy[mapName] };
    for (const category of new Set(next.procedures.map((p) => p.category))) {
      if (map[category] === undefined && next.policy.insurerRateBpsByCategory[category] !== undefined) {
        map[category] = value === 'yes';
        changed.push({ fieldPath: `policy.${mapName}.${category}`, value: value === 'yes' });
      }
    }
    next = { ...next, policy: { ...next.policy, [mapName]: map } };
    return { input: next, changed, expand: null };
  }
  next.procedures = next.procedures.map((p) => {
    if (key === 'network' && p.network === 'unknown') {
      changed.push({ fieldPath: `procedures.${p.id}.network`, value });
      return { ...p, network: value as 'in' | 'out' };
    }
    if (key === 'allowedCents' && p.allowedCents === null && p.providerChargeCents !== null && value === 'same_as_charge') {
      changed.push({ fieldPath: `procedures.${p.id}.allowedCents`, value: p.providerChargeCents });
      return { ...p, allowedCents: p.providerChargeCents };
    }
    if (key === 'contractualWriteoffCents' && p.contractualWriteoffCents === null) {
      const writeoff = value === 'none' ? 0 : p.providerChargeCents !== null && p.allowedCents !== null ? Math.max(0, p.providerChargeCents - p.allowedCents) : null;
      if (writeoff !== null) {
        changed.push({ fieldPath: `procedures.${p.id}.contractualWriteoffCents`, value: writeoff });
        return { ...p, contractualWriteoffCents: writeoff };
      }
    }
    return p;
  });
  return { input: next, changed, expand: null };
}

/** The skip marker stored for an "I don't know" answer. */
export function skipMarker(block: MissingFieldBlock): string {
  const key = Object.entries(GROUP_PATH).find(([, path]) => path === block.fieldPath)?.[0];
  return key ? `group:${key}` : block.fieldPath;
}

/** Concrete questions to take to the dentist or insurer for details the user could not provide (U-08). */
export function nextStepItems(facts: MissingFact[], input: DentalCaseInput): { audience: 'dentist' | 'insurer' | 'self'; text: string }[] {
  const items = new Map<string, { audience: 'dentist' | 'insurer' | 'self'; text: string }>();
  for (const fact of facts) {
    const [root, id, field] = fact.fieldPath.split('.');
    const name = root === 'procedures' ? (input.procedures.find((p) => p.id === id)?.label ?? 'this procedure') : '';
    const add = (audience: 'dentist' | 'insurer' | 'self', text: string) => items.set(text, { audience, text });
    if (fact.fieldPath === 'coverageMode') add('self', 'Check whether you have dental coverage for this treatment, for example through your employer.');
    else if (field === 'insurerAlreadyPaidCents') add('insurer', 'How much of my annual maximum have you already paid this benefit year?');
    else if (field === 'annualMaximumCents') add('insurer', 'What is my annual maximum for dental benefits?');
    else if (field === 'annualDeductibleCents' || field === 'deductibleAlreadyMetCents') add('insurer', 'What is my deductible, and how much of it have I met this benefit year?');
    else if (field === 'network') add('dentist', 'Are you in network for my dental plan?');
    else if (field === 'providerChargeCents') add('dentist', `What will you charge for ${name}?`);
    else if (field === 'allowedCents') add('dentist', `What is my plan’s allowed amount for ${name}?`);
    else if (field === 'contractualWriteoffCents') add('dentist', `Do you write off part of the charge for ${name} under my plan?`);
    else if (field === 'proposedDate') add('dentist', `When should ${name} be done, and how flexible is the timing?`);
    else if (id === 'deductibleAppliesByCategory') add('insurer', `Does my deductible apply to ${field} services?`);
    else if (id === 'annualMaximumAppliesByCategory') add('insurer', `Do ${field} services count toward my annual maximum?`);
    else if (fact.fieldPath === 'planYears') add('insurer', 'What are the start and end dates of my benefit year?');
    else if (fact.fieldPath === 'policy') add('insurer', 'What percentage do you pay for basic and major dental services?');
  }
  return [...items.values()].slice(0, 10);
}

/** Missing facts the engine reports for a case, or none when it can estimate. */
export function missingFor(input: DentalCaseInput): MissingFact[] {
  const result = estimateCase(input);
  return result.status === 'needs_information' ? result.missing : [];
}

// ---- Next benefit year ----------------------------------------------------------------------

/** The question that unlocks cross-year timing when only the current year's terms are known. */
export const NEXT_YEAR_PATH = 'planYears.next.sameTerms';

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
function dollars(cents: number | null): string {
  return cents === null ? 'not stated' : `$${(cents / 100).toLocaleString('en-US')}`;
}
function latestYear(input: DentalCaseInput) {
  return Object.entries(input.planYears).sort(([, a], [, b]) => b.startDate.localeCompare(a.startDate))[0];
}

/**
 * "Will your plan renew on 2027-01-01 with the same yearly maximum and deductible?" Asked when a
 * dentist window reaches past the last known benefit year, so the engine can compare that timing.
 */
export function nextYearQuestion(input: DentalCaseInput, expectedRevision: number): MissingFieldBlock | null {
  const latest = latestYear(input);
  if (!latest) return null;
  const [, year] = latest;
  const start = addDays(year.endDate, 1);
  return {
    id: 'q-next-year',
    type: 'missing_field',
    questionId: 'q-next-year',
    fieldPath: NEXT_YEAR_PATH,
    inputType: 'single_select',
    label: `Will your plan renew on ${plainDate(start)} with the same yearly maximum (${dollars(year.annualMaximumCents)}) and deductible (${dollars(year.annualDeductibleCents)})?`,
    reason: 'Your dentist allows some treatment after your new benefit year starts. If your plan renews the same way, I can compare doing it then — it may cost you less.',
    options: [
      { id: 'same', label: 'Yes, the same' },
      { id: 'different', label: 'No, it changes' },
    ],
    allowedResponseModes: ['tap'],
    required: false,
    allowUnknown: true,
    sourceRefs: [],
    expectedRevision,
  };
}

/** Adds next year's plan with the same maximum and deductible, labeled as an assumption, nothing used yet. */
export function withUnchangedNextYear(input: DentalCaseInput): AppliedAnswer {
  const latest = latestYear(input);
  if (!latest) return { input, changed: [], expand: null };
  const [, year] = latest;
  const start = addDays(year.endDate, 1);
  const end = addDays(start, 0).replace(/^(\d{4})/, (y) => String(Number(y) + 1));
  const id = start.endsWith('-01-01') ? `py-${start.slice(0, 4)}` : `py-${start.slice(0, 7)}`;
  if (input.planYears[id]) return { input, changed: [], expand: null };
  const next = structuredClone(input);
  next.planYears[id] = {
    startDate: start,
    endDate: addDays(end, -1),
    annualMaximumCents: year.annualMaximumCents,
    insurerAlreadyPaidCents: 0,
    annualDeductibleCents: year.annualDeductibleCents,
    deductibleAlreadyMetCents: 0,
    sourceStatus: 'explicit_unchanged_plan_assumption',
  };
  return { input: next, changed: [{ fieldPath: `planYears.${id}`, value: 'Same terms as this year (assumed)' }], expand: null };
}
