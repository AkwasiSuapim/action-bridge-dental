import type {
  DentalCaseInput,
  ErrorIssue,
  EstimateResult,
  NeedsInformationResult,
  ScheduleEntry,
  UnsupportedResult,
} from '@actionbridge/contracts';
import { calculateSchedule } from './calculate.js';
import { checkCase, type CaseCheck, type CaseContext } from './case-check.js';
import { ENGINE_VERSION } from './version.js';

/** Well-formed but contradictory input. The API maps this to HTTP 422 (decision D-02). */
export interface InvalidResult {
  status: 'invalid';
  engineVersion: string;
  caseRevision: number;
  issues: ErrorIssue[];
}

export type EngineEstimateResult = EstimateResult | InvalidResult;

/** Estimate the case at its baseline schedule: each procedure's proposed (or earliest) date. */
export function estimateCase(input: DentalCaseInput): EngineEstimateResult {
  const check = checkCase(input);
  if (check.kind !== 'ok') return notEstimated(check, input.caseRevision);
  return calculateSchedule(check.ctx, baselineDates(check.ctx));
}

/**
 * Estimate an explicit schedule. Every procedure must appear once, on a permitted date:
 * inside its dentist window when it has one, otherwise on its baseline date.
 */
export function estimateSchedule(input: DentalCaseInput, schedule: ScheduleEntry[]): EngineEstimateResult {
  const check = checkCase(input);
  if (check.kind !== 'ok') return notEstimated(check, input.caseRevision);

  const issues = checkSchedulePermitted(check.ctx, schedule);
  if (issues.length > 0) {
    return { status: 'invalid', engineVersion: ENGINE_VERSION, caseRevision: input.caseRevision, issues };
  }
  return calculateSchedule(check.ctx, new Map(schedule.map((e) => [e.procedureId, e.date])));
}

export function baselineDates(ctx: CaseContext): Map<string, string> {
  return new Map(ctx.procedures.map((p) => [p.id, p.baselineDate]));
}

export function prerequisitesSatisfied(ctx: CaseContext, dates: ReadonlyMap<string, string>): boolean {
  return ctx.procedures.every((p) =>
    p.prerequisiteIds.every((prereq) => (dates.get(prereq) as string) <= (dates.get(p.id) as string)),
  );
}

export function notEstimated(
  check: Exclude<CaseCheck, { kind: 'ok' }>,
  caseRevision: number,
): InvalidResult | NeedsInformationResult | UnsupportedResult {
  const meta = { engineVersion: ENGINE_VERSION, caseRevision };
  switch (check.kind) {
    case 'invalid':
      return { status: 'invalid', ...meta, issues: check.issues };
    case 'unsupported':
      return { status: 'unsupported', ...meta, limitations: check.limitations };
    case 'needs_information':
      return { status: 'needs_information', ...meta, missing: check.missing };
  }
}

function checkSchedulePermitted(ctx: CaseContext, schedule: ScheduleEntry[]): ErrorIssue[] {
  const issues: ErrorIssue[] = [];
  const byId = new Map(ctx.procedures.map((p) => [p.id, p]));
  const seen = new Set<string>();

  for (const entry of schedule) {
    const procedure = byId.get(entry.procedureId);
    const path = `procedures.${entry.procedureId}`;
    if (procedure === undefined) {
      issues.push({ fieldPath: path, code: 'UNKNOWN_PROCEDURE', message: `${entry.procedureId} is not in this case.` });
      continue;
    }
    if (seen.has(entry.procedureId)) {
      issues.push({ fieldPath: path, code: 'DUPLICATE_SCHEDULE_ENTRY', message: `${entry.procedureId} is scheduled twice.` });
    }
    seen.add(entry.procedureId);

    const permitted = procedure.window
      ? procedure.window.earliest <= entry.date && entry.date <= procedure.window.latest
      : entry.date === procedure.baselineDate;
    if (!permitted) {
      issues.push({
        fieldPath: `${path}.proposedDate`,
        code: 'DATE_NOT_PERMITTED',
        message: `${entry.date} is not a dentist-permitted date for ${entry.procedureId}.`,
      });
    }
  }
  for (const p of ctx.procedures) {
    if (!seen.has(p.id)) {
      issues.push({ fieldPath: `procedures.${p.id}`, code: 'MISSING_SCHEDULE_ENTRY', message: `${p.id} has no scheduled date.` });
    }
  }
  if (issues.length === 0 && !prerequisitesSatisfied(ctx, new Map(schedule.map((e) => [e.procedureId, e.date])))) {
    issues.push({ fieldPath: 'procedures', code: 'PREREQUISITE_ORDER', message: 'A prerequisite is scheduled after the procedure that depends on it.' });
  }
  return issues;
}
