import type { CreateCaseRequest, DentalCase, PatchCaseRequest, PlanYear, Policy, Procedure, SourceFact } from '@actionbridge/contracts';
import { isIsoDate, parseDollarsToCents, parsePercentToBps } from '../../lib/format';

/**
 * Manual entry (typed intake without the agent). The form collects what only the user can say
 * up front; everything left unknown stays `null` and is asked by the question loop later.
 * Nothing is defaulted: no 0, no 50%, no January 1, no in-network.
 */
export type Category = 'basic' | 'major';

export const CATEGORIES: { id: Category; label: string; hint: string }[] = [
  { id: 'basic', label: 'Basic', hint: 'Fillings, simple extractions' },
  { id: 'major', label: 'Major', hint: 'Crowns, bridges, root canals' },
];

export interface MoneyDraft {
  text: string;
  unknown: boolean;
}

export interface ProcedureDraft {
  key: string;
  label: string;
  category: Category | null;
  charge: MoneyDraft;
  network: Procedure['network'] | null;
  date: string;
}

export type YesNoUnknown = 'yes' | 'no' | 'unknown';

/** Plan rules the engine cannot ask about later: coverage rates and the benefit-year start. */
export interface RulesDraft {
  yearStart: string;
  rates: Partial<Record<Category, string>>;
  deductibleApplies: Partial<Record<Category, YesNoUnknown>>;
}

export interface CaseDraft {
  coverage: DentalCase['coverageMode'] | null;
  procedures: ProcedureDraft[];
  rules: RulesDraft;
  annualMaximum: MoneyDraft;
  deductible: MoneyDraft;
  alreadyPaid: MoneyDraft;
  deductibleMet: MoneyDraft;
}

export const MAX_PROCEDURES = 6;
const EMPTY_MONEY: MoneyDraft = { text: '', unknown: false };

export function emptyProcedure(key: string): ProcedureDraft {
  return { key, label: '', category: null, charge: EMPTY_MONEY, network: null, date: '' };
}

export function emptyDraft(firstKey: string): CaseDraft {
  return {
    coverage: null,
    procedures: [emptyProcedure(firstKey)],
    rules: { yearStart: '', rates: {}, deductibleApplies: {} },
    annualMaximum: EMPTY_MONEY,
    deductible: EMPTY_MONEY,
    alreadyPaid: EMPTY_MONEY,
    deductibleMet: EMPTY_MONEY,
  };
}

/** Categories actually used by the procedures, in display order. */
export function usedCategories(procedures: { category: Category | null }[]): Category[] {
  return CATEGORIES.map((c) => c.id).filter((id) => procedures.some((p) => p.category === id));
}

/** Field key → message. Keys: `coverage`, `procedures`, `procedures.<i>.<field>`, `rules.<field>`, `money.<field>`. */
export type DraftErrors = Record<string, string>;

/** Empty or "I don't know" → null (asked later); malformed → undefined (an error to fix now). */
function moneyValue(draft: MoneyDraft): number | null | undefined {
  if (draft.unknown || draft.text.trim() === '') return null;
  return parseDollarsToCents(draft.text) ?? undefined;
}

const MONEY_ERROR = 'Enter dollars and cents, for example 250.00, or leave it empty.';

export function validateRules(rules: RulesDraft, categories: Category[], requireYearStart: boolean): DraftErrors {
  const errors: DraftErrors = {};
  if (requireYearStart && !isIsoDate(rules.yearStart.trim())) errors['rules.yearStart'] = 'Enter the date your benefit year starts, as YYYY-MM-DD.';
  for (const category of categories) {
    if (parsePercentToBps(rules.rates[category] ?? '') === null) {
      errors[`rules.rates.${category}`] = 'Enter the percentage your plan pays, from 0 to 100.';
    }
  }
  return errors;
}

export function validateDraft(draft: CaseDraft): DraftErrors {
  const errors: DraftErrors = {};
  if (draft.coverage === null) errors.coverage = 'Choose one.';
  if (draft.procedures.length === 0) errors.procedures = 'Add at least one procedure.';
  if (draft.procedures.length > MAX_PROCEDURES) errors.procedures = `Add up to ${MAX_PROCEDURES} procedures.`;

  draft.procedures.forEach((procedure, index) => {
    const at = `procedures.${index}`;
    if (procedure.label.trim() === '') errors[`${at}.label`] = 'Name the procedure, for example “Crown”.';
    else if (procedure.label.trim().length > 120) errors[`${at}.label`] = 'Use a shorter name.';
    if (procedure.category === null) errors[`${at}.category`] = 'Choose a type.';
    if (moneyValue(procedure.charge) === undefined) errors[`${at}.charge`] = MONEY_ERROR;
    if (procedure.date.trim() !== '' && !isIsoDate(procedure.date.trim())) errors[`${at}.date`] = 'Enter a real date as YYYY-MM-DD, or leave it empty.';
  });

  if (draft.coverage === 'insured') {
    Object.assign(errors, validateRules(draft.rules, usedCategories(draft.procedures), true));
    for (const field of ['annualMaximum', 'deductible', 'alreadyPaid', 'deductibleMet'] as const) {
      if (moneyValue(draft[field]) === undefined) errors[`money.${field}`] = MONEY_ERROR;
    }
  }
  return errors;
}

/** Last day of a 12-month benefit year starting on `start` (date-only arithmetic, no time zones). */
export function benefitYearEnd(start: string): string {
  const [y, m, d] = start.split('-').map(Number) as [number, number, number];
  const end = new Date(Date.UTC(y + 1, m - 1, d) - 86_400_000);
  return end.toISOString().slice(0, 10);
}

interface Deps {
  now: () => Date;
  newId: () => string;
}

function assumptionFacts(deps: Deps): SourceFact[] {
  // The supported plan model assumes these. They are disclosed on the facts review, never hidden.
  return ['policy.deductibleBeforeCoinsurance', 'policy.allServicesCovered'].map((fieldPath) => ({
    id: `fact-${deps.newId()}`,
    fieldPath,
    value: true,
    sourceId: null,
    location: null,
    origin: 'assumption',
    extractionStatus: 'not_applicable',
    userConfirmed: false,
    insurerVerification: { status: 'not_verified' },
    conflict: false,
    recordedAt: deps.now().toISOString(),
  }));
}

/** Coverage rules from the form, merged over any existing policy. Unanswered rules are left out, so the engine asks. */
export function policyFromRules(rules: RulesDraft, categories: Category[], existing: Policy | null): Policy {
  const rates = { ...(existing?.insurerRateBpsByCategory ?? {}) };
  const deductibleApplies = { ...(existing?.deductibleAppliesByCategory ?? {}) };
  for (const category of categories) {
    const bps = parsePercentToBps(rules.rates[category] ?? '');
    if (bps !== null) rates[category] = bps;
    const applies = rules.deductibleApplies[category];
    if (applies === 'yes' || applies === 'no') deductibleApplies[category] = applies === 'yes';
    else delete deductibleApplies[category];
  }
  return {
    id: existing?.id ?? 'member-plan',
    deductibleBeforeCoinsurance: existing?.deductibleBeforeCoinsurance ?? true,
    deductibleAppliesByCategory: deductibleApplies,
    insurerRateBpsByCategory: rates,
    annualMaximumAppliesByCategory: existing?.annualMaximumAppliesByCategory ?? {},
    rounding: 'half_up_to_cent',
    allServicesCovered: existing?.allServicesCovered ?? true,
    waitingPeriods: existing?.waitingPeriods ?? [],
    exclusions: existing?.exclusions ?? [],
    frequencyRestrictions: existing?.frequencyRestrictions ?? [],
  };
}

export function toCreateCaseRequest(draft: CaseDraft, deps: Deps): CreateCaseRequest {
  const procedures: Procedure[] = draft.procedures.map((p, index) => ({
    id: `proc-${index + 1}`,
    label: p.label.trim(),
    cdtCode: null,
    category: p.category ?? 'basic',
    network: p.network ?? 'unknown',
    providerChargeCents: moneyValue(p.charge) ?? null,
    allowedCents: null,
    contractualWriteoffCents: null,
    proposedDate: p.date.trim() === '' ? null : p.date.trim(),
    dentistEarliestDate: null,
    dentistLatestDate: null,
    timingSource: 'unknown',
    prerequisiteIds: [],
  }));

  const coverage = draft.coverage ?? 'unknown';
  if (coverage !== 'insured') {
    return { currency: 'USD', coverageMode: coverage, policy: null, planYears: {}, procedures, sourceFacts: [] };
  }

  const start = draft.rules.yearStart.trim();
  const year: PlanYear = {
    startDate: start,
    endDate: benefitYearEnd(start),
    annualMaximumCents: moneyValue(draft.annualMaximum) ?? null,
    insurerAlreadyPaidCents: moneyValue(draft.alreadyPaid) ?? null,
    annualDeductibleCents: moneyValue(draft.deductible) ?? null,
    deductibleAlreadyMetCents: moneyValue(draft.deductibleMet) ?? null,
    sourceStatus: 'user_entered',
  };
  return {
    currency: 'USD',
    coverageMode: 'insured',
    policy: policyFromRules(draft.rules, usedCategories(draft.procedures), null),
    planYears: { [`py-${start.slice(0, 4)}`]: year },
    procedures,
    sourceFacts: assumptionFacts(deps),
  };
}

/** Rules draft prefilled from a stored case, for editing coverage rules later. */
export function rulesFromCase(record: DentalCase): RulesDraft {
  const rates: RulesDraft['rates'] = {};
  const deductibleApplies: RulesDraft['deductibleApplies'] = {};
  for (const { id } of CATEGORIES) {
    const bps = record.policy?.insurerRateBpsByCategory[id];
    if (bps !== undefined) rates[id] = String(bps / 100);
    const applies = record.policy?.deductibleAppliesByCategory[id];
    if (applies !== undefined) deductibleApplies[id] = applies ? 'yes' : 'no';
  }
  const first = Object.values(record.planYears).sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  return { yearStart: first?.startDate ?? '', rates, deductibleApplies };
}

/**
 * PATCH for edited coverage rules. Marks the case insured; adds a first benefit year only when
 * the case has none (its amounts stay unknown and are asked next). Existing years are untouched.
 */
export function rulesChanges(record: DentalCase, rules: RulesDraft, deps: Deps): PatchCaseRequest['changes'] {
  const categories = usedCategories(record.procedures.map((p) => ({ category: CATEGORIES.some((c) => c.id === p.category) ? (p.category as Category) : null })));
  const changes: PatchCaseRequest['changes'] = {
    coverageMode: 'insured',
    policy: policyFromRules(rules, categories, record.policy),
  };
  if (Object.keys(record.planYears).length === 0) {
    const start = rules.yearStart.trim();
    changes.planYears = {
      [`py-${start.slice(0, 4)}`]: {
        startDate: start,
        endDate: benefitYearEnd(start),
        annualMaximumCents: null,
        insurerAlreadyPaidCents: null,
        annualDeductibleCents: null,
        deductibleAlreadyMetCents: null,
        sourceStatus: 'user_entered',
      },
    };
  }
  if (record.policy === null) changes.sourceFacts = [...record.sourceFacts, ...assumptionFacts(deps)];
  return changes;
}
