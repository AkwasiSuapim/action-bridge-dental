import { readFileSync } from 'node:fs';
import {
  DentalCaseInputSchema,
  type CostLine,
  type DentalCaseInput,
  type EstimatedResult,
  type PlanYear,
  type Procedure,
} from '@actionbridge/contracts';
import { expect } from 'vitest';

const FIXTURE_URL = new URL('../../../docs/fixtures/dental-regression.json', import.meta.url);

export interface FixtureLine {
  procedureId: string;
  planYearId: string;
  deductibleAppliedCents: number;
  insurerPaysCents: number;
  patientPaysCents: number;
}

export interface FixtureScenario {
  id: string;
  schedule: { procedureId: string; date: string }[];
  expected: {
    providerChargeCents: number;
    insurerPaysCents: number;
    patientPaysCents: number;
    contractualWriteoffCents: number;
    differenceFromBaselineCents?: number;
    lines: FixtureLine[];
    yearProjections: Record<
      string,
      { scenarioInsurerPaysCents: number; projectedTotalInsurerPaidCents: number; remainingMaximumCents: number }
    >;
  };
}

export function loadFixture(): { input: DentalCaseInput; scenarios: FixtureScenario[] } {
  const raw = JSON.parse(readFileSync(FIXTURE_URL, 'utf8')) as Record<string, unknown>;
  const input = DentalCaseInputSchema.parse({
    caseRevision: raw.caseRevision,
    currency: raw.currency,
    coverageMode: raw.coverageMode,
    policy: raw.policy,
    planYears: raw.planYears,
    procedures: raw.procedures,
  });
  return { input, scenarios: raw.scenarios as FixtureScenario[] };
}

/** A fresh, independently mutable copy of the fixture case. */
export function fixtureCase(): DentalCaseInput {
  return structuredClone(loadFixture().input);
}

/** A complete, fixed-date, in-network procedure; override any field. */
export function procedure(overrides: Partial<Procedure> & Pick<Procedure, 'id'>): Procedure {
  return {
    label: overrides.id,
    cdtCode: null,
    category: 'basic',
    network: 'in',
    providerChargeCents: 10000,
    allowedCents: 10000,
    contractualWriteoffCents: 0,
    proposedDate: '2026-03-01',
    dentistEarliestDate: null,
    dentistLatestDate: null,
    timingSource: 'dentist_supplied',
    prerequisiteIds: [],
    ...overrides,
  };
}

export function planYear(overrides: Partial<PlanYear> & Pick<PlanYear, 'startDate' | 'endDate'>): PlanYear {
  return {
    annualMaximumCents: 150000,
    insurerAlreadyPaidCents: 0,
    annualDeductibleCents: 5000,
    deductibleAlreadyMetCents: 0,
    sourceStatus: 'synthetic_confirmed_input',
    ...overrides,
  };
}

/** Fixture policy and plan years with the given procedures. */
export function caseWith(procedures: Procedure[], planYears?: Record<string, PlanYear>): DentalCaseInput {
  const base = fixtureCase();
  return { ...base, procedures, planYears: planYears ?? base.planYears };
}

export function expectEstimated(result: { status: string }): asserts result is EstimatedResult {
  expect(result.status).toBe('estimated');
}

/** Every line and the totals reconcile exactly (system design §5 step 7). */
export function expectReconciles(result: EstimatedResult): void {
  for (const line of result.lines) {
    expect(line.patientPaysCents + line.insurerPaysCents + line.contractualWriteoffCents).toBe(line.providerChargeCents);
    expect(
      line.deductibleAppliedCents + line.coinsuranceCents + line.capShortfallCents + line.balanceBillCents,
    ).toBe(line.patientPaysCents);
  }
  const total = (key: keyof CostLine) => result.lines.reduce((sum, line) => sum + (line[key] as number), 0);
  expect(result.totals.patientPaysCents).toBe(total('patientPaysCents'));
  expect(result.totals.insurerPaysCents).toBe(total('insurerPaysCents'));
  expect(result.totals.providerChargeCents).toBe(total('providerChargeCents'));
  expect(result.totals.contractualWriteoffCents).toBe(total('contractualWriteoffCents'));
}

export function lineFor(result: EstimatedResult, procedureId: string): CostLine {
  const line = result.lines.find((l) => l.procedureId === procedureId);
  if (line === undefined) throw new Error(`No line for ${procedureId}`);
  return line;
}
