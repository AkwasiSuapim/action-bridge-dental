import { compareSchedules } from '@actionbridge/benefits-engine';
import { describe, expect, it } from 'vitest';
import { fixtureCase } from '../../lib/fixture.test-helper';
import { buildPlanDetails, findScenario } from './plan-model';

const record = fixtureCase();
const comparison = (() => {
  const result = compareSchedules({ caseRevision: 1, currency: 'USD', coverageMode: record.coverageMode, policy: record.policy, planYears: record.planYears, procedures: record.procedures });
  if (result.status !== 'estimated') throw new Error('expected estimated');
  return result;
})();
const split = comparison.alternatives[0]!;
const plan = buildPlanDetails(record, comparison, split);

describe('plan details (real engine output, split scenario)', () => {
  it('summarizes the selected option against the baseline', () => {
    expect(plan).toMatchObject({ title: 'Split across benefit years', youPayCents: 72500, planPaysCents: 77500 });
    expect(plan.comparedToBaseline).toBe('Estimated $475.00 less than doing everything as planned, under these assumptions.');
    expect(findScenario(comparison, 'nope')).toBeNull();
  });

  it('lists what needs confirmation and who to ask', () => {
    expect(plan.confirmations.map((c) => [c.text, c.ask])).toEqual([
      ['Your crown can be done on Jan 1, 2027', 'Ask your dentist'],
      ['Your plan has paid $500.00 so far in 2026', 'Ask your insurer'],
      ['$0.00 of your 2026 deductible has been met', 'Ask your insurer'],
      ['Your 2027 coverage stays the same', 'Ask your employer or insurer'],
      ['Each fee equals your plan’s allowed amount', 'Ask your dentist’s office'],
    ]);
  });

  it('puts a benefit-year divider in the timeline', () => {
    expect(plan.timeline.map((t) => (t.kind === 'divider' ? t.text : `${t.title} ${t.day}`))).toEqual([
      'Filling one Nov 10',
      'Filling two Nov 11',
      'New benefit year · Jan 1, 2027',
      'Crown Jan 1',
    ]);
  });

  it('explains each line with engine values, including the cap and the new deductible', () => {
    const filling2 = plan.items.find((i) => i.procedureId === 'filling-2')!;
    expect(filling2.rows.find((r) => r.label.startsWith('Plan pays'))).toEqual({ label: 'Plan pays · 80% of $250.00, limited by maximum · est.', value: '$140.00' });
    expect(filling2.note).toBe('Your plan would pay $200.00, but only $140.00 of your 2026 maximum is left by then.');
    const crown = plan.items.find((i) => i.procedureId === 'crown-1')!;
    expect(crown.rows.at(-1)).toEqual({ label: 'You pay · estimated', value: '$525.00', strong: true });
    expect(crown.note).toBe('A new benefit year starts Jan 1, 2027, so the deductible applies again.');
  });

  it('keeps each year’s maximum separate', () => {
    expect(plan.bars.map((b) => [b.label, b.maximumCents, b.paidCents, b.projectedCents, b.leftCents, b.maximumSource])).toEqual([
      ['2026', 80000, 50000, 30000, 0, 'sample data'],
      ['2027', 80000, 0, 47500, 32500, 'assumed same as 2026'],
    ]);
  });

  it('builds shareable questions without amounts already paid', () => {
    expect(plan.questions.dentist[0]).toBe('Can my crown be done on Jan 1, 2027 instead? Is that timing right for me?');
    expect(plan.shareText).toContain('Will my 2027 plan have the same maximum');
    expect(plan.shareText).not.toMatch(/\$\d/);
  });
});
