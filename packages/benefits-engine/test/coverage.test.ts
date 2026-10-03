import { readFileSync } from 'node:fs';
import { CoverageComparisonSchema, DentalCaseInputSchema, type DentalCaseInput } from '@actionbridge/contracts';
import { compareCoverage, estimateCase } from '@actionbridge/benefits-engine';
import { describe, expect, it } from 'vitest';
import { fixtureCase } from './helpers.js';

const raw = JSON.parse(
  readFileSync(new URL('../../../docs/fixtures/self-pay-comparison.json', import.meta.url), 'utf8'),
) as Record<string, any>;

function selfPayCase(): DentalCaseInput {
  const { caseRevision, currency, coverageMode, policy, planYears, procedures } = structuredClone(raw);
  return DentalCaseInputSchema.parse({ caseRevision, currency, coverageMode, policy, planYears, procedures });
}

function compared(input: DentalCaseInput) {
  const result = compareCoverage(input);
  if ('status' in result) throw new Error(`Unexpected ${result.status}`);
  expect(CoverageComparisonSchema.parse(result)).toEqual(result);
  return result;
}

describe('U-02 insured versus self-pay (doc 05 §3A)', () => {
  it('reproduces the independent $525 insured / $1,200 cash example', () => {
    const result = compared(selfPayCase());
    expect(result.insured).toMatchObject({
      status: 'estimated',
      totals: {
        patientPaysCents: raw.expected.insuredPatientPaysCents,
        insurerPaysCents: raw.expected.insuredInsurerPaysCents,
        contractualWriteoffCents: raw.expected.contractualWriteoffCents,
      },
    });
    expect(result.selfPay).toMatchObject({ status: 'available', totalCents: raw.expected.selfPayTotalCents });
    expect(result.selfPayMinusInsuredCents).toBe(raw.expected.selfPayMinusInsuredCents);
    expect(result.notes.map((n) => n.code)).toEqual(['CONFIRM_SCOPE_MATCHES', 'CONFIRM_CASH_BILLING_RULES']);
  });

  it('a missing cash quote makes self-pay unavailable — never a zero-cost option', () => {
    const result = compared(fixtureCase());
    expect(result.selfPay).toEqual({ status: 'unavailable', missingQuoteProcedureIds: ['filling-1', 'filling-2', 'crown-1'] });
    expect(result.selfPayMinusInsuredCents).toBeNull();
  });

  it('distinguishes a real $0 quote from an unknown one', () => {
    const input = selfPayCase();
    input.procedures[0]!.selfPayQuote!.amountCents = 0;
    expect(compared(input).selfPay).toMatchObject({ status: 'available', totalCents: 0 });

    input.procedures[0]!.selfPayQuote = null;
    expect(compared(input).selfPay.status).toBe('unavailable');
  });

  it('shows a cash quote below the insured estimate honestly (negative difference)', () => {
    const input = selfPayCase();
    input.procedures[0]!.selfPayQuote!.amountCents = 40000;
    expect(compared(input).selfPayMinusInsuredCents).toBe(-12500);
  });

  it('a self-pay case has no insured estimate but still compares its cash quote', () => {
    const input = selfPayCase();
    input.coverageMode = 'self_pay';
    const result = compared(input);
    expect(result.insured).toMatchObject({ status: 'unsupported', limitations: [{ code: 'NOT_INSURED' }] });
    expect(result.selfPay).toMatchObject({ status: 'available', totalCents: 120000 });
    expect(result.selfPayMinusInsuredCents).toBeNull();
  });

  it('unknown coverage asks the question instead of assuming either branch', () => {
    const input = selfPayCase();
    input.coverageMode = 'unknown';
    expect(estimateCase(input)).toMatchObject({
      status: 'needs_information',
      missing: [{ fieldPath: 'coverageMode', code: 'COVERAGE_MODE_UNKNOWN' }],
    });
  });

  it('flags a conditional insured estimate and never changes the input or reported usage', () => {
    const input = fixtureCase();
    input.procedures.forEach((p) => (p.selfPayQuote = { amountCents: 50000, quotedOn: '2026-10-01', source: 'synthetic', includedScope: p.label }));
    const crown = input.procedures.find((p) => p.id === 'crown-1')!;
    crown.proposedDate = '2027-01-10';
    const snapshot = structuredClone(input);

    const result = compared(input);
    expect(result.notes.map((n) => n.code)).toContain('INSURED_ESTIMATE_CONDITIONAL');
    expect(input).toEqual(snapshot);
  });
});
