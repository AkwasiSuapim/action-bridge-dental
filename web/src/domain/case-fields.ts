import type {
  DentalCaseInput,
  PlanYear,
  Policy,
  Procedure,
} from '@actionbridge/contracts';
import { amountLabel, dateLabel } from './model';

export const categories = ['basic', 'major'] as const;
export function emptyPolicy(): Policy {
  return {
    id: 'manual-plan',
    deductibleBeforeCoinsurance: true,
    deductibleAppliesByCategory: {},
    insurerRateBpsByCategory: {},
    annualMaximumAppliesByCategory: {},
    rounding: 'half_up_to_cent',
    allServicesCovered: true,
    waitingPeriods: [],
    exclusions: [],
    frequencyRestrictions: [],
  };
}
export function emptyProcedure(): Procedure {
  return {
    id: `procedure-${crypto.randomUUID()}`,
    label: '',
    category: '',
    cdtCode: null,
    providerChargeCents: null,
    allowedCents: null,
    contractualWriteoffCents: null,
    network: 'unknown',
    proposedDate: null,
    dentistEarliestDate: null,
    dentistLatestDate: null,
    timingSource: 'unknown',
    prerequisiteIds: [],
  };
}
export function validDate(date: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(Date.parse(date)) &&
    new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date
  );
}
export function yearEnd(start: string) {
  const [y, m, d] = start.split('-').map(Number);
  return new Date(Date.UTC(y + 1, m - 1, d) - 86400000)
    .toISOString()
    .slice(0, 10);
}
export function blankYear(start: string): PlanYear {
  return {
    startDate: start,
    endDate: yearEnd(start),
    annualMaximumCents: null,
    insurerAlreadyPaidCents: null,
    annualDeductibleCents: null,
    deductibleAlreadyMetCents: null,
    sourceStatus: 'user_entered',
  };
}
export type CaseQuestion = {
  path: string;
  title: string;
  reason: string;
  kind: 'money' | 'choice' | 'date' | 'rules' | 'document' | 'conflict';
  options?: { value: string; label: string }[];
};
export const coverageOptions = [
  { value: 'insured', label: 'I have dental insurance' },
  { value: 'self_pay', label: 'Self-pay' },
  { value: 'unknown', label: 'Not sure' },
];
export const networkOptions = [
  { value: 'in', label: 'In network' },
  { value: 'out', label: 'Out of network' },
  { value: 'unknown', label: 'Not sure' },
];
const labels: Record<string, string> = {
  providerChargeCents: 'Dentist’s charge',
  allowedCents: 'Plan’s allowed amount',
  contractualWriteoffCents: 'Dentist writes off',
  annualMaximumCents: 'Annual insurer maximum',
  annualDeductibleCents: 'Annual deductible',
  insurerAlreadyPaidCents: 'Insurer already paid this year',
  deductibleAlreadyMetCents: 'Deductible already met',
  network: 'Provider network',
  proposedDate: 'Planned date',
  startDate: 'Benefit year starts',
  endDate: 'Benefit year ends',
  coverageMode: 'Insurance status',
};
export function fieldLabel(input: DentalCaseInput, path: string) {
  const [root, id, field] = path.split('.');
  if (root === 'procedures')
    return `${input.procedures.find((p) => p.id === id)?.label ?? 'Procedure'} · ${labels[field] ?? field}`;
  if (root === 'planYears')
    return `${id.replace('py-', '')} · ${labels[field] ?? field}`;
  if (root === 'policy')
    return `${id === 'insurerRateBpsByCategory' ? 'Plan pays' : id === 'deductibleAppliesByCategory' ? 'Deductible applies' : 'Annual maximum applies'} · ${field ?? id}`;
  return labels[root] ?? root;
}
export function fieldValue(input: DentalCaseInput, path: string): unknown {
  const [root, id, field] = path.split('.');
  if (root === 'procedures')
    return input.procedures.find((p) => p.id === id)?.[
      field as keyof Procedure
    ];
  if (root === 'planYears')
    return input.planYears[id]?.[field as keyof PlanYear];
  if (root === 'coverageMode') return input.coverageMode;
  return null;
}
export function setField(input: DentalCaseInput, path: string, value: unknown) {
  const [root, id, field] = path.split('.');
  if (root === 'coverageMode')
    input.coverageMode = value as DentalCaseInput['coverageMode'];
  else if (root === 'procedures')
    Object.assign(
      input.procedures.find((p) => p.id === id)!,
      { [field]: value },
    );
  else if (root === 'planYears')
    Object.assign(input.planYears[id], { [field]: value });
  else if (path === 'benefitStart')
    input.planYears[`py-${String(value).slice(0, 4)}`] = blankYear(
      String(value),
    );
}
export function inputFacts(input: DentalCaseInput): Record<string, string> {
  const facts: Record<string, string> = {
    coverageMode:
      input.coverageMode === 'insured'
        ? 'Insured'
        : input.coverageMode === 'self_pay'
          ? 'Self-pay'
          : 'Not sure',
  };
  for (const p of input.procedures) {
    for (const f of [
      'providerChargeCents',
      'allowedCents',
      'contractualWriteoffCents',
    ] as const)
      facts[`procedures.${p.id}.${f}`] = amountLabel(p[f]);
    facts[`procedures.${p.id}.network`] = networkOptions.find(
      (o) => o.value === p.network,
    )!.label;
    facts[`procedures.${p.id}.proposedDate`] = p.proposedDate
      ? dateLabel(p.proposedDate)
      : 'Not answered';
    facts[`procedures.${p.id}.label`] = p.label;
    facts[`procedures.${p.id}.category`] = p.category;
  }
  for (const [id, y] of Object.entries(input.planYears)) {
    for (const f of [
      'annualMaximumCents',
      'annualDeductibleCents',
      'insurerAlreadyPaidCents',
      'deductibleAlreadyMetCents',
    ] as const)
      facts[`planYears.${id}.${f}`] = amountLabel(y[f]);
    facts[`planYears.${id}.startDate`] = dateLabel(y.startDate);
    facts[`planYears.${id}.endDate`] = dateLabel(y.endDate);
  }
  if (input.policy)
    for (const map of [
      'insurerRateBpsByCategory',
      'deductibleAppliesByCategory',
      'annualMaximumAppliesByCategory',
    ] as const)
      for (const [category, v] of Object.entries(input.policy[map]))
        facts[`policy.${map}.${category}`] =
          typeof v === 'number' ? `${v / 100}%` : v ? 'Yes' : 'No';
  return facts;
}
