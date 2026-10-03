import { compareCoverage, compareSchedules } from '@actionbridge/benefits-engine';
import type { DentalCaseInput } from '@actionbridge/contracts';
import { describe, expect, it } from 'vitest';
import { fixtureCase } from '../../lib/fixture.test-helper';
import { buildOptions, planYearLabel, selfPayView } from './options-model';

const record = fixtureCase();
const input: DentalCaseInput = {
  caseRevision: record.caseRevision,
  currency: record.currency,
  coverageMode: record.coverageMode,
  policy: record.policy,
  planYears: record.planYears,
  procedures: record.procedures,
};

function comparisonFor(value: DentalCaseInput) {
  const result = compareSchedules(value);
  if (result.status !== 'estimated') throw new Error(`expected estimated, got ${result.status}`);
  return result;
}

describe('options model (real engine output on the shared fixture)', () => {
  const model = buildOptions(record, comparisonFor(input));

  it('shows the baseline and the permitted alternative with engine totals', () => {
    expect(model.cards.map((c) => [c.title, c.youPayCents, c.planPaysCents, c.span])).toEqual([
      ['All treatment this benefit year', 120000, 30000, '2026'],
      ['Split across benefit years', 72500, 77500, '2026 and 2027'],
    ]);
    expect(model.cards[1]?.years).toEqual([
      { planYearId: 'py-2026', label: '2026', youPayCents: 20000, planPaysCents: 30000 },
      { planYearId: 'py-2027', label: '2027', youPayCents: 52500, planPaysCents: 47500 },
    ]);
    expect(model.cards.map((c) => c.lowest)).toEqual([false, true]);
    expect(model.cards.map((c) => c.timing)).toEqual([
      'Filling one Nov 10 · Filling two Nov 11 · Crown Nov 12, 2026',
      'Filling one Nov 10 · Filling two Nov 11, 2026 · Crown Jan 1, 2027',
    ]);
    expect(model.cards[1]?.conditional).toBe(true);
  });

  it('states the difference with its conditions, without clinical claims', () => {
    expect(model.difference?.cents).toBe(47500);
    expect(model.difference?.conditions).toBe(
      'Holds only if your dentist confirms the crown can be done on Jan 1, 2027, your 2027 coverage stays the same and no other claims use your benefits first.',
    );
    expect(model.summary).toContain('$475.00 less');
    expect(model.summary).not.toMatch(/safe|wait until|best/i);
    expect(model.benefitsBefore).toEqual({ yearLabel: '2026', paidCents: 50000, maximumCents: 80000, leftCents: 30000 });
  });

  it('explains when no other dates can be compared', () => {
    const fixed = { ...input, procedures: input.procedures.map((p) => ({ ...p, dentistLatestDate: p.dentistEarliestDate })) };
    const result = buildOptions(record, comparisonFor(fixed));
    expect(result.cards).toHaveLength(1);
    expect(result.difference).toBeNull();
    expect(result.outcomeNote).toMatch(/No other dates were compared/);
    expect(result.summary).toBe('Your estimated cost for this treatment is $1,200.00.');
  });

  it('labels non-calendar benefit years', () => {
    expect(planYearLabel({ ...record.planYears['py-2026']!, startDate: '2026-07-01', endDate: '2027-06-30' })).toBe('2026–27');
  });
});

describe('self-pay view', () => {
  it('is unavailable until every procedure has a quote, never a zero total', () => {
    const view = selfPayView(record, compareCoverage(input));
    expect(view).toEqual({ status: 'unavailable', missing: 'Filling one, Filling two and Crown' });
  });

  it('compares quotes with the insured estimate when all are present', () => {
    const quoted = {
      ...input,
      procedures: input.procedures.map((p) => ({ ...p, selfPayQuote: { amountCents: 50000, quotedOn: '2026-10-01', source: 'user_reported' as const, includedScope: 'Same service' } })),
    };
    const view = selfPayView(record, compareCoverage(quoted));
    expect(view).toMatchObject({ status: 'available', insuredCents: 120000, selfPayCents: 150000, result: 'Using insurance is estimated $300.00 less.' });
  });
});
