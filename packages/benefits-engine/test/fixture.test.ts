import { ScenarioComparisonResultSchema, EstimateResultSchema } from '@actionbridge/contracts';
import { compareSchedules, estimateCase, estimateSchedule, ENGINE_VERSION } from '@actionbridge/benefits-engine';
import { describe, expect, it } from 'vitest';
import { expectEstimated, expectReconciles, fixtureCase, lineFor, loadFixture, type FixtureScenario } from './helpers.js';

const { scenarios } = loadFixture();
const scenario = (id: string) => scenarios.find((s) => s.id === id) as FixtureScenario;

describe('Q-01 regression fixture (docs/fixtures/dental-regression.json)', () => {
  for (const fixtureScenario of scenarios) {
    it(`matches every line, total and plan year for "${fixtureScenario.id}"`, () => {
      const result = estimateSchedule(fixtureCase(), fixtureScenario.schedule);
      expectEstimated(result);
      expectReconciles(result);
      const { expected } = fixtureScenario;

      expect(result.totals).toEqual({
        providerChargeCents: expected.providerChargeCents,
        contractualWriteoffCents: expected.contractualWriteoffCents,
        insurerPaysCents: expected.insurerPaysCents,
        patientPaysCents: expected.patientPaysCents,
      });
      expect(result.lines.map((l) => l.procedureId)).toEqual(expected.lines.map((l) => l.procedureId));
      for (const line of expected.lines) {
        expect(lineFor(result, line.procedureId)).toMatchObject(line);
      }
      expect(Object.keys(result.yearProjections)).toEqual(Object.keys(expected.yearProjections));
      for (const [planYearId, projection] of Object.entries(expected.yearProjections)) {
        expect(result.yearProjections[planYearId]).toMatchObject(projection);
      }
      expect(result.engineVersion).toBe(ENGINE_VERSION);
      expect(result.caseRevision).toBe(1);
      expect(EstimateResultSchema.parse(result)).toEqual(result);
    });
  }

  it('baseline employee 120000, alternative 72500, difference 47500 cents', () => {
    const result = compareSchedules(fixtureCase());
    expect(result.status).toBe('estimated');
    if (result.status !== 'estimated') return;

    expect(result.outcome).toBe('alternatives_found');
    expect(result.baseline.estimate.totals.patientPaysCents).toBe(120000);
    expect(result.baseline.schedule).toEqual(scenario('baseline').schedule);
    expect(result.baseline.differenceFromBaselineCents).toBe(0);

    expect(result.alternatives).toHaveLength(1);
    const [alternative] = result.alternatives;
    expect(alternative?.schedule).toEqual(scenario('split-across-reset').schedule);
    expect(alternative?.estimate.totals.patientPaysCents).toBe(72500);
    expect(alternative?.differenceFromBaselineCents).toBe(47500);
    expect(alternative?.movedProcedureIds).toEqual(['crown-1']);
    expect(alternative?.conditional).toBe(true);
    expect(alternative?.estimate.assumptions).toContainEqual(
      expect.objectContaining({ code: 'UNCHANGED_PLAN_ASSUMED', planYearId: 'py-2027' }),
    );

    expect(result.search).toMatchObject({
      flexibleProcedureIds: ['crown-1'],
      evaluatedAssignments: 2,
      feasibleAssignments: 2,
      maxAssignments: 64,
    });
    expect(result.limitations).toEqual([]);
    expect(ScenarioComparisonResultSchema.parse(result)).toEqual(result);
  });

  it('baseline estimate is not conditional: everything stays in the confirmed plan year', () => {
    const result = estimateCase(fixtureCase());
    expectEstimated(result);
    expect(result.totals.patientPaysCents).toBe(120000);
    expect(result.conditional).toBe(false);
  });
});

describe('Q-17 projected benefits never change reported insurer-paid usage', () => {
  it('leaves the input untouched and reports the original paid amount in every projection', () => {
    const input = fixtureCase();
    const snapshot = structuredClone(input);

    const comparison = compareSchedules(input);
    estimateCase(input);

    expect(input).toEqual(snapshot);
    expect(comparison.status).toBe('estimated');
    if (comparison.status !== 'estimated') return;
    for (const s of [comparison.baseline, ...comparison.alternatives]) {
      expect(s.estimate.yearProjections['py-2026']?.reportedInsurerPaidCents).toBe(50000);
    }
  });

  it('never combines two plan years into one annual-maximum figure', () => {
    const result = estimateSchedule(fixtureCase(), scenario('split-across-reset').schedule);
    expectEstimated(result);
    expect(result.yearProjections['py-2026']?.projectedTotalInsurerPaidCents).toBe(80000);
    expect(result.yearProjections['py-2027']?.projectedTotalInsurerPaidCents).toBe(47500);
    expect(result.yearProjections['py-2027']?.remainingMaximumCents).toBe(32500);
  });
});
