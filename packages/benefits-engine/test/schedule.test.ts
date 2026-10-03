import type { DentalCaseInput, Procedure, ScenarioComparison } from '@actionbridge/contracts';
import { compareSchedules, estimateSchedule } from '@actionbridge/benefits-engine';
import { describe, expect, it } from 'vitest';
import { caseWith, expectEstimated, expectReconciles, fixtureCase, planYear, procedure } from './helpers.js';

function compared(input: DentalCaseInput): ScenarioComparison {
  const result = compareSchedules(input);
  if (result.status !== 'estimated') throw new Error(`Expected a comparison, got ${result.status}`);
  for (const s of [result.baseline, ...result.alternatives]) expectReconciles(s.estimate);
  return result;
}
const crown = (input: DentalCaseInput) => input.procedures.find((p) => p.id === 'crown-1') as Procedure;

describe('Q-04 benefit year resetting in a month other than January', () => {
  const planYears = {
    'py-2026-27': planYear({ startDate: '2026-07-01', endDate: '2027-06-30', insurerAlreadyPaidCents: 140000 }),
    'py-2027-28': planYear({ startDate: '2027-07-01', endDate: '2028-06-30', sourceStatus: 'explicit_unchanged_plan_assumption' }),
  };
  const julyCrown = procedure({
    id: 'crown',
    category: 'major',
    providerChargeCents: 100000,
    allowedCents: 100000,
    proposedDate: '2027-06-15',
    dentistEarliestDate: '2027-06-15',
    dentistLatestDate: '2027-08-31',
  });

  it('uses the actual plan year, not the calendar year, and resets on July 1', () => {
    const result = compared(caseWith([julyCrown], planYears));

    expect(result.baseline.estimate.lines[0]).toMatchObject({ planYearId: 'py-2026-27', insurerPaysCents: 10000, patientPaysCents: 90000 });
    const [alternative] = result.alternatives;
    expect(alternative?.schedule).toEqual([{ procedureId: 'crown', date: '2027-07-01' }]);
    expect(alternative?.estimate.lines[0]).toMatchObject({
      planYearId: 'py-2027-28',
      deductibleAppliedCents: 5000,
      insurerPaysCents: 47500,
      patientPaysCents: 52500,
    });
    expect(alternative?.differenceFromBaselineCents).toBe(37500);
    expect(alternative?.conditional).toBe(true);
  });
});

describe('Q-05 next plan year unknown', () => {
  it('blocks the comparison when next-year terms were not supplied', () => {
    const input = fixtureCase();
    delete input.planYears['py-2027'];
    const result = compared(input);

    expect(result.outcome).toBe('comparison_incomplete');
    expect(result.alternatives).toEqual([]);
    expect(result.limitations).toEqual([expect.objectContaining({ code: 'NEXT_PLAN_YEAR_NOT_SUPPLIED', procedureId: 'crown-1' })]);
    expect(result.baseline.estimate.totals.patientPaysCents).toBe(120000);
  });

  it('blocks the comparison when next-year values are incomplete', () => {
    const input = fixtureCase();
    input.planYears['py-2027']!.annualDeductibleCents = null;
    const result = compared(input);

    expect(result.outcome).toBe('comparison_incomplete');
    expect(result.alternatives).toEqual([]);
    expect(result.limitations).toEqual([
      expect.objectContaining({ code: 'NEXT_PLAN_YEAR_INCOMPLETE', fieldPath: 'planYears.py-2027.annualDeductibleCents' }),
    ]);
  });

  it('labels an explicitly assumed unchanged plan as conditional (see fixture test)', () => {
    const [alternative] = compared(fixtureCase()).alternatives;
    expect(alternative?.conditional).toBe(true);
  });
});

describe('Q-09 fixed dates are never moved, even when cheaper', () => {
  it('no dentist window → no alternative', () => {
    const input = fixtureCase();
    crown(input).dentistLatestDate = '2026-11-12';
    const result = compared(input);
    expect(result.outcome).toBe('no_flexible_timing');
    expect(result.alternatives).toEqual([]);
  });

  it('a window the user reported (not the dentist) does not permit a move', () => {
    const input = fixtureCase();
    crown(input).timingSource = 'user_reported';
    expect(compared(input).alternatives).toEqual([]);
  });

  it('an explicit schedule outside the permitted dates is rejected', () => {
    const input = fixtureCase();
    crown(input).dentistLatestDate = '2026-11-12';
    const result = estimateSchedule(input, [
      { procedureId: 'filling-1', date: '2026-11-10' },
      { procedureId: 'filling-2', date: '2026-11-11' },
      { procedureId: 'crown-1', date: '2027-01-01' },
    ]);
    expect(result).toMatchObject({ status: 'invalid', issues: [{ code: 'DATE_NOT_PERMITTED' }] });
  });

  it('an explicit schedule must include every procedure exactly once', () => {
    const result = estimateSchedule(fixtureCase(), [
      { procedureId: 'filling-1', date: '2026-11-10' },
      { procedureId: 'filling-1', date: '2026-11-10' },
      { procedureId: 'crown-1', date: '2026-11-12' },
    ]);
    expect(result.status).toBe('invalid');
    expect(result).toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'DUPLICATE_SCHEDULE_ENTRY' }),
        expect.objectContaining({ code: 'MISSING_SCHEDULE_ENTRY' }),
      ]),
    });
  });
});

describe('Q-10 dependency cycles and invalid dates', () => {
  it('rejects a prerequisite cycle with an actionable error', () => {
    const input = caseWith([
      procedure({ id: 'a', prerequisiteIds: ['b'] }),
      procedure({ id: 'b', prerequisiteIds: ['a'] }),
    ]);
    expect(compareSchedules(input)).toMatchObject({ status: 'invalid', issues: [{ code: 'DEPENDENCY_CYCLE', fieldPath: 'procedures' }] });
  });

  it('rejects unknown and self prerequisites', () => {
    expect(compareSchedules(caseWith([procedure({ id: 'a', prerequisiteIds: ['ghost'] })]))).toMatchObject({
      issues: [{ code: 'UNKNOWN_PREREQUISITE' }],
    });
    expect(compareSchedules(caseWith([procedure({ id: 'a', prerequisiteIds: ['a'] })]))).toMatchObject({
      issues: [{ code: 'SELF_PREREQUISITE' }],
    });
  });

  it('rejects a dentist window that ends before it starts', () => {
    const input = fixtureCase();
    crown(input).dentistLatestDate = '2026-11-01';
    expect(compareSchedules(input)).toMatchObject({
      status: 'invalid',
      issues: expect.arrayContaining([expect.objectContaining({ code: 'WINDOW_ENDS_BEFORE_START' })]),
    });
  });

  it('rejects a baseline that schedules a prerequisite after its dependant', () => {
    const input = caseWith([
      procedure({ id: 'buildup', proposedDate: '2026-11-20' }),
      procedure({ id: 'crown', proposedDate: '2026-11-10', prerequisiteIds: ['buildup'] }),
    ]);
    expect(compareSchedules(input)).toMatchObject({ status: 'invalid', issues: [{ code: 'PREREQUISITE_SCHEDULED_AFTER' }] });
  });
});

describe('Q-11 no cheaper feasible alternative', () => {
  it('returns an honest no-alternative result instead of forcing a "best savings" card', () => {
    const input = fixtureCase();
    Object.assign(input.planYears['py-2026']!, { annualMaximumCents: 150000, insurerAlreadyPaidCents: 0 });
    const result = compared(input);

    // Baseline 64000; moving the crown would cost 66500 because of next year's deductible.
    expect(result.baseline.estimate.totals.patientPaysCents).toBe(64000);
    expect(result.outcome).toBe('no_lower_cost_alternative');
    expect(result.alternatives).toEqual([]);
    expect(result.search.evaluatedAssignments).toBe(2);
  });
});

describe('prerequisites constrain candidate schedules', () => {
  it('never schedules a dependant before its prerequisite; same-day ties follow prerequisite order', () => {
    const input = caseWith([
      procedure({
        id: 'crown',
        category: 'major',
        providerChargeCents: 100000,
        allowedCents: 100000,
        proposedDate: '2026-12-15',
        dentistEarliestDate: '2026-12-15',
        dentistLatestDate: '2027-02-28',
        prerequisiteIds: ['buildup'],
      }),
      procedure({
        id: 'buildup',
        providerChargeCents: 20000,
        allowedCents: 20000,
        proposedDate: '2026-12-01',
        dentistEarliestDate: '2026-12-01',
        dentistLatestDate: '2027-01-31',
      }),
    ]);
    const result = compared(input);

    // Four assignments; moving only the build-up would place it after the crown.
    expect(result.search).toMatchObject({ evaluatedAssignments: 4, feasibleAssignments: 3 });
    for (const s of [result.baseline, ...result.alternatives]) {
      const ids = s.schedule.map((e) => e.procedureId);
      expect(ids.indexOf('buildup')).toBeLessThan(ids.indexOf('crown'));
    }
    const bothMoved = result.alternatives.find((a) => a.movedProcedureIds.length === 2);
    expect(bothMoved?.schedule).toEqual([
      { procedureId: 'buildup', date: '2027-01-01' },
      { procedureId: 'crown', date: '2027-01-01' },
    ]);
  });
});

describe('ranking and de-duplication', () => {
  it('drops financially equivalent alternatives and ranks by employee cost, then fewest moves', () => {
    const window = { proposedDate: '2026-11-12', dentistEarliestDate: '2026-11-12', dentistLatestDate: '2027-01-15' };
    const input = caseWith([
      procedure({ id: 'crown-a', category: 'major', providerChargeCents: 100000, allowedCents: 100000, ...window }),
      procedure({ id: 'crown-b', category: 'major', providerChargeCents: 100000, allowedCents: 100000, ...window }),
    ]);
    input.planYears['py-2026']!.insurerAlreadyPaidCents = 80000;
    const result = compared(input);

    expect(result.baseline.estimate.totals.patientPaysCents).toBe(200000);
    expect(result.alternatives.map((a) => [a.scenarioId, a.movedProcedureIds, a.estimate.totals.patientPaysCents])).toEqual([
      ['alt-1', ['crown-a', 'crown-b'], 120000],
      ['alt-2', ['crown-a'], 152500],
    ]);
  });

  it('estimates an explicit permitted schedule directly', () => {
    const result = estimateSchedule(fixtureCase(), [
      { procedureId: 'crown-1', date: '2027-01-15' },
      { procedureId: 'filling-1', date: '2026-11-10' },
      { procedureId: 'filling-2', date: '2026-11-11' },
    ]);
    expectEstimated(result);
    expect(result.schedule.map((e) => e.procedureId)).toEqual(['filling-1', 'filling-2', 'crown-1']);
    expect(result.totals.patientPaysCents).toBe(72500);
  });
});
