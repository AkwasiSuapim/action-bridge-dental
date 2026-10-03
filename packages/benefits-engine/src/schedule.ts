import type {
  DentalCaseInput,
  EstimatedResult,
  Limitation,
  Scenario,
  ScenarioComparison,
  ScenarioComparisonResult,
} from '@actionbridge/contracts';
import { calculateSchedule } from './calculate.js';
import { checkCase, findPlanYear, type CaseContext, type PlanYearRef } from './case-check.js';
import { baselineDates, notEstimated, prerequisitesSatisfied, type InvalidResult } from './estimate.js';
import { ENGINE_VERSION, MAX_SCHEDULE_ASSIGNMENTS } from './version.js';

export type EngineComparisonResult = ScenarioComparisonResult | InvalidResult;

const MAX_ALTERNATIVES = 2;

interface Flexible {
  procedureId: string;
  nextYearDate: string;
}

interface Evaluated {
  mask: number;
  moved: string[];
  result: EstimatedResult;
}

/**
 * Bounded schedule comparison (system design §5, decision D-01).
 *
 * Each procedure keeps its baseline date. A procedure with a dentist-supplied window that
 * reaches past its baseline plan year gets one more candidate: the earliest permitted date in
 * the next supplied plan year. All combinations (≤ 2^6) are checked against prerequisites and
 * run through the same calculator. Returns the baseline plus up to two lower-cost alternatives —
 * "lowest estimated cost among evaluated feasible options", not a global optimum.
 */
export function compareSchedules(input: DentalCaseInput): EngineComparisonResult {
  const check = checkCase(input);
  if (check.kind !== 'ok') return notEstimated(check, input.caseRevision);
  const { ctx } = check;

  const baselineResult = calculateSchedule(ctx, baselineDates(ctx));
  if (baselineResult.status !== 'estimated') return baselineResult;

  const limitations: Limitation[] = [];
  const flexibles = findFlexible(ctx, limitations);
  const assignmentCount = 2 ** flexibles.length;

  const evaluated: Evaluated[] = [];
  let feasible = 1;
  let incompleteReported = false;
  for (let mask = 1; mask < assignmentCount; mask++) {
    const dates = baselineDates(ctx);
    const moved: string[] = [];
    flexibles.forEach((f, bit) => {
      if (mask & (1 << bit)) {
        dates.set(f.procedureId, f.nextYearDate);
        moved.push(f.procedureId);
      }
    });
    if (!prerequisitesSatisfied(ctx, dates)) continue;
    feasible++;

    const result = calculateSchedule(ctx, dates);
    if (result.status !== 'estimated') {
      if (!incompleteReported) {
        incompleteReported = true;
        limitations.push({
          code: 'NEXT_PLAN_YEAR_INCOMPLETE',
          message: 'Next plan year values are incomplete, so later-date options were not compared.',
          fieldPath: result.missing[0]?.fieldPath ?? 'planYears',
        });
      }
      continue;
    }
    evaluated.push({ mask, moved, result });
  }

  const baselinePatient = baselineResult.totals.patientPaysCents;
  const seenKeys = new Set([financialKey(baselineResult)]);
  const alternatives: Scenario[] = [];
  const ranked = evaluated
    .filter((e) => e.result.totals.patientPaysCents < baselinePatient)
    .sort(
      (a, b) =>
        a.result.totals.patientPaysCents - b.result.totals.patientPaysCents ||
        a.moved.length - b.moved.length ||
        a.mask - b.mask,
    );
  for (const candidate of ranked) {
    if (alternatives.length === MAX_ALTERNATIVES) break;
    const key = financialKey(candidate.result);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    alternatives.push(
      toScenario(`alt-${alternatives.length + 1}`, 'alternative', candidate.result, candidate.moved, baselinePatient),
    );
  }

  const comparison: ScenarioComparison = {
    status: 'estimated',
    engineVersion: ENGINE_VERSION,
    caseRevision: ctx.caseRevision,
    outcome:
      alternatives.length > 0
        ? 'alternatives_found'
        : limitations.length > 0
          ? 'comparison_incomplete'
          : flexibles.length === 0
            ? 'no_flexible_timing'
            : 'no_lower_cost_alternative',
    baseline: toScenario('baseline', 'baseline', baselineResult, [], baselinePatient),
    alternatives,
    limitations,
    search: {
      selectionRule: 'lowest_estimated_cost_among_evaluated_feasible_options',
      flexibleProcedureIds: flexibles.map((f) => f.procedureId),
      evaluatedAssignments: assignmentCount,
      feasibleAssignments: feasible,
      maxAssignments: MAX_SCHEDULE_ASSIGNMENTS,
    },
  };
  return comparison;
}

function findFlexible(ctx: CaseContext, limitations: Limitation[]): Flexible[] {
  const flexibles: Flexible[] = [];
  const inInputOrder = [...ctx.procedures].sort((a, b) => a.inputIndex - b.inputIndex);
  for (const p of inInputOrder) {
    if (p.window === null) continue;
    const baseYear = findPlanYear(ctx.planYears, p.baselineDate) as PlanYearRef;
    if (p.window.latest <= baseYear.endDate) continue;

    const nextYear = ctx.planYears.find((py) => py.startDate > baseYear.endDate);
    if (nextYear === undefined) {
      limitations.push({
        code: 'NEXT_PLAN_YEAR_NOT_SUPPLIED',
        message: `The dentist window for ${p.id} reaches past ${baseYear.endDate}, but next plan year terms were not supplied, so that option was not compared.`,
        fieldPath: 'planYears',
        procedureId: p.id,
      });
      continue;
    }
    const candidate = p.window.earliest > nextYear.startDate ? p.window.earliest : nextYear.startDate;
    if (candidate > p.window.latest || candidate > nextYear.endDate) continue;
    flexibles.push({ procedureId: p.id, nextYearDate: candidate });
  }
  return flexibles;
}

/** Results with the same employee total and the same insurer payment per plan year are equivalent. */
function financialKey(result: EstimatedResult): string {
  const perYear = Object.values(result.yearProjections)
    .map((y) => `${y.planYearId}:${y.scenarioInsurerPaysCents}`)
    .join(',');
  return `${result.totals.patientPaysCents}|${perYear}`;
}

function toScenario(
  scenarioId: string,
  kind: Scenario['kind'],
  result: EstimatedResult,
  moved: string[],
  baselinePatient: number,
): Scenario {
  return {
    scenarioId,
    kind,
    schedule: result.schedule,
    movedProcedureIds: moved,
    estimate: result,
    differenceFromBaselineCents: baselinePatient - result.totals.patientPaysCents,
    conditional: result.conditional,
  };
}
