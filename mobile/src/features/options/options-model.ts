import type { CoverageComparison, DentalCase, PlanYear, Scenario, ScenarioComparison } from '@actionbridge/contracts';
import { formatCents, formatDate } from '../../lib/format';
import { orderedPlanYears } from '../case/facts';

/**
 * View model for "Your dental options" (design v3). Every amount is copied from engine results;
 * nothing is calculated here except grouping engine lines by plan year for display.
 */
export interface OptionYear {
  planYearId: string;
  label: string;
  youPayCents: number;
  planPaysCents: number;
}

export interface OptionCard {
  scenarioId: string;
  kind: Scenario['kind'];
  title: string;
  timing: string;
  span: string;
  youPayCents: number;
  planPaysCents: number;
  years: OptionYear[];
  lowest: boolean;
  conditional: boolean;
}

export interface OptionsModel {
  cards: OptionCard[];
  summary: string;
  difference: { cents: number; conditions: string } | null;
  outcomeNote: string | null;
  benefitsBefore: { yearLabel: string; paidCents: number; maximumCents: number; leftCents: number } | null;
  whatCouldChange: string[];
}

/** "2026" for a calendar benefit year, otherwise "2026–27". */
export function planYearLabel(year: PlanYear): string {
  const start = year.startDate.slice(0, 4);
  const end = year.endDate.slice(0, 4);
  if (year.startDate.endsWith('-01-01') && year.endDate.endsWith('-12-31') && start === end) return start;
  return `${start}–${end.slice(2)}`;
}

function names(record: DentalCase, ids: string[]): string {
  const labels = ids.map((id) => record.procedures.find((p) => p.id === id)?.label ?? id);
  return labels.length <= 1 ? (labels[0] ?? '') : `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
}

/** "Filling one Nov 10 · Crown Nov 12, 2026 · Crown Jan 1, 2027": the year once per calendar-year group. */
function timingLine(record: DentalCase, lines: { procedureId: string; date: string }[]): string {
  const sorted = [...lines].sort((a, b) => a.date.localeCompare(b.date));
  return sorted
    .map((line, index) => {
      const label = record.procedures.find((p) => p.id === line.procedureId)?.label ?? line.procedureId;
      const full = formatDate(line.date);
      const lastOfYear = sorted[index + 1]?.date.slice(0, 4) !== line.date.slice(0, 4);
      return `${label} ${lastOfYear ? full : full.replace(/, \d{4}$/, '')}`;
    })
    .join(' · ');
}

/** Card title: as planned vs alternative, and whether it spans more than one benefit year. */
export function scenarioTitle(scenario: Scenario): string {
  const multiYear = new Set(scenario.estimate.lines.map((line) => line.planYearId)).size > 1;
  if (scenario.kind === 'baseline') return multiYear ? 'As planned' : 'All treatment this benefit year';
  return multiYear ? 'Split across benefit years' : 'Alternative timing';
}

function toCard(record: DentalCase, scenario: Scenario): Omit<OptionCard, 'lowest'> {
  const { estimate } = scenario;
  const years = orderedPlanYears(record)
    .filter(([id]) => estimate.lines.some((line) => line.planYearId === id))
    .map(([id, year]) => ({
      planYearId: id,
      label: planYearLabel(year),
      youPayCents: estimate.lines.filter((line) => line.planYearId === id).reduce((sum, line) => sum + line.patientPaysCents, 0),
      planPaysCents: estimate.yearProjections[id]?.scenarioInsurerPaysCents ?? 0,
    }));
  const multiYear = years.length > 1;
  const timing = timingLine(record, estimate.lines);
  return {
    scenarioId: scenario.scenarioId,
    kind: scenario.kind,
    title: scenarioTitle(scenario),
    timing,
    span: years.length === 0 ? '' : multiYear ? `${years[0]!.label} and ${years.at(-1)!.label}` : years[0]!.label,
    youPayCents: estimate.totals.patientPaysCents,
    planPaysCents: estimate.totals.insurerPaysCents,
    years,
    conditional: scenario.conditional,
  };
}

export function buildOptions(record: DentalCase, comparison: ScenarioComparison): OptionsModel {
  const scenarios = [comparison.baseline, ...comparison.alternatives];
  const raw = scenarios.map((scenario) => toCard(record, scenario));
  const min = Math.min(...raw.map((card) => card.youPayCents));
  const uniqueLowest = raw.filter((card) => card.youPayCents === min).length === 1 && raw.length > 1;
  const cards = raw.map((card) => ({ ...card, lowest: uniqueLowest && card.youPayCents === min }));

  const best = comparison.alternatives.filter((alt) => alt.differenceFromBaselineCents > 0).sort((a, b) => b.differenceFromBaselineCents - a.differenceFromBaselineCents)[0];
  const years = orderedPlanYears(record);
  const nextYear = years[1]?.[1];

  let summary = `Your estimated cost for this treatment is ${formatCents(comparison.baseline.estimate.totals.patientPaysCents)}.`;
  let difference: OptionsModel['difference'] = null;
  if (best) {
    const moved = names(record, best.movedProcedureIds);
    const date = best.schedule.find((entry) => best.movedProcedureIds.includes(entry.procedureId))?.date;
    const amount = formatCents(best.differenceFromBaselineCents);
    summary = `Having the ${moved.toLowerCase()} on ${date ? formatDate(date) : 'a later date'} is estimated to cost you ${amount} less, if your dentist confirms that date works for you.`;
    const conditions = [
      `your dentist confirms the ${moved.toLowerCase()} can be done on ${date ? formatDate(date) : 'that date'}`,
      ...(best.conditional && nextYear ? [`your ${planYearLabel(nextYear)} coverage stays the same`] : []),
      'no other claims use your benefits first',
    ];
    difference = { cents: best.differenceFromBaselineCents, conditions: `Holds only if ${conditions.slice(0, -1).join(', ')} and ${conditions.at(-1)}.` };
  }

  const outcomeNote =
    comparison.outcome === 'no_flexible_timing'
      ? 'No other dates were compared: your dentist hasn’t given a flexible timing window for any procedure.'
      : comparison.outcome === 'no_lower_cost_alternative'
        ? 'We compared the dates your dentist allows. None has a lower estimated cost.'
        : comparison.outcome === 'comparison_incomplete'
          ? 'A later-date option couldn’t be compared yet.'
          : null;

  const current = years[0]?.[1];
  const benefitsBefore =
    current && current.insurerAlreadyPaidCents !== null && current.annualMaximumCents !== null
      ? {
          yearLabel: planYearLabel(current),
          paidCents: current.insurerAlreadyPaidCents,
          maximumCents: current.annualMaximumCents,
          leftCents: Math.max(0, current.annualMaximumCents - current.insurerAlreadyPaidCents),
        }
      : null;

  const whatCouldChange = [
    ...(best ? [`Your dentist advises against waiting for the ${names(record, best.movedProcedureIds).toLowerCase()}.`] : []),
    ...(nextYear && scenarios.some((s) => s.conditional) ? [`Your ${planYearLabel(nextYear)} plan has a different maximum, deductible or coverage level.`] : []),
    'The final fee or your plan’s allowed amount is different from these figures.',
    'Other dental claims are paid first and use part of your benefits.',
    'Your plan has a waiting period, frequency limit or other rule we don’t check.',
  ];

  return { cards, summary, difference, outcomeNote, benefitsBefore, whatCouldChange };
}

export type SelfPayView =
  | { status: 'unavailable'; missing: string }
  | { status: 'available'; insuredCents: number | null; selfPayCents: number; result: string; notes: string[] };

export function selfPayView(record: DentalCase, comparison: CoverageComparison): SelfPayView {
  const { selfPay } = comparison;
  if (selfPay.status === 'unavailable') {
    return { status: 'unavailable', missing: names(record, selfPay.missingQuoteProcedureIds) };
  }
  const insuredCents = comparison.insured.status === 'estimated' ? comparison.insured.totals.patientPaysCents : null;
  const diff = comparison.selfPayMinusInsuredCents;
  const result =
    diff === null
      ? 'We can’t compare yet: the insurance estimate needs more details.'
      : diff > 0
        ? `Using insurance is estimated ${formatCents(diff)} less.`
        : diff < 0
          ? `The self-pay quote is estimated ${formatCents(-diff)} less.`
          : 'Both cost about the same.';
  return { status: 'available', insuredCents, selfPayCents: selfPay.totalCents, result, notes: comparison.notes.map((note) => note.message) };
}
