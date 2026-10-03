import type {
  DentalCaseInput,
  ErrorIssue,
  Limitation,
  MissingFact,
  PlanYear,
  Policy,
  Procedure,
} from '@actionbridge/contracts';
import { MAX_PROCEDURES } from './version.js';

export interface PlanYearRef extends PlanYear {
  id: string;
}

/** A procedure whose calculation-critical fields are all known. */
export interface ResolvedProcedure {
  id: string;
  inputIndex: number;
  /** Position in a stable topological order; the same-day tie-breaker. */
  topoIndex: number;
  prerequisiteIds: string[];
  baselineDate: string;
  /** Present only for a dentist-supplied window with earliest < latest. */
  window: { earliest: string; latest: string } | null;
  providerChargeCents: number;
  allowedCents: number;
  contractualWriteoffCents: number;
  insurerRateBps: number;
  deductibleApplies: boolean;
  maximumApplies: boolean;
}

export interface CaseContext {
  caseRevision: number;
  planYears: PlanYearRef[];
  /** In topological order. */
  procedures: ResolvedProcedure[];
}

export type CaseCheck =
  | { kind: 'ok'; ctx: CaseContext }
  | { kind: 'invalid'; issues: ErrorIssue[] }
  | { kind: 'unsupported'; limitations: Limitation[] }
  | { kind: 'needs_information'; missing: MissingFact[] };

const DENTIST_TIMING_SOURCES = new Set(['dentist_supplied', 'fictional_dentist_supplied']);

/**
 * Schedule-independent checks, in order of precedence:
 * contradictions (422) → unsupported plan structure → missing critical facts.
 */
export function checkCase(input: DentalCaseInput): CaseCheck {
  const issues = findContradictions(input);
  if (issues.length > 0) return { kind: 'invalid', issues };

  const limitations = findUnsupported(input);
  if (limitations.length > 0) return { kind: 'unsupported', limitations };

  const missing = findMissing(input);
  if (missing.length > 0) return { kind: 'needs_information', missing };

  // findMissing guarantees policy and all procedure values below are non-null.
  const policy = input.policy as Policy;
  const topoOrder = topologicalOrder(input.procedures) as string[];
  const procedures = topoOrder.map((id, topoIndex) => {
    const inputIndex = input.procedures.findIndex((p) => p.id === id);
    return resolveProcedure(input.procedures[inputIndex] as Procedure, inputIndex, topoIndex, policy);
  });

  return {
    kind: 'ok',
    ctx: {
      caseRevision: input.caseRevision,
      planYears: sortedPlanYears(input),
      procedures,
    },
  };
}

export function sortedPlanYears(input: DentalCaseInput): PlanYearRef[] {
  return Object.entries(input.planYears)
    .map(([id, planYear]) => ({ id, ...planYear }))
    .sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0));
}

export function findPlanYear(planYears: PlanYearRef[], date: string): PlanYearRef | undefined {
  return planYears.find((py) => py.startDate <= date && date <= py.endDate);
}

function resolveProcedure(
  p: Procedure,
  inputIndex: number,
  topoIndex: number,
  policy: Policy,
): ResolvedProcedure {
  const flexible =
    DENTIST_TIMING_SOURCES.has(p.timingSource) &&
    p.dentistEarliestDate !== null &&
    p.dentistLatestDate !== null &&
    p.dentistEarliestDate < p.dentistLatestDate;

  return {
    id: p.id,
    inputIndex,
    topoIndex,
    prerequisiteIds: [...new Set(p.prerequisiteIds)],
    baselineDate: (p.proposedDate ?? p.dentistEarliestDate) as string,
    window: flexible
      ? { earliest: p.dentistEarliestDate as string, latest: p.dentistLatestDate as string }
      : null,
    providerChargeCents: p.providerChargeCents as number,
    allowedCents: p.allowedCents as number,
    contractualWriteoffCents: p.contractualWriteoffCents as number,
    insurerRateBps: policy.insurerRateBpsByCategory[p.category] as number,
    deductibleApplies: policy.deductibleAppliesByCategory[p.category] as boolean,
    maximumApplies: policy.annualMaximumAppliesByCategory[p.category] as boolean,
  };
}

function findContradictions(input: DentalCaseInput): ErrorIssue[] {
  const issues: ErrorIssue[] = [];
  const issue = (fieldPath: string | null, code: string, message: string) =>
    issues.push({ fieldPath, code, message });

  const planYears = sortedPlanYears(input);
  for (const py of planYears) {
    const path = `planYears.${py.id}`;
    if (py.startDate > py.endDate) {
      issue(`${path}.endDate`, 'PLAN_YEAR_ENDS_BEFORE_START', `Plan year ${py.id} ends before it starts.`);
    }
    if (
      py.annualDeductibleCents !== null &&
      py.deductibleAlreadyMetCents !== null &&
      py.deductibleAlreadyMetCents > py.annualDeductibleCents
    ) {
      issue(
        `${path}.deductibleAlreadyMetCents`,
        'DEDUCTIBLE_MET_EXCEEDS_DEDUCTIBLE',
        'Deductible already met is larger than the annual deductible.',
      );
    }
    if (
      py.annualMaximumCents !== null &&
      py.insurerAlreadyPaidCents !== null &&
      py.insurerAlreadyPaidCents > py.annualMaximumCents
    ) {
      issue(
        `${path}.insurerAlreadyPaidCents`,
        'PAID_EXCEEDS_MAXIMUM',
        'Insurer already paid is larger than the annual maximum.',
      );
    }
  }
  for (let i = 1; i < planYears.length; i++) {
    const prev = planYears[i - 1] as PlanYearRef;
    const curr = planYears[i] as PlanYearRef;
    if (curr.startDate <= prev.endDate) {
      issue(`planYears.${curr.id}.startDate`, 'PLAN_YEARS_OVERLAP', `Plan years ${prev.id} and ${curr.id} overlap.`);
    }
  }

  const ids = new Set<string>();
  for (const p of input.procedures) {
    const path = `procedures.${p.id}`;
    if (ids.has(p.id)) issue(path, 'DUPLICATE_PROCEDURE_ID', `Procedure ID ${p.id} is used more than once.`);
    ids.add(p.id);

    if (p.providerChargeCents !== null && p.allowedCents !== null && p.allowedCents > p.providerChargeCents) {
      issue(`${path}.allowedCents`, 'ALLOWED_EXCEEDS_CHARGE', 'Allowed amount is larger than the provider charge.');
    } else if (
      p.providerChargeCents !== null &&
      p.allowedCents !== null &&
      p.contractualWriteoffCents !== null &&
      p.contractualWriteoffCents > p.providerChargeCents - p.allowedCents
    ) {
      issue(
        `${path}.contractualWriteoffCents`,
        'WRITEOFF_EXCEEDS_CHARGE_MINUS_ALLOWED',
        'Contractual write-off cannot exceed the charge minus the allowed amount.',
      );
    }
    const { dentistEarliestDate: earliest, dentistLatestDate: latest, proposedDate } = p;
    if (earliest !== null && latest !== null && earliest > latest) {
      issue(`${path}.dentistLatestDate`, 'WINDOW_ENDS_BEFORE_START', 'The dentist window ends before it starts.');
    }
    if (proposedDate !== null && ((earliest !== null && proposedDate < earliest) || (latest !== null && proposedDate > latest))) {
      issue(`${path}.proposedDate`, 'PROPOSED_DATE_OUTSIDE_WINDOW', 'The proposed date is outside the dentist window.');
    }
  }

  for (const p of input.procedures) {
    for (const prereq of p.prerequisiteIds) {
      if (prereq === p.id) {
        issue(`procedures.${p.id}.prerequisiteIds`, 'SELF_PREREQUISITE', 'A procedure cannot be its own prerequisite.');
      } else if (!ids.has(prereq)) {
        issue(`procedures.${p.id}.prerequisiteIds`, 'UNKNOWN_PREREQUISITE', `Prerequisite ${prereq} is not in this case.`);
      }
    }
  }

  if (issues.length === 0 && topologicalOrder(input.procedures) === null) {
    issue('procedures', 'DEPENDENCY_CYCLE', 'Procedure prerequisites form a cycle.');
  }
  if (issues.length === 0) {
    for (const p of input.procedures) {
      for (const prereq of p.prerequisiteIds) {
        const before = input.procedures.find((q) => q.id === prereq) as Procedure;
        const beforeDate = before.proposedDate ?? before.dentistEarliestDate;
        const afterDate = p.proposedDate ?? p.dentistEarliestDate;
        if (beforeDate !== null && afterDate !== null && beforeDate > afterDate) {
          issue(
            `procedures.${p.id}.proposedDate`,
            'PREREQUISITE_SCHEDULED_AFTER',
            `Prerequisite ${prereq} is scheduled after ${p.id}.`,
          );
        }
      }
    }
  }
  return issues;
}

function findUnsupported(input: DentalCaseInput): Limitation[] {
  const limitations: Limitation[] = [];
  if (input.procedures.length > MAX_PROCEDURES) {
    limitations.push({
      code: 'TOO_MANY_PROCEDURES',
      message: `This version estimates up to ${MAX_PROCEDURES} procedures at a time.`,
      fieldPath: 'procedures',
    });
  }
  if (input.coverageMode === 'self_pay') {
    limitations.push({
      code: 'NOT_INSURED',
      message: 'This case is marked self-pay, so there is no insurance estimate. Compare the dentist’s cash quote instead.',
      fieldPath: 'coverageMode',
    });
    return limitations;
  }
  const policy = input.policy;
  if (policy === null) return limitations;

  if (!policy.deductibleBeforeCoinsurance) {
    limitations.push({
      code: 'DEDUCTIBLE_AFTER_COINSURANCE_UNSUPPORTED',
      message: 'Only plans that apply the deductible before coinsurance are supported.',
      fieldPath: 'policy.deductibleBeforeCoinsurance',
    });
  }
  if (!policy.allServicesCovered) {
    limitations.push({
      code: 'PARTIAL_COVERAGE_UNSUPPORTED',
      message: 'This plan does not cover every listed service; coverage per service cannot be confirmed yet.',
      fieldPath: 'policy.allServicesCovered',
    });
  }
  const restrictionKinds = [
    ['waitingPeriods', 'WAITING_PERIOD_UNSUPPORTED', 'Waiting periods'],
    ['exclusions', 'EXCLUSION_UNSUPPORTED', 'Exclusions'],
    ['frequencyRestrictions', 'FREQUENCY_RESTRICTION_UNSUPPORTED', 'Frequency limits'],
  ] as const;
  for (const [field, code, label] of restrictionKinds) {
    if (policy[field].length > 0) {
      limitations.push({
        code,
        message: `${label} are not evaluated yet, so coverage cannot be estimated without risking a false result.`,
        fieldPath: `policy.${field}`,
      });
    }
  }
  for (const p of input.procedures) {
    if (policy.insurerRateBpsByCategory[p.category] === undefined) {
      limitations.push({
        code: 'CATEGORY_NOT_IN_POLICY',
        message: `The plan does not list a coverage rate for category "${p.category}".`,
        fieldPath: `procedures.${p.id}.category`,
        procedureId: p.id,
      });
    }
  }
  return limitations;
}

function findMissing(input: DentalCaseInput): MissingFact[] {
  const missing: MissingFact[] = [];
  if (input.coverageMode === 'unknown') {
    missing.push({
      fieldPath: 'coverageMode',
      code: 'COVERAGE_MODE_UNKNOWN',
      message: 'Whether you have dental insurance for this treatment is needed.',
    });
  }
  if (input.policy === null) {
    missing.push({ fieldPath: 'policy', code: 'POLICY_NOT_SUPPLIED', message: 'Plan coverage rules are needed.' });
  }
  if (input.procedures.length === 0) {
    missing.push({ fieldPath: 'procedures', code: 'NO_PROCEDURES', message: 'Add at least one recommended procedure.' });
  }
  for (const p of input.procedures) {
    const path = `procedures.${p.id}`;
    const values = [
      ['providerChargeCents', 'The dentist’s charge for this procedure is needed.'],
      ['allowedCents', 'The plan’s allowed amount for this procedure is needed.'],
      ['contractualWriteoffCents', 'Whether the provider writes off part of the charge is needed.'],
    ] as const;
    for (const [field, message] of values) {
      if (p[field] === null) missing.push({ fieldPath: `${path}.${field}`, code: 'VALUE_UNKNOWN', message });
    }
    if (p.network === 'unknown') {
      missing.push({
        fieldPath: `${path}.network`,
        code: 'NETWORK_UNKNOWN',
        message: 'Whether this provider is in network for your plan is needed.',
      });
    }
    if (p.proposedDate === null && p.dentistEarliestDate === null) {
      missing.push({ fieldPath: `${path}.proposedDate`, code: 'DATE_UNKNOWN', message: 'A planned treatment date is needed.' });
    }
    if (input.policy !== null && input.policy.insurerRateBpsByCategory[p.category] !== undefined) {
      if (input.policy.deductibleAppliesByCategory[p.category] === undefined) {
        missing.push({
          fieldPath: `policy.deductibleAppliesByCategory.${p.category}`,
          code: 'POLICY_CATEGORY_RULE_MISSING',
          message: `Whether the deductible applies to ${p.category} services is needed.`,
        });
      }
      if (input.policy.annualMaximumAppliesByCategory[p.category] === undefined) {
        missing.push({
          fieldPath: `policy.annualMaximumAppliesByCategory.${p.category}`,
          code: 'POLICY_CATEGORY_RULE_MISSING',
          message: `Whether ${p.category} services count toward the annual maximum is needed.`,
        });
      }
    }
  }
  // Two procedures in one category would report the same policy rule twice.
  const seen = new Set<string>();
  return missing.filter((m) => (seen.has(m.fieldPath) ? false : (seen.add(m.fieldPath), true)));
}

/** Kahn's algorithm, always taking the earliest-listed ready procedure. Returns null on a cycle. */
function topologicalOrder(procedures: Procedure[]): string[] | null {
  const remaining = new Map(procedures.map((p) => [p.id, new Set(p.prerequisiteIds)]));
  const order: string[] = [];
  while (remaining.size > 0) {
    const next = procedures.find((p) => {
      const prereqs = remaining.get(p.id);
      return prereqs !== undefined && [...prereqs].every((id) => !remaining.has(id));
    });
    if (next === undefined) return null;
    order.push(next.id);
    remaining.delete(next.id);
  }
  return order;
}
