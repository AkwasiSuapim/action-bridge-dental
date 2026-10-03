import type { DentalCase, PlanYear, Procedure, SourceFact } from '@actionbridge/contracts';
import { formatBps, formatCents, formatDate } from '../../lib/format';

/**
 * Facts review model (design v3 "Here is what we'll use"). Every row says where its value came
 * from. Origin is separate from insurer verification: nothing here is ever "verified".
 */
export type FactSource = 'sample' | 'user' | 'document' | 'voice' | 'proposed' | 'assumed' | 'missing';

export interface FactRow {
  key: string;
  label: string;
  value: string;
  source: FactSource;
  /** Field path the Edit action opens; absent when the value is not editable here. */
  editPath?: string;
}

export interface FactGroup {
  key: string;
  title: string;
  rows: FactRow[];
}

const NETWORK: Record<Procedure['network'], string> = { in: 'In network', out: 'Out of network', unknown: 'Not sure' };
const COVERAGE: Record<DentalCase['coverageMode'], string> = { insured: 'I have dental insurance', self_pay: 'Paying myself', unknown: 'Not sure' };

/** True when the case carries the labeled synthetic fixture rather than the user's own data. */
export function isSampleCase(record: DentalCase): boolean {
  return (
    Object.values(record.planYears).some((year) => year.sourceStatus === 'synthetic_confirmed_input') ||
    record.procedures.some((procedure) => procedure.timingSource === 'fictional_dentist_supplied')
  );
}

/** Plan years in date order; the first is the current benefit year. */
export function orderedPlanYears(record: DentalCase): [string, PlanYear][] {
  return Object.entries(record.planYears).sort(([, a], [, b]) => a.startDate.localeCompare(b.startDate));
}

function latestFact(record: DentalCase, fieldPath: string): SourceFact | undefined {
  return record.sourceFacts.filter((fact) => fact.fieldPath === fieldPath).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0];
}

function fromFact(fact: SourceFact): FactSource {
  switch (fact.origin) {
    case 'user_entered':
      return 'user';
    case 'document_extracted':
      return fact.userConfirmed ? 'user' : 'document';
    case 'voice_transcribed':
      return fact.userConfirmed ? 'user' : 'voice';
    case 'agent_proposed':
      return fact.userConfirmed ? 'user' : 'proposed';
    case 'assumption':
      return 'assumed';
    case 'synthetic':
      return 'sample';
  }
}

function fromPlanYear(year: PlanYear): FactSource {
  switch (year.sourceStatus) {
    case 'synthetic_confirmed_input':
      return 'sample';
    case 'explicit_unchanged_plan_assumption':
      return 'assumed';
    case 'document_extracted':
    case 'insurer_confirmed':
      return 'document';
    default:
      return 'user';
  }
}

export function buildFactGroups(record: DentalCase): FactGroup[] {
  const sample = isSampleCase(record);
  const fallback: FactSource = sample ? 'sample' : 'user';

  /** One row: unknown values are shown as unanswered, never as $0 or a default. */
  const row = (fieldPath: string, label: string, raw: unknown, format: (value: never) => string, base: FactSource, editable = true): FactRow => {
    const fact = latestFact(record, fieldPath);
    const missing = raw === null || raw === undefined;
    return {
      key: fieldPath,
      label,
      value: missing ? 'Not answered' : format(raw as never),
      source: missing ? 'missing' : fact ? fromFact(fact) : base,
      ...(editable ? { editPath: fieldPath } : {}),
    };
  };
  const money = (cents: number) => formatCents(cents);
  const date = (iso: string) => formatDate(iso);

  const groups: FactGroup[] = [];

  for (const procedure of record.procedures) {
    const path = `procedures.${procedure.id}`;
    const window =
      procedure.dentistEarliestDate && procedure.dentistLatestDate
        ? procedure.dentistEarliestDate === procedure.dentistLatestDate
          ? `Fixed date: ${formatDate(procedure.dentistEarliestDate)}`
          : `${formatDate(procedure.dentistEarliestDate)} – ${formatDate(procedure.dentistLatestDate)}`
        : null;
    const rows: FactRow[] = [
      row(`${path}.providerChargeCents`, 'Dentist’s charge', procedure.providerChargeCents, money, fallback),
      row(`${path}.allowedCents`, 'Plan’s allowed amount', procedure.allowedCents, money, fallback),
      row(`${path}.contractualWriteoffCents`, 'Dentist writes off', procedure.contractualWriteoffCents, money, fallback),
      row(`${path}.network`, 'Network', procedure.network === 'unknown' ? null : procedure.network, (n: Procedure['network']) => NETWORK[n], fallback),
      row(`${path}.proposedDate`, 'Planned date', procedure.proposedDate, date, fallback),
      {
        // Timing windows come only from the dentist (never edited or inferred here).
        key: `${path}.window`,
        label: 'Dentist’s timing window',
        value: window ?? 'Not provided — no other dates will be compared',
        source: window === null ? 'missing' : procedure.timingSource === 'user_reported' ? 'user' : fallback,
      },
    ];
    if (procedure.network === 'unknown') {
      // "Not sure" is an answer: show it, but keep it flagged as unconfirmed.
      rows[3] = { ...rows[3]!, value: NETWORK.unknown, source: 'missing' };
    }
    groups.push({ key: path, title: procedure.label, rows });
  }

  const coverage: FactRow[] = [
    row('coverageMode', 'Coverage', record.coverageMode === 'unknown' ? null : record.coverageMode, (m: DentalCase['coverageMode']) => COVERAGE[m], fallback),
  ];
  if (record.policy) {
    const { insurerRateBpsByCategory, deductibleAppliesByCategory } = record.policy;
    for (const [category, bps] of Object.entries(insurerRateBpsByCategory)) {
      const afterDeductible = deductibleAppliesByCategory[category] === false ? 'no deductible' : 'after deductible';
      coverage.push({
        key: `policy.rate.${category}`,
        label: `${category.charAt(0).toUpperCase()}${category.slice(1)} services`,
        value: `Plan pays ${formatBps(bps)} ${afterDeductible}`,
        source: fallback,
      });
    }
  } else if (record.coverageMode !== 'self_pay') {
    coverage.push({ key: 'policy', label: 'Plan rules', value: 'Not provided yet', source: 'missing' });
  }
  groups.push({ key: 'coverage', title: 'Your coverage', rows: coverage });

  orderedPlanYears(record).forEach(([id, year], index) => {
    const path = `planYears.${id}`;
    const base = fromPlanYear(year);
    groups.push({
      key: path,
      title: `${index === 0 ? 'This benefit year' : 'Next benefit year'} · ${formatDate(year.startDate)} – ${formatDate(year.endDate)}`,
      rows: [
        row(`${path}.annualMaximumCents`, 'Annual maximum', year.annualMaximumCents, money, base),
        row(`${path}.annualDeductibleCents`, 'Deductible', year.annualDeductibleCents, money, base),
        row(`${path}.insurerAlreadyPaidCents`, 'Plan already paid this year', year.insurerAlreadyPaidCents, money, base),
        row(`${path}.deductibleAlreadyMetCents`, 'Deductible already met', year.deductibleAlreadyMetCents, money, base),
      ],
    });
  });

  return groups;
}
