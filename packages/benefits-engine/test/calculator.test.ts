import { MAX_CENTS } from '@actionbridge/contracts';
import { applyRateHalfUp, EngineInvariantError, estimateCase } from '@actionbridge/benefits-engine';
import { describe, expect, it } from 'vitest';
import { caseWith, expectEstimated, expectReconciles, fixtureCase, lineFor, planYear, procedure } from './helpers.js';

const filling = procedure({ id: 'filling', category: 'basic', providerChargeCents: 25000, allowedCents: 25000, proposedDate: '2026-11-10' });

function withPlanYear2026(changes: Parameters<typeof planYear>[0]) {
  return { 'py-2026': planYear(changes) };
}

describe('Q-02 deductible already met', () => {
  it('applies no second deductible', () => {
    const input = caseWith([filling]);
    (input.planYears['py-2026'] as { deductibleAlreadyMetCents: number }).deductibleAlreadyMetCents = 5000;
    const result = estimateCase(input);
    expectEstimated(result);
    expectReconciles(result);
    expect(lineFor(result, 'filling')).toMatchObject({ deductibleAppliedCents: 0, insurerPaysCents: 20000, patientPaysCents: 5000 });
  });

  it('applies only the unmet remainder of a partly met deductible', () => {
    const input = caseWith([filling]);
    (input.planYears['py-2026'] as { deductibleAlreadyMetCents: number }).deductibleAlreadyMetCents = 3000;
    const result = estimateCase(input);
    expectEstimated(result);
    expectReconciles(result);
    // (25000 - 2000) × 80% = 18400
    expect(lineFor(result, 'filling')).toMatchObject({ deductibleAppliedCents: 2000, insurerPaysCents: 18400, patientPaysCents: 6600 });
    expect(result.yearProjections['py-2026']?.projectedDeductibleMetCents).toBe(5000);
  });
});

describe('Q-03 annual maximum exhausted or reached mid-procedure', () => {
  it('caps a payment part-way through a procedure and shows the shortfall', () => {
    const result = estimateCase(fixtureCase());
    expectEstimated(result);
    // Filling two would pay 20000 but only 14000 of the maximum remains.
    expect(lineFor(result, 'filling-2')).toMatchObject({ insurerPaysCents: 14000, capShortfallCents: 6000, patientPaysCents: 11000 });
    expect(lineFor(result, 'crown-1')).toMatchObject({ insurerPaysCents: 0, capShortfallCents: 50000, patientPaysCents: 100000 });
  });

  it('pays nothing when the maximum is already used up', () => {
    const input = caseWith([filling]);
    (input.planYears['py-2026'] as { insurerAlreadyPaidCents: number }).insurerAlreadyPaidCents = 80000;
    const result = estimateCase(input);
    expectEstimated(result);
    expectReconciles(result);
    expect(lineFor(result, 'filling')).toMatchObject({
      deductibleAppliedCents: 5000,
      coinsuranceCents: 4000,
      capShortfallCents: 16000,
      insurerPaysCents: 0,
      patientPaysCents: 25000,
    });
    expect(result.yearProjections['py-2026']?.remainingMaximumCents).toBe(0);
  });
});

describe('Q-08 in-network write-off versus out-of-network balance bill', () => {
  const crown = (network: 'in' | 'out', writeoff: number) =>
    procedure({
      id: 'crown',
      category: 'major',
      network,
      providerChargeCents: 150000,
      allowedCents: 100000,
      contractualWriteoffCents: writeoff,
    });
  const planYears = withPlanYear2026({ startDate: '2026-01-01', endDate: '2026-12-31', annualMaximumCents: 150000 });

  it('in network: $1,500 charge, $500 write-off → insurer $475, employee $525', () => {
    const result = estimateCase(caseWith([crown('in', 50000)], planYears));
    expectEstimated(result);
    expectReconciles(result);
    expect(lineFor(result, 'crown')).toMatchObject({ insurerPaysCents: 47500, patientPaysCents: 52500, balanceBillCents: 0 });
  });

  it('out of network, no write-off → insurer $475, employee $1,025 including $500 balance bill', () => {
    const result = estimateCase(caseWith([crown('out', 0)], planYears));
    expectEstimated(result);
    expectReconciles(result);
    expect(lineFor(result, 'crown')).toMatchObject({ insurerPaysCents: 47500, patientPaysCents: 102500, balanceBillCents: 50000 });
  });
});

describe('Q-13 fractional-cent rounding', () => {
  const noDeductible = withPlanYear2026({ startDate: '2026-01-01', endDate: '2026-12-31', annualDeductibleCents: 0 });

  it('rounds half up per line and the rows still sum to the totals', () => {
    const result = estimateCase(
      caseWith(
        [
          procedure({ id: 'half', category: 'major', providerChargeCents: 125, allowedCents: 125 }),
          procedure({ id: 'down', category: 'basic', providerChargeCents: 333, allowedCents: 333 }),
        ],
        noDeductible,
      ),
    );
    expectEstimated(result);
    expectReconciles(result);
    expect(lineFor(result, 'half')).toMatchObject({ insurerPaysCents: 63, patientPaysCents: 62 }); // 62.5 → 63
    expect(lineFor(result, 'down')).toMatchObject({ insurerPaysCents: 266, patientPaysCents: 67 }); // 266.4 → 266
  });

  it('applyRateHalfUp is exact at the boundaries', () => {
    expect(applyRateHalfUp(1, 5000)).toBe(1);
    expect(applyRateHalfUp(3, 5000)).toBe(2);
    expect(applyRateHalfUp(1, 4999)).toBe(0);
    expect(applyRateHalfUp(0, 8000)).toBe(0);
    expect(applyRateHalfUp(MAX_CENTS, 10000)).toBe(MAX_CENTS);
    // 99,999,999,999 × 0.3333 = 33,329,999,999.6667 → 33,330,000,000
    expect(applyRateHalfUp(MAX_CENTS - 1, 3333)).toBe(33_330_000_000);
  });

  it('applyRateHalfUp rejects values that would corrupt the computation', () => {
    expect(() => applyRateHalfUp(-1, 5000)).toThrow(EngineInvariantError);
    expect(() => applyRateHalfUp(1.5, 5000)).toThrow(EngineInvariantError);
    expect(() => applyRateHalfUp(100, 10001)).toThrow(EngineInvariantError);
    expect(() => applyRateHalfUp(Number.MAX_SAFE_INTEGER, 10000)).toThrow(EngineInvariantError);
  });
});

describe('policy flags', () => {
  it('a category exempt from the maximum is paid even when the maximum is exhausted, and does not consume it', () => {
    const input = caseWith([procedure({ id: 'cleaning', category: 'preventive', providerChargeCents: 12000, allowedCents: 12000 })]);
    const policy = input.policy as NonNullable<typeof input.policy>;
    policy.insurerRateBpsByCategory.preventive = 10000;
    policy.deductibleAppliesByCategory.preventive = false;
    policy.annualMaximumAppliesByCategory.preventive = false;
    input.planYears['py-2026'] = planYear({ startDate: '2026-01-01', endDate: '2026-12-31', annualMaximumCents: 80000, insurerAlreadyPaidCents: 80000 });

    const result = estimateCase(input);
    expectEstimated(result);
    expectReconciles(result);
    expect(lineFor(result, 'cleaning')).toMatchObject({ deductibleAppliedCents: 0, insurerPaysCents: 12000, patientPaysCents: 0 });
    expect(result.yearProjections['py-2026']).toMatchObject({
      scenarioInsurerPaysCents: 12000,
      projectedTotalInsurerPaidCents: 80000,
      remainingMaximumCents: 0,
    });
  });
});
