import { readFileSync } from 'node:fs';
import { DentalCaseInputSchema, plainSummary } from '@actionbridge/contracts';
import { compareCoverage, compareSchedules } from '@actionbridge/benefits-engine';
import { describe, expect, it } from 'vitest';

function fixture() {
  const raw = JSON.parse(readFileSync(new URL('../../docs/fixtures/dental-regression.json', import.meta.url), 'utf8'));
  return DentalCaseInputSchema.parse({ caseRevision: 1, currency: raw.currency, coverageMode: raw.coverageMode, policy: raw.policy, planYears: raw.planYears, procedures: raw.procedures });
}

describe('"What this means for you" from the calculator’s numbers', () => {
  it('explains the reference case in plain words', () => {
    const input = fixture();
    input.procedures.forEach((p) => (p.selfPayQuote = { amountCents: p.id === 'crown-1' ? 90000 : 20000, quotedOn: '2026-10-01', source: 'user_reported', includedScope: 'Same service' }));
    const comparison = compareSchedules(input);
    const coverage = compareCoverage(input);
    if (comparison.status !== 'estimated' || !('selfPay' in coverage) || coverage.selfPay.status !== 'available') throw new Error('fixture should estimate');
    const summary = plainSummary({
      comparison: comparison.baseline,
      alternative: comparison.alternatives[0] ?? null,
      outcome: comparison.outcome,
      procedures: input.procedures,
      selfPay: { totalCents: coverage.selfPay.totalCents, minusInsuredCents: coverage.selfPayMinusInsuredCents },
    });
    expect(summary.paragraphs[0]).toBe('If you do everything as planned, you pay about $1,200 and your plan pays $300.');
    expect(summary.paragraphs[1]).toBe('Your plan has only $300 left of its $800 yearly maximum, so part of your treatment isn\'t covered this year.');
    expect(summary.paragraphs[2]).toMatch(/^If your dentist does the crown on .* \(they said it can safely wait until January 15, 2027\), a new benefit year starts and your plan pays again: you'd pay about \$725, which is \$475 less\./);
    expect(summary.paragraphs[3]).toBe('Paying cash without insurance would cost $1,300, $100 more than using your plan.');
    expect(summary.speech).toContain('$475 less');
  });

  it('says honestly when next year’s plan is needed to compare', () => {
    const input = fixture();
    delete input.planYears['py-2027'];
    const comparison = compareSchedules(input);
    if (comparison.status !== 'estimated') throw new Error('should estimate');
    const summary = plainSummary({ comparison: comparison.baseline, alternative: null, outcome: comparison.outcome, procedures: input.procedures, selfPay: null });
    expect(summary.paragraphs).toContain('Moving treatment into next year could change the cost, but I need next year’s plan details to compare it.');
  });
});
