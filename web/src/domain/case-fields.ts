import type {
  DentalCaseInput,
  PlanYear,
  Policy,
  Procedure,
} from '@actionbridge/contracts';
import { compareSchedules } from '@actionbridge/benefits-engine';
import { amountLabel, currentYear, dateLabel } from './model';

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
export function nextQuestion(input: DentalCaseInput): CaseQuestion | null {
  if (input.coverageMode === 'unknown')
    return {
      path: 'coverageMode',
      title: 'Do you have dental insurance for this treatment?',
      reason:
        'Coverage decides whether we apply your plan rules or review cash prices.',
      kind: 'choice',
      options: coverageOptions,
    };
  if (input.coverageMode === 'self_pay') return null;
  if (!currentYear(input))
    return {
      path: 'benefitStart',
      title: 'When does your plan’s benefit year start?',
      reason:
        'Your maximum and deductible reset on this date. Check your benefits summary.',
      kind: 'date',
    };
  const result = compareSchedules(input);
  if (result.status === 'estimated') return null;
  if (result.status !== 'needs_information')
    return {
      path: 'rules',
      title: 'Let’s check your coverage rules',
      reason:
        result.status === 'invalid'
          ? 'Some details contradict one another. Review your coverage and procedure amounts.'
          : 'These plan rules need review before an estimate is available.',
      kind: 'rules',
    };
  const fact = result.missing[0];
  if (!fact) return null;
  const path = fact.fieldPath;
  const p = input.procedures.find((p) =>
    path.startsWith(`procedures.${p.id}.`),
  );
  if (path === 'coverageMode')
    return {
      path,
      title: 'Do you have dental insurance for this treatment?',
      reason: fact.message,
      kind: 'choice',
      options: coverageOptions,
    };
  if (path.endsWith('.network'))
    return {
      path,
      title: `Is your dentist in network for ${p?.label ?? 'this treatment'}?`,
      reason: 'Network terms affect allowed amounts and balance billing.',
      kind: 'choice',
      options: networkOptions,
    };
  if (path.endsWith('.proposedDate'))
    return {
      path,
      title: `When is ${p?.label ?? 'this treatment'} planned?`,
      reason: 'The date determines which benefit year applies.',
      kind: 'date',
    };
  if (
    path === 'policy' ||
    path === 'planYears' ||
    path === 'procedures' ||
    path.startsWith('policy.')
  )
    return {
      path,
      title: 'Add the missing coverage rule',
      reason: fact.message,
      kind: 'rules',
    };
  const label = fieldLabel(input, path);
  return {
    path,
    title: path.endsWith('insurerAlreadyPaidCents')
      ? 'How much has your insurer already paid this benefit year?'
      : `What is ${label.toLowerCase()}?`,
    reason: fact.message,
    kind: 'money',
  };
}
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
