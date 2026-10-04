import {
  MAX_CENTS,
  isValidIsoDate,
  type DentalCaseInput,
  type MissingFact,
  type MissingFieldBlock,
} from '@actionbridge/contracts';

/**
 * Engine-decided questions (doc 05 adaptive loop): each missing fact becomes the smallest
 * suitable control, with a reason and an "I don't know" route. Option IDs map back to typed values
 * on the server, so a client can only submit allowlisted choices.
 */
interface Choice {
  id: string;
  label: string;
  value: string | boolean;
}

type Spec =
  | { inputType: 'currency'; label: string; reason: string }
  | { inputType: 'single_select'; label: string; reason: string; options: Choice[] }
  | { inputType: 'date'; label: string; reason: string };

const YES_NO: Choice[] = [
  { id: 'yes', label: 'Yes', value: true },
  { id: 'no', label: 'No', value: false },
];

function specFor(fact: MissingFact, input: DentalCaseInput): Spec | null {
  const [root, id, field] = fact.fieldPath.split('.');
  const procedure = root === 'procedures' ? input.procedures.find((p) => p.id === id) : undefined;
  const name = procedure?.label ?? 'this procedure';

  if (fact.fieldPath === 'coverageMode') {
    return {
      inputType: 'single_select',
      label: 'Do you have dental insurance for this treatment?',
      reason: 'This decides whether we estimate with your plan’s rules or compare cash quotes.',
      options: [
        { id: 'insured', label: 'Yes, I have a plan', value: 'insured' },
        { id: 'self_pay', label: 'No, I’ll pay myself', value: 'self_pay' },
      ],
    };
  }
  if (root === 'planYears' && field) {
    const copy: Record<string, [string, string]> = {
      insurerAlreadyPaidCents: ['How much has your insurer already paid this benefit year?', 'This determines how much of your annual maximum remains.'],
      annualMaximumCents: ['What is your plan’s annual maximum?', 'This is the most your insurer pays in one benefit year.'],
      annualDeductibleCents: ['What is your annual deductible?', 'You pay this before your plan’s percentage applies.'],
      deductibleAlreadyMetCents: ['How much of this year’s deductible have you already met?', 'A met deductible is not charged again this benefit year.'],
    };
    const c = copy[field];
    return c ? { inputType: 'currency', label: c[0], reason: c[1] } : null;
  }
  if (procedure && field) {
    switch (field) {
      case 'providerChargeCents':
        return { inputType: 'currency', label: `What does the dentist charge for ${name}?`, reason: 'Every other amount starts from this charge.' };
      case 'allowedCents':
        return { inputType: 'currency', label: `What is your plan’s allowed amount for ${name}?`, reason: 'Insurers calculate their share from the allowed amount. Your dentist’s office or insurer can tell you.' };
      case 'contractualWriteoffCents':
        return { inputType: 'currency', label: `How much of the ${name} charge does the dentist write off?`, reason: 'In-network dentists usually write off the difference between charge and allowed amount. Enter 0 if none.' };
      case 'network':
        return {
          inputType: 'single_select',
          label: `Is your dentist in your plan’s network for ${name}?`,
          reason: 'Network status decides whether the dentist accepts your plan’s allowed amount.',
          options: [
            { id: 'in', label: 'In network', value: 'in' },
            { id: 'out', label: 'Out of network', value: 'out' },
          ],
        };
      case 'proposedDate':
        return { inputType: 'date', label: `When is ${name} planned?`, reason: 'The date decides which benefit year pays for it.' };
    }
    return null;
  }
  if (root === 'policy' && (id === 'deductibleAppliesByCategory' || id === 'annualMaximumAppliesByCategory') && field) {
    return {
      inputType: 'single_select',
      label: id === 'deductibleAppliesByCategory' ? `Does your deductible apply to ${field} services?` : `Do ${field} services count toward your annual maximum?`,
      reason: 'Your plan summary lists this under each service category.',
      options: YES_NO,
    };
  }
  return null;
}

/** Question blocks for answerable missing facts; the rest are returned for a "add in case details" notice. */
export function questionBlocks(
  missing: MissingFact[],
  input: DentalCaseInput,
  expectedRevision: number,
): { blocks: MissingFieldBlock[]; unanswerable: MissingFact[] } {
  const blocks: MissingFieldBlock[] = [];
  const unanswerable: MissingFact[] = [];
  missing.forEach((fact, index) => {
    const spec = specFor(fact, input);
    if (!spec) {
      unanswerable.push(fact);
      return;
    }
    const base = {
      id: `q-${index + 1}`,
      type: 'missing_field' as const,
      questionId: `q-${index + 1}`,
      fieldPath: fact.fieldPath,
      label: spec.label,
      reason: spec.reason,
      required: true,
      allowUnknown: true,
      sourceRefs: [],
      expectedRevision,
    };
    if (spec.inputType === 'currency') {
      blocks.push({ ...base, inputType: 'currency', options: [], allowedResponseModes: ['type'], currency: 'USD', minimumCents: 0, maximumCents: MAX_CENTS });
    } else if (spec.inputType === 'single_select') {
      blocks.push({ ...base, inputType: 'single_select', options: spec.options.map(({ id, label }) => ({ id, label })), allowedResponseModes: ['tap'] });
    } else {
      blocks.push({ ...base, inputType: 'date', options: [], allowedResponseModes: ['type'] });
    }
  });
  return { blocks: blocks.slice(0, 9), unanswerable };
}

/** Maps a submitted answer for a question block to the typed value stored in the case, or null if invalid. */
export function valueForAnswer(block: MissingFieldBlock, value: unknown, input: DentalCaseInput): { ok: true; value: unknown } | { ok: false } {
  switch (block.inputType) {
    case 'currency':
      return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_CENTS ? { ok: true, value } : { ok: false };
    case 'date':
      return typeof value === 'string' && isValidIsoDate(value) ? { ok: true, value } : { ok: false };
    case 'single_select': {
      const spec = specFor({ fieldPath: block.fieldPath, code: 'VALUE_UNKNOWN', message: '' }, input);
      const choice = spec?.inputType === 'single_select' ? spec.options.find((o) => o.id === value) : undefined;
      return choice ? { ok: true, value: choice.value } : { ok: false };
    }
    default:
      return { ok: false };
  }
}

/** Sets one answerable field on a copy of the case. Only paths produced by `specFor` reach here. */
export function setField(input: DentalCaseInput, fieldPath: string, value: unknown): DentalCaseInput {
  const [root, id, field] = fieldPath.split('.');
  const next = structuredClone(input);
  if (fieldPath === 'coverageMode') return { ...next, coverageMode: value as DentalCaseInput['coverageMode'] };
  if (root === 'planYears' && id && field && next.planYears[id]) {
    (next.planYears[id] as Record<string, unknown>)[field] = value;
    return next;
  }
  if (root === 'procedures' && id && field) {
    const procedure = next.procedures.find((p) => p.id === id);
    if (procedure) (procedure as Record<string, unknown>)[field] = value;
    return next;
  }
  if (root === 'policy' && id && field && next.policy) {
    const map = next.policy[id as 'deductibleAppliesByCategory' | 'annualMaximumAppliesByCategory'];
    if (map && typeof map === 'object') (map as Record<string, unknown>)[field] = value;
    return next;
  }
  return next;
}
