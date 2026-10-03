import type {
  Assumption,
  CostLine,
  EstimatedResult,
  MissingFact,
  NeedsInformationResult,
  YearProjection,
} from '@actionbridge/contracts';
import { findPlanYear, type CaseContext, type PlanYearRef, type ResolvedProcedure } from './case-check.js';
import { applyRateHalfUp, EngineInvariantError } from './money.js';
import { ENGINE_VERSION } from './version.js';

/** procedureId → treatment date. Must contain every procedure in the context. */
export type ScheduleDates = ReadonlyMap<string, string>;

interface CompletePlanYear {
  id: string;
  annualMaximumCents: number;
  insurerAlreadyPaidCents: number;
  annualDeductibleCents: number;
  deductibleAlreadyMetCents: number;
  assumed: boolean;
  synthetic: boolean;
}

interface YearState {
  deductibleRemaining: number;
  maximumRemaining: number;
  scenarioInsurerPays: number;
  maximumConsumed: number;
  deductibleApplied: number;
}

/**
 * Sequential calculation (system design §5). Procedures are processed by date, then by stable
 * topological order, so the same inputs always produce the same lines. Inputs are never mutated.
 */
export function calculateSchedule(
  ctx: CaseContext,
  dates: ScheduleDates,
): EstimatedResult | NeedsInformationResult {
  const ordered = ctx.procedures
    .map((procedure) => ({ procedure, date: dateFor(dates, procedure) }))
    .sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : a.procedure.topoIndex - b.procedure.topoIndex,
    );

  const resolved = resolvePlanYears(ctx.planYears, ordered);
  if (resolved.kind === 'missing') {
    return {
      status: 'needs_information',
      engineVersion: ENGINE_VERSION,
      caseRevision: ctx.caseRevision,
      missing: resolved.missing,
    };
  }

  const states = new Map<string, YearState>();
  const lines: CostLine[] = [];
  for (const { procedure, date } of ordered) {
    const year = resolved.byProcedure.get(procedure.id) as CompletePlanYear;
    let state = states.get(year.id);
    if (state === undefined) {
      state = {
        deductibleRemaining: year.annualDeductibleCents - year.deductibleAlreadyMetCents,
        maximumRemaining: year.annualMaximumCents - year.insurerAlreadyPaidCents,
        scenarioInsurerPays: 0,
        maximumConsumed: 0,
        deductibleApplied: 0,
      };
      states.set(year.id, state);
    }
    lines.push(calculateLine(procedure, date, year.id, state));
  }

  const yearProjections: Record<string, YearProjection> = {};
  const assumptions: Assumption[] = [];
  for (const year of resolved.years) {
    const state = states.get(year.id) as YearState;
    const projectedTotal = year.insurerAlreadyPaidCents + state.maximumConsumed;
    yearProjections[year.id] = {
      planYearId: year.id,
      annualMaximumCents: year.annualMaximumCents,
      reportedInsurerPaidCents: year.insurerAlreadyPaidCents,
      scenarioInsurerPaysCents: state.scenarioInsurerPays,
      projectedTotalInsurerPaidCents: projectedTotal,
      remainingMaximumCents: year.annualMaximumCents - projectedTotal,
      annualDeductibleCents: year.annualDeductibleCents,
      projectedDeductibleMetCents: year.deductibleAlreadyMetCents + state.deductibleApplied,
      assumedPlanTerms: year.assumed,
    };
    if (year.assumed) {
      assumptions.push({
        code: 'UNCHANGED_PLAN_ASSUMED',
        planYearId: year.id,
        message: `Plan year ${year.id} assumes coverage and prices stay unchanged; this is not a verified renewal.`,
      });
    }
    if (year.synthetic) {
      assumptions.push({
        code: 'SYNTHETIC_INPUT',
        planYearId: year.id,
        message: `Plan year ${year.id} uses synthetic sample data, not real plan terms.`,
      });
    }
  }

  const totals = {
    providerChargeCents: sum(lines, 'providerChargeCents'),
    contractualWriteoffCents: sum(lines, 'contractualWriteoffCents'),
    insurerPaysCents: sum(lines, 'insurerPaysCents'),
    patientPaysCents: sum(lines, 'patientPaysCents'),
  };
  if (totals.patientPaysCents + totals.insurerPaysCents + totals.contractualWriteoffCents !== totals.providerChargeCents) {
    throw new EngineInvariantError('Totals do not reconcile to the provider charge');
  }

  return {
    status: 'estimated',
    engineVersion: ENGINE_VERSION,
    caseRevision: ctx.caseRevision,
    schedule: ordered.map(({ procedure, date }) => ({ procedureId: procedure.id, date })),
    lines,
    totals,
    yearProjections,
    assumptions,
    conditional: assumptions.some((a) => a.code === 'UNCHANGED_PLAN_ASSUMED'),
  };
}

function calculateLine(p: ResolvedProcedure, date: string, planYearId: string, state: YearState): CostLine {
  const charge = p.providerChargeCents;
  const allowed = p.allowedCents;
  const writeoff = p.contractualWriteoffCents;

  const deductible = p.deductibleApplies ? Math.min(state.deductibleRemaining, allowed) : 0;
  const candidatePayment = applyRateHalfUp(allowed - deductible, p.insurerRateBps);
  const insurerPays = p.maximumApplies ? Math.min(candidatePayment, state.maximumRemaining) : candidatePayment;
  const patientPays = charge - writeoff - insurerPays;

  const coinsurance = allowed - deductible - candidatePayment;
  const capShortfall = candidatePayment - insurerPays;
  const balanceBill = charge - allowed - writeoff;

  const parts = [deductible, candidatePayment, insurerPays, patientPays, coinsurance, capShortfall, balanceBill];
  if (parts.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new EngineInvariantError(`Negative or unsafe amount calculated for ${p.id}`);
  }
  if (patientPays + insurerPays + writeoff !== charge) {
    throw new EngineInvariantError(`Line ${p.id} does not reconcile to its charge`);
  }
  if (deductible + coinsurance + capShortfall + balanceBill !== patientPays) {
    throw new EngineInvariantError(`Line ${p.id} employee components do not sum to the employee amount`);
  }

  state.deductibleRemaining -= deductible;
  state.deductibleApplied += deductible;
  state.scenarioInsurerPays += insurerPays;
  if (p.maximumApplies) {
    state.maximumRemaining -= insurerPays;
    state.maximumConsumed += insurerPays;
  }

  return {
    procedureId: p.id,
    planYearId,
    date,
    providerChargeCents: charge,
    allowedCents: allowed,
    contractualWriteoffCents: writeoff,
    insurerRateBps: p.insurerRateBps,
    deductibleAppliedCents: deductible,
    coinsuranceCents: coinsurance,
    capShortfallCents: capShortfall,
    balanceBillCents: balanceBill,
    insurerPaysCents: insurerPays,
    patientPaysCents: patientPays,
  };
}

type PlanYearResolution =
  | { kind: 'ok'; years: CompletePlanYear[]; byProcedure: Map<string, CompletePlanYear> }
  | { kind: 'missing'; missing: MissingFact[] };

/** Every scheduled date needs a supplied plan year whose money values are all known. */
function resolvePlanYears(
  planYears: PlanYearRef[],
  ordered: { procedure: ResolvedProcedure; date: string }[],
): PlanYearResolution {
  const missing: MissingFact[] = [];
  const used = new Map<string, PlanYearRef>();
  const procedureYear = new Map<string, string>();
  const uncoveredDates = new Set<string>();

  for (const { procedure, date } of ordered) {
    const py = findPlanYear(planYears, date);
    if (py === undefined) {
      uncoveredDates.add(date);
      continue;
    }
    used.set(py.id, py);
    procedureYear.set(procedure.id, py.id);
  }
  if (uncoveredDates.size > 0) {
    // One question for the user, however many procedures fall outside the supplied plan years.
    missing.push({
      fieldPath: 'planYears',
      code: 'PLAN_YEAR_NOT_SUPPLIED',
      message: `Plan year dates and balances are needed for treatment on ${[...uncoveredDates].join(', ')}.`,
    });
  }

  const complete = new Map<string, CompletePlanYear>();
  const fields = [
    ['annualMaximumCents', 'annual maximum'],
    ['insurerAlreadyPaidCents', 'amount your insurer has already paid'],
    ['annualDeductibleCents', 'annual deductible'],
    ['deductibleAlreadyMetCents', 'deductible already met'],
  ] as const;
  for (const py of planYears.filter((year) => used.has(year.id))) {
    let isComplete = true;
    for (const [field, label] of fields) {
      if (py[field] === null) {
        isComplete = false;
        missing.push({
          fieldPath: `planYears.${py.id}.${field}`,
          code: 'VALUE_UNKNOWN',
          message: `The ${label} for plan year ${py.id} is needed.`,
        });
      }
    }
    if (isComplete) {
      complete.set(py.id, {
        id: py.id,
        annualMaximumCents: py.annualMaximumCents as number,
        insurerAlreadyPaidCents: py.insurerAlreadyPaidCents as number,
        annualDeductibleCents: py.annualDeductibleCents as number,
        deductibleAlreadyMetCents: py.deductibleAlreadyMetCents as number,
        assumed: py.sourceStatus === 'explicit_unchanged_plan_assumption',
        synthetic: py.sourceStatus === 'synthetic_confirmed_input',
      });
    }
  }

  if (missing.length > 0) return { kind: 'missing', missing };
  const byProcedure = new Map(
    [...procedureYear].map(([procedureId, yearId]) => [procedureId, complete.get(yearId) as CompletePlanYear]),
  );
  return { kind: 'ok', years: [...complete.values()], byProcedure };
}

function dateFor(dates: ScheduleDates, procedure: ResolvedProcedure): string {
  const date = dates.get(procedure.id);
  if (date === undefined) throw new EngineInvariantError(`Schedule has no date for ${procedure.id}`);
  return date;
}

function sum<K extends keyof CostLine>(lines: CostLine[], key: K): number {
  return lines.reduce((total, line) => total + (line[key] as number), 0);
}
