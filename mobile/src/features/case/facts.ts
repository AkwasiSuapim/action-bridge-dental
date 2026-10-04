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
  /** Field path the Edit action opens, or `rules` for the coverage-rules screen; absent when not editable here. */
  editPath?: string;
}

export interface FactGroup {
  key: string;
  title: string;
  rows: FactRow[];
  /** Collapsible groups (procedures, an assumed benefit year): the line shown before expanding. */
  summary?: { value: string; detail: string; needsAnswer: boolean; source?: FactSource };
}

const NETWORK: Record<Procedure['network'], string> = { in: 'In network', out: 'Out of network', unknown: 'Not sure' };
/** Plan-model assumptions recorded as `assumption` facts; always disclosed, never hidden. */
const ASSUMPTIONS: Record<string, string> = {
  'policy.deductibleBeforeCoinsurance': 'You pay the deductible before your plan’s percentage applies',
  'policy.allServicesCovered': 'These services are covered, with no waiting period, exclusion or frequency limit',
};

const COVERAGE: Record<DentalCase['coverageMode'], string> = { insured: 'I have dental insurance', self_pay: 'Paying myself', unknown: 'Not sure' };

/** "2026" for a calendar benefit year, otherwise "2026–27". */
export function planYearLabel(year: PlanYear): string {
  const start = year.startDate.slice(0, 4);
  const end = year.endDate.slice(0, 4);
  if (year.startDate.endsWith('-01-01') && year.endDate.endsWith('-12-31') && start === end) return start;
  return `${start}–${end.slice(2)}`;
}

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
    const amount = (cents: number | null, missing: string) => (cents === null ? missing : formatCents(cents));
    groups.push({
      key: path,
      title: procedure.label,
      rows,
      summary: {
        value: `${amount(procedure.providerChargeCents, 'Charge not answered')} · ${procedure.proposedDate ? formatDate(procedure.proposedDate) : 'Date not answered'}`,
        detail: [
          procedure.network === 'unknown' ? 'Network not confirmed' : NETWORK[procedure.network],
          `allowed ${amount(procedure.allowedCents, 'not answered')}`,
          ...(window && !window.startsWith('Fixed') ? [`dentist allows ${window}`] : []),
        ].join(' · '),
        needsAnswer: rows.some((r) => r.source === 'missing' && r.editPath),
      },
    });
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
        editPath: 'rules',
      });
    }
    for (const fact of record.sourceFacts) {
      const text = fact.origin === 'assumption' ? ASSUMPTIONS[fact.fieldPath] : undefined;
      if (text) coverage.push({ key: `assumption.${fact.fieldPath}`, label: 'Assumed', value: text, source: 'assumed' });
    }
  } else if (record.coverageMode !== 'self_pay') {
    coverage.push({ key: 'policy', label: 'Plan rules', value: 'Not provided yet', source: 'missing', editPath: 'rules' });
  }
  groups.push({ key: 'coverage', title: 'Your coverage', rows: coverage });

  const years = orderedPlanYears(record);
  years.forEach(([id, year], index) => {
    const path = `planYears.${id}`;
    const base = fromPlanYear(year);
    const assumedSame = year.sourceStatus === 'explicit_unchanged_plan_assumption' && index > 0;
    const firstLabel = years[0] ? planYearLabel(years[0][1]) : 'this year';
    const amountText = (cents: number | null) => (cents === null ? 'not answered' : formatCents(cents));
    groups.push({
      key: path,
      title: `${index === 0 ? 'This benefit year' : 'Next benefit year'} · ${planYearLabel(year)}`,
      ...(assumedSame
        ? {
            summary: {
              value: `Same as ${firstLabel}`,
              detail: `${amountText(year.annualMaximumCents)} maximum · ${amountText(year.annualDeductibleCents)} deductible · ${
                year.insurerAlreadyPaidCents === 0 ? 'nothing paid yet' : `${amountText(year.insurerAlreadyPaidCents)} paid`
              }`,
              needsAnswer: false,
              source: 'assumed' as const,
            },
          }
        : {}),
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
