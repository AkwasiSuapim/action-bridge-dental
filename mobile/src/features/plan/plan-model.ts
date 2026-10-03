import type { CostLine, DentalCase, Scenario, ScenarioComparison } from '@actionbridge/contracts';
import { formatBps, formatCents, formatDate } from '../../lib/format';
import { buildFactGroups, orderedPlanYears, type FactSource } from '../case/facts';
import { buildOptions, planYearLabel } from '../options/options-model';

/**
 * View model for "Plan details" (design v3): one selected option explained line by line.
 * Every amount is an engine value; the only arithmetic is the display split of a capped payment
 * (insurer pays + cap shortfall = what the plan would have paid) and bar proportions.
 */
export interface Confirmation {
  text: string;
  ask: 'Ask your dentist' | 'Ask your insurer' | 'Ask your employer or insurer' | 'Ask your dentist’s office';
  source: FactSource;
}

export type TimelineEntry =
  | { kind: 'item'; key: string; day: string; year: string; title: string; youPayCents: number }
  | { kind: 'divider'; key: string; text: string };

export interface BreakdownItem {
  procedureId: string;
  title: string;
  date: string;
  youPayCents: number;
  rows: { label: string; value: string; strong?: boolean }[];
  note: string | null;
}

export interface YearBar {
  planYearId: string;
  label: string;
  maximumCents: number;
  maximumSource: string;
  paidCents: number;
  paidLabel: string;
  projectedCents: number;
  leftCents: number;
}

export interface PlanDetails {
  scenarioId: string;
  title: string;
  timing: string;
  youPayCents: number;
  planPaysCents: number;
  comparedToBaseline: string | null;
  confirmations: Confirmation[];
  timeline: TimelineEntry[];
  items: BreakdownItem[];
  bars: YearBar[];
  questions: { dentist: string[]; insurer: string[] };
  shareText: string;
  assumptions: string[];
}

const SOURCE_TEXT: Record<FactSource, string> = {
  sample: 'sample data',
  user: 'provided by you',
  document: 'from your document',
  voice: 'from your voice note',
  proposed: 'needs confirmation',
  assumed: 'assumed for comparison',
  missing: 'not answered',
};

const label = (record: DentalCase, procedureId: string) => record.procedures.find((p) => p.id === procedureId)?.label ?? procedureId;

export function findScenario(comparison: ScenarioComparison, scenarioId: string | undefined): Scenario | null {
  return [comparison.baseline, ...comparison.alternatives].find((s) => s.scenarioId === scenarioId) ?? null;
}

function lineNote(record: DentalCase, line: CostLine, firstYearId: string | undefined): string | null {
  const year = record.planYears[line.planYearId];
  const yearText = year ? planYearLabel(year) : '';
  const wouldPay = line.insurerPaysCents + line.capShortfallCents;
  if (line.capShortfallCents > 0 && line.insurerPaysCents > 0) {
    return `Your plan would pay ${formatCents(wouldPay)}, but only ${formatCents(line.insurerPaysCents)} of your ${yearText} maximum is left by then.`;
  }
  if (line.capShortfallCents > 0) return `Your plan would pay ${formatCents(wouldPay)}, but your ${yearText} maximum is used up by then, so the plan pays $0.00.`;
  if (line.deductibleAppliedCents > 0 && line.planYearId !== firstYearId && year) {
    return `A new benefit year starts ${formatDate(year.startDate)}, so the deductible applies again.`;
  }
  if (line.deductibleAppliedCents > 0) return `Your ${yearText} deductible is applied to this procedure.`;
  if (line.balanceBillCents > 0) return 'Out of network, the dentist can bill you the difference between the charge and the allowed amount.';
  return null;
}

export function buildPlanDetails(record: DentalCase, comparison: ScenarioComparison, scenario: Scenario): PlanDetails {
  const card = buildOptions(record, comparison).cards.find((c) => c.scenarioId === scenario.scenarioId)!;
  const { estimate } = scenario;
  const years = orderedPlanYears(record);
  const firstYearId = years[0]?.[0];
  const facts = buildFactGroups(record).flatMap((g) => g.rows);
  const sourceOf = (key: string): FactSource => facts.find((row) => row.key === key)?.source ?? 'user';
  const lines = [...estimate.lines].sort((a, b) => a.date.localeCompare(b.date));

  const diff = scenario.kind === 'alternative' ? scenario.differenceFromBaselineCents : null;
  const comparedToBaseline =
    diff === null || comparison.alternatives.length === 0
      ? null
      : diff > 0
        ? `Estimated ${formatCents(diff)} less than doing everything as planned, under these assumptions.`
        : diff < 0
          ? `Estimated ${formatCents(-diff)} more than doing everything as planned, under these assumptions.`
          : 'The same estimated cost as doing everything as planned.';

  // What the estimate depends on that nobody has confirmed with the dentist or insurer.
  const confirmations: Confirmation[] = [];
  for (const id of scenario.movedProcedureIds) {
    const date = scenario.schedule.find((entry) => entry.procedureId === id)?.date;
    confirmations.push({ text: `Your ${label(record, id).toLowerCase()} can be done on ${date ? formatDate(date) : 'the later date'}`, ask: 'Ask your dentist', source: 'proposed' });
  }
  for (const [id, year] of years.filter(([id]) => estimate.yearProjections[id])) {
    const yearText = planYearLabel(year);
    if (year.sourceStatus === 'explicit_unchanged_plan_assumption') {
      confirmations.push({ text: `Your ${yearText} coverage stays the same`, ask: 'Ask your employer or insurer', source: 'assumed' });
      continue;
    }
    const paidKey = `planYears.${id}.insurerAlreadyPaidCents`;
    if (year.insurerAlreadyPaidCents !== null) {
      confirmations.push({ text: `Your plan has paid ${formatCents(year.insurerAlreadyPaidCents)} so far in ${yearText}`, ask: 'Ask your insurer', source: sourceOf(paidKey) });
    }
    if (year.deductibleAlreadyMetCents !== null) {
      confirmations.push({
        text: `${formatCents(year.deductibleAlreadyMetCents)} of your ${yearText} deductible has been met`,
        ask: 'Ask your insurer',
        source: sourceOf(`planYears.${id}.deductibleAlreadyMetCents`),
      });
    }
  }
  if (record.procedures.some((p) => p.allowedCents !== null && p.allowedCents === p.providerChargeCents)) {
    confirmations.push({ text: 'Each fee equals your plan’s allowed amount', ask: 'Ask your dentist’s office', source: sourceOf(`procedures.${record.procedures[0]?.id}.allowedCents`) });
  }

  const timeline: TimelineEntry[] = [];
  lines.forEach((line, index) => {
    const previous = lines[index - 1];
    const year = record.planYears[line.planYearId];
    if (previous && previous.planYearId !== line.planYearId && year) {
      timeline.push({ kind: 'divider', key: `divider-${line.planYearId}`, text: `New benefit year · ${formatDate(year.startDate)}` });
    }
    const [day, yearText] = formatDate(line.date).split(', ');
    timeline.push({ kind: 'item', key: line.procedureId, day: day ?? line.date, year: yearText ?? '', title: label(record, line.procedureId), youPayCents: line.patientPaysCents });
  });

  const items: BreakdownItem[] = lines.map((line) => {
    const year = record.planYears[line.planYearId];
    const yearText = year ? planYearLabel(year) : '';
    const rateBase = line.allowedCents - line.deductibleAppliedCents;
    const rows: BreakdownItem['rows'] = [
      { label: `Charge · ${SOURCE_TEXT[sourceOf(`procedures.${line.procedureId}.providerChargeCents`)]}`, value: formatCents(line.providerChargeCents) },
      { label: 'Contractual write-off', value: formatCents(line.contractualWriteoffCents) },
      { label: 'Allowed amount', value: formatCents(line.allowedCents) },
      { label: `Deductible applied · ${yearText}`, value: formatCents(line.deductibleAppliedCents) },
      {
        label: `Plan pays · ${formatBps(line.insurerRateBps)} of ${formatCents(rateBase)}${line.capShortfallCents > 0 ? ', limited by maximum' : ''} · est.`,
        value: formatCents(line.insurerPaysCents),
      },
      ...(line.balanceBillCents > 0 ? [{ label: 'Balance billed by the dentist', value: formatCents(line.balanceBillCents) }] : []),
      { label: 'You pay · estimated', value: formatCents(line.patientPaysCents), strong: true },
    ];
    return { procedureId: line.procedureId, title: label(record, line.procedureId), date: formatDate(line.date), youPayCents: line.patientPaysCents, rows, note: lineNote(record, line, firstYearId) };
  });

  const bars: YearBar[] = years
    .filter(([id]) => estimate.yearProjections[id])
    .map(([id, year]) => {
      const projection = estimate.yearProjections[id]!;
      const assumed = projection.assumedPlanTerms;
      return {
        planYearId: id,
        label: planYearLabel(year),
        maximumCents: projection.annualMaximumCents,
        maximumSource: assumed ? `assumed same as ${years[0] ? planYearLabel(years[0][1]) : 'this year'}` : SOURCE_TEXT[sourceOf(`planYears.${id}.annualMaximumCents`)],
        paidCents: projection.reportedInsurerPaidCents,
        paidLabel: assumed ? 'Paid so far · new year, assumed' : `Paid so far · ${SOURCE_TEXT[sourceOf(`planYears.${id}.insurerAlreadyPaidCents`)]}`,
        projectedCents: projection.projectedTotalInsurerPaidCents - projection.reportedInsurerPaidCents,
        leftCents: projection.remainingMaximumCents,
      };
    });

  const dentist = [
    scenario.movedProcedureIds.length > 0
      ? `Can my ${scenario.movedProcedureIds.map((id) => label(record, id).toLowerCase()).join(' and ')} be done on ${formatDate(
          scenario.schedule.find((e) => scenario.movedProcedureIds.includes(e.procedureId))?.date ?? '',
        )} instead? Is that timing right for me?`
      : 'Can my treatment be done on the planned dates?',
    'Is your fee for each procedure the same as my plan’s allowed amount?',
  ];
  const current = years[0]?.[1];
  const next = years[1]?.[1];
  const insurer = [
    `How much of my ${current ? planYearLabel(current) : 'current'} annual maximum is left, and how much of my deductible has been met?`,
    ...(scenario.conditional && next ? [`Will my ${planYearLabel(next)} plan have the same maximum, deductible and coverage levels?`] : []),
    ...(record.procedures.some((p) => p.network === 'unknown') ? ['Is my dentist in network for my plan?'] : []),
  ];
  const numbered = (list: string[]) => list.map((q, i) => `${i + 1}. ${q}`).join('\n');
  const shareText = `Questions for my dentist\n${numbered(dentist)}\n\nQuestions for my insurer\n${numbered(insurer)}\n\nFrom my ActionBridge Dental plan. Costs are estimates, not a guarantee.`;

  return {
    scenarioId: scenario.scenarioId,
    title: card.title,
    timing: card.timing,
    youPayCents: estimate.totals.patientPaysCents,
    planPaysCents: estimate.totals.insurerPaysCents,
    comparedToBaseline,
    confirmations,
    timeline,
    items,
    bars,
    questions: { dentist, insurer },
    shareText,
    assumptions: estimate.assumptions.map((a) => a.message),
  };
}
