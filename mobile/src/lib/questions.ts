import type { DentalCase, MissingFact, MissingFieldBlock, PatchCaseRequest } from '@actionbridge/contracts';

/**
 * Adaptive response loop, typed path (doc 05 §4): the engine decides which facts are missing;
 * this maps each one to the smallest suitable control and turns an answer into a case patch.
 * Unknown stays unknown — skipping a required question never fills in a value.
 */
export type QuestionSpec =
  | { kind: 'currency'; fieldPath: string; label: string; reason: string }
  | { kind: 'choice'; fieldPath: string; label: string; reason: string; options: { id: string; label: string; value: unknown; hint?: string }[] }
  | { kind: 'date'; fieldPath: string; label: string; reason: string }
  | { kind: 'edit_case'; fieldPath: string; label: string; reason: string };

const YES_NO = [
  { id: 'yes', label: 'Yes', value: true },
  { id: 'no', label: 'No', value: false },
];

export function questionFor(fact: MissingFact, record: DentalCase): QuestionSpec {
  const parts = fact.fieldPath.split('.');
  const [root, id, field] = parts;
  const procedure = root === 'procedures' && id ? record.procedures.find((p) => p.id === id) : undefined;
  const name = procedure?.label ?? 'this procedure';
  const fieldPath = fact.fieldPath;

  if (fieldPath === 'coverageMode') {
    return {
      kind: 'choice',
      fieldPath,
      label: 'Do you have dental insurance for this treatment?',
      reason: 'This decides whether we estimate with your plan’s rules or compare cash quotes.',
      options: [
        { id: 'insured', label: 'Yes, I have a plan', value: 'insured' },
        { id: 'self_pay', label: 'No, I’ll pay myself', value: 'self_pay' },
        { id: 'unknown', label: 'Not sure', value: 'unknown', hint: 'Your employer or insurer can tell you.' },
      ],
    };
  }

  if (root === 'planYears' && id && field && parts.length === 3) {
    const planYearCopy: Record<string, [string, string]> = {
      insurerAlreadyPaidCents: [
        'How much has your insurer already paid this benefit year?',
        'This determines how much of your annual maximum remains. Use your plan balance, not the dentist’s total charges.',
      ],
      annualMaximumCents: ['What is your plan’s annual maximum?', 'This is the most your insurer pays in one benefit year.'],
      annualDeductibleCents: ['What is your annual deductible?', 'You pay this amount before your plan’s percentage applies.'],
      deductibleAlreadyMetCents: [
        'How much of this year’s deductible have you already met?',
        'A met deductible is not charged again this benefit year.',
      ],
    };
    const copy = planYearCopy[field];
    if (copy) return { kind: 'currency', fieldPath, label: copy[0], reason: copy[1] };
  }

  if (procedure && field) {
    switch (field) {
      case 'providerChargeCents':
        return { kind: 'currency', fieldPath, label: `What does the dentist charge for ${name}?`, reason: 'This is the starting point for every amount below.' };
      case 'allowedCents':
        return {
          kind: 'currency',
          fieldPath,
          label: `What is your plan’s allowed amount for ${name}?`,
          reason: 'Insurers calculate their share from the allowed amount, not the full charge. Your dentist’s office or insurer can tell you.',
        };
      case 'contractualWriteoffCents':
        return {
          kind: 'currency',
          fieldPath,
          label: `How much of the ${name} charge does the dentist write off?`,
          reason: 'In-network dentists usually write off the difference between their charge and the allowed amount. Enter 0 if none.',
        };
      case 'network':
        return {
          kind: 'choice',
          fieldPath,
          label: `Is your dentist in your plan’s network for ${name}?`,
          reason: 'Network status decides whether the dentist accepts your plan’s allowed amount.',
          options: [
            { id: 'in', label: 'In network', value: 'in', hint: 'Your dentist is listed in your plan.' },
            { id: 'out', label: 'Out of network', value: 'out', hint: 'Your dentist is not in your plan.' },
            { id: 'unknown', label: 'Not sure', value: 'unknown', hint: 'Your insurer’s dentist finder can tell you.' },
          ],
        };
      case 'proposedDate':
        return { kind: 'date', fieldPath, label: `When is ${name} planned?`, reason: 'The date decides which benefit year pays for it.' };
    }
  }

  if (root === 'policy' && id && field && (id === 'deductibleAppliesByCategory' || id === 'annualMaximumAppliesByCategory')) {
    const deductible = id === 'deductibleAppliesByCategory';
    return {
      kind: 'choice',
      fieldPath,
      label: deductible ? `Does your deductible apply to ${field} services?` : `Do ${field} services count toward your annual maximum?`,
      reason: 'Your plan summary lists this under each service category.',
      options: YES_NO,
    };
  }

  return { kind: 'edit_case', fieldPath, label: fact.message, reason: 'Add this in the case details.' };
}

/**
 * Builds the PATCH `changes` for one confirmed answer. Each changed section is replaced as a
 * whole (contract rule), copied from the current revision so nothing else is lost.
 */
export function changesForAnswer(record: DentalCase, fieldPath: string, value: unknown): PatchCaseRequest['changes'] {
  const [root, id, field] = fieldPath.split('.');
  if (fieldPath === 'coverageMode') {
    return { coverageMode: value as DentalCase['coverageMode'] };
  }
  if (root === 'planYears' && id && field && record.planYears[id]) {
    return { planYears: { ...record.planYears, [id]: { ...record.planYears[id], [field]: value } } };
  }
  if (root === 'procedures' && id && field) {
    if (!record.procedures.some((p) => p.id === id)) throw new Error(`Unknown procedure ${id}`);
    return { procedures: record.procedures.map((p) => (p.id === id ? { ...p, [field]: value } : p)) };
  }
  if (root === 'policy' && record.policy && id && field) {
    const map = record.policy[id as 'deductibleAppliesByCategory' | 'annualMaximumAppliesByCategory'];
    if (typeof map !== 'object' || map === null) throw new Error(`Unsupported policy field ${fieldPath}`);
    return { policy: { ...record.policy, [id]: { ...map, [field]: value } } };
  }
  throw new Error(`Unsupported field ${fieldPath}`);
}

/**
 * Adapter for agent-proposed questions (`missing_field` UI blocks from a job, D-13) so they render
 * with the same question card as engine-reported facts. The block's field path, choices and
 * limits come from validated contracts; unsupported input types fall back to a plain notice.
 */
export function questionFromBlock(block: MissingFieldBlock): QuestionSpec {
  const base = { fieldPath: block.fieldPath, label: block.label, reason: block.reason };
  switch (block.inputType) {
    case 'currency':
      return { kind: 'currency', ...base };
    case 'single_select':
      return { kind: 'choice', ...base, options: block.options.map((option) => ({ id: option.id, label: option.label, value: option.id })) };
    case 'date':
      return { kind: 'date', ...base };
    default:
      // fact_review and attachment need the document pipeline, which is not built yet.
      return { kind: 'edit_case', ...base };
  }
}
