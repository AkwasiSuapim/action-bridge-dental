import type { DentalCaseInput, Policy, Procedure } from '@actionbridge/contracts';
import { compareSchedules, estimateCase } from '@actionbridge/benefits-engine';
import { describe, expect, it } from 'vitest';
import { caseWith, expectEstimated, fixtureCase, procedure } from './helpers.js';

function edit(mutate: (input: DentalCaseInput) => void): DentalCaseInput {
  const input = fixtureCase();
  mutate(input);
  return input;
}
const crown = (input: DentalCaseInput) => input.procedures.find((p) => p.id === 'crown-1') as Procedure;
const policy = (input: DentalCaseInput) => input.policy as Policy;

describe('Q-06 unknown values produce targeted questions, never fabricated numbers', () => {
  it('asks for an unknown allowed amount instead of assuming one', () => {
    const result = estimateCase(edit((i) => (crown(i).allowedCents = null)));
    expect(result).toMatchObject({
      status: 'needs_information',
      missing: [{ fieldPath: 'procedures.crown-1.allowedCents', code: 'VALUE_UNKNOWN' }],
    });
  });

  it('asks about an unknown network status', () => {
    const result = estimateCase(edit((i) => (crown(i).network = 'unknown')));
    expect(result).toMatchObject({ status: 'needs_information', missing: [{ fieldPath: 'procedures.crown-1.network', code: 'NETWORK_UNKNOWN' }] });
  });

  it('asks for unknown prior insurer payments rather than treating them as zero', () => {
    const result = estimateCase(edit((i) => (i.planYears['py-2026']!.insurerAlreadyPaidCents = null)));
    expect(result).toMatchObject({
      status: 'needs_information',
      missing: [{ fieldPath: 'planYears.py-2026.insurerAlreadyPaidCents', code: 'VALUE_UNKNOWN' }],
    });
  });

  it('asks for a plan year when a treatment date is outside every supplied plan year', () => {
    const result = estimateCase(edit((i) => delete i.planYears['py-2026']));
    expect(result).toMatchObject({ status: 'needs_information', missing: [{ fieldPath: 'planYears', code: 'PLAN_YEAR_NOT_SUPPLIED' }] });
  });

  it('asks for the policy, procedures and dates when absent', () => {
    expect(estimateCase(edit((i) => (i.policy = null)))).toMatchObject({ missing: [{ code: 'POLICY_NOT_SUPPLIED' }] });
    expect(estimateCase(edit((i) => (i.procedures = [])))).toMatchObject({ missing: [{ code: 'NO_PROCEDURES' }] });
    const noDate = estimateCase(
      edit((i) => Object.assign(crown(i), { proposedDate: null, dentistEarliestDate: null, dentistLatestDate: null })),
    );
    expect(noDate).toMatchObject({ missing: [{ fieldPath: 'procedures.crown-1.proposedDate', code: 'DATE_UNKNOWN' }] });
  });

  it('asks once for a missing category rule shared by several procedures', () => {
    const result = estimateCase(edit((i) => delete policy(i).deductibleAppliesByCategory.basic));
    expect(result).toMatchObject({
      status: 'needs_information',
      missing: [{ fieldPath: 'policy.deductibleAppliesByCategory.basic', code: 'POLICY_CATEGORY_RULE_MISSING' }],
    });
  });

  it('does not require values for a plan year no procedure uses', () => {
    const result = estimateCase(edit((i) => (i.planYears['py-2027']!.annualMaximumCents = null)));
    expectEstimated(result);
    expect(result.totals.patientPaysCents).toBe(120000);
  });

  it('a comparison is never produced from incomplete inputs', () => {
    expect(compareSchedules(edit((i) => (crown(i).providerChargeCents = null))).status).toBe('needs_information');
  });
});

describe('Q-07 unsupported plan rules are disclosed, not silently treated as covered', () => {
  const restriction = { id: 'r1', description: 'Crowns: 12-month waiting period', categoryIds: ['major'] };

  it.each([
    ['waitingPeriods', 'WAITING_PERIOD_UNSUPPORTED'],
    ['exclusions', 'EXCLUSION_UNSUPPORTED'],
    ['frequencyRestrictions', 'FREQUENCY_RESTRICTION_UNSUPPORTED'],
  ] as const)('%s → %s', (field, code) => {
    const result = estimateCase(edit((i) => policy(i)[field].push(restriction)));
    expect(result).toMatchObject({ status: 'unsupported', limitations: [{ code, fieldPath: `policy.${field}` }] });
  });

  it('a category with no coverage rate in the plan', () => {
    const result = estimateCase(edit((i) => (crown(i).category = 'orthodontic')));
    expect(result).toMatchObject({
      status: 'unsupported',
      limitations: [{ code: 'CATEGORY_NOT_IN_POLICY', procedureId: 'crown-1' }],
    });
  });

  it('plans that do not cover every listed service or apply coinsurance first', () => {
    expect(estimateCase(edit((i) => (policy(i).allServicesCovered = false)))).toMatchObject({
      limitations: [{ code: 'PARTIAL_COVERAGE_UNSUPPORTED' }],
    });
    expect(estimateCase(edit((i) => (policy(i).deductibleBeforeCoinsurance = false)))).toMatchObject({
      limitations: [{ code: 'DEDUCTIBLE_AFTER_COINSURANCE_UNSUPPORTED' }],
    });
  });

  it('more than six procedures', () => {
    const procedures = Array.from({ length: 7 }, (_, n) => procedure({ id: `p${n}`, proposedDate: '2026-11-10' }));
    expect(estimateCase(caseWith(procedures))).toMatchObject({ status: 'unsupported', limitations: [{ code: 'TOO_MANY_PROCEDURES' }] });
  });
});

describe('contradictory inputs are rejected as invalid (HTTP 422)', () => {
  it.each<[string, (i: DentalCaseInput) => void, string]>([
    ['allowed above billed', (i) => (crown(i).allowedCents = 120000), 'ALLOWED_EXCEEDS_CHARGE'],
    [
      'write-off above charge minus allowed',
      (i) => Object.assign(crown(i), { allowedCents: 90000, contractualWriteoffCents: 20000 }),
      'WRITEOFF_EXCEEDS_CHARGE_MINUS_ALLOWED',
    ],
    ['deductible met above deductible', (i) => (i.planYears['py-2026']!.deductibleAlreadyMetCents = 6000), 'DEDUCTIBLE_MET_EXCEEDS_DEDUCTIBLE'],
    ['paid above maximum', (i) => (i.planYears['py-2026']!.insurerAlreadyPaidCents = 90000), 'PAID_EXCEEDS_MAXIMUM'],
    ['plan year ending before it starts', (i) => (i.planYears['py-2026']!.endDate = '2025-12-31'), 'PLAN_YEAR_ENDS_BEFORE_START'],
    ['overlapping plan years', (i) => (i.planYears['py-2027']!.startDate = '2026-12-01'), 'PLAN_YEARS_OVERLAP'],
    ['duplicate procedure IDs', (i) => (i.procedures[1]!.id = 'filling-1'), 'DUPLICATE_PROCEDURE_ID'],
    ['proposed date outside the dentist window', (i) => (crown(i).proposedDate = '2027-02-01'), 'PROPOSED_DATE_OUTSIDE_WINDOW'],
  ])('%s', (_name, mutate, code) => {
    const result = estimateCase(edit(mutate));
    expect(result.status).toBe('invalid');
    expect(result).toMatchObject({ issues: expect.arrayContaining([expect.objectContaining({ code })]) });
  });
});
