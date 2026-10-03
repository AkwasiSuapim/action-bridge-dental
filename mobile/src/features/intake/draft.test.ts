import { CreateCaseRequestSchema, PatchCaseRequestSchema } from '@actionbridge/contracts';
import { describe, expect, it } from 'vitest';
import { fixtureCase } from '../../lib/fixture.test-helper';
import { benefitYearEnd, emptyDraft, rulesChanges, rulesFromCase, toCreateCaseRequest, validateDraft, type CaseDraft } from './draft';

const deps = { now: () => new Date('2026-10-03T16:00:00.000Z'), newId: () => 'x1' };

function insuredDraft(): CaseDraft {
  const draft = emptyDraft('k1');
  return {
    ...draft,
    coverage: 'insured',
    procedures: [
      { key: 'k1', label: 'Crown', category: 'major', charge: { text: '1,000', unknown: false }, network: 'in', date: '2026-11-12' },
      { key: 'k2', label: 'Filling', category: 'basic', charge: { text: '', unknown: true }, network: null, date: '' },
    ],
    rules: { yearStart: '2026-07-01', rates: { major: '50', basic: '80' }, deductibleApplies: { major: 'yes', basic: 'unknown' } },
    annualMaximum: { text: '1500', unknown: false },
    alreadyPaid: { text: '', unknown: true },
  };
}

describe('manual entry draft', () => {
  it('requires coverage, names, types and the rates the procedures use', () => {
    const errors = validateDraft({ ...emptyDraft('k1'), coverage: 'insured' });
    expect(Object.keys(errors).sort()).toEqual(['procedures.0.category', 'procedures.0.label', 'rules.yearStart']);
    const missingRate = insuredDraft();
    missingRate.rules.rates = { major: '50' };
    expect(validateDraft(missingRate)).toEqual({ 'rules.rates.basic': expect.any(String) });
    expect(validateDraft(insuredDraft())).toEqual({});
  });

  it('rejects malformed amounts and dates instead of guessing', () => {
    const draft = insuredDraft();
    draft.procedures[0] = { ...draft.procedures[0]!, charge: { text: '12.345', unknown: false }, date: '2026-02-30' };
    draft.deductible = { text: 'fifty', unknown: false };
    expect(Object.keys(validateDraft(draft)).sort()).toEqual(['money.deductible', 'procedures.0.charge', 'procedures.0.date']);
  });

  it('builds a valid request where everything unanswered stays null', () => {
    const request = CreateCaseRequestSchema.parse(toCreateCaseRequest(insuredDraft(), deps));
    expect(request.procedures[0]).toMatchObject({ id: 'proc-1', providerChargeCents: 100000, allowedCents: null, network: 'in', proposedDate: '2026-11-12', timingSource: 'unknown' });
    expect(request.procedures[1]).toMatchObject({ providerChargeCents: null, network: 'unknown', proposedDate: null });
    expect(request.planYears['py-2026']).toMatchObject({ startDate: '2026-07-01', endDate: '2027-06-30', annualMaximumCents: 150000, insurerAlreadyPaidCents: null, annualDeductibleCents: null });
    expect(request.policy?.insurerRateBpsByCategory).toEqual({ basic: 8000, major: 5000 });
    expect(request.policy?.deductibleAppliesByCategory).toEqual({ major: true });
    expect(request.policy?.annualMaximumAppliesByCategory).toEqual({});
    expect(request.sourceFacts?.map((f) => [f.fieldPath, f.origin])).toEqual([
      ['policy.deductibleBeforeCoinsurance', 'assumption'],
      ['policy.allServicesCovered', 'assumption'],
    ]);
  });

  it('sends no plan for self-pay or unsure coverage', () => {
    const request = toCreateCaseRequest({ ...insuredDraft(), coverage: 'unknown' }, deps);
    expect(request).toMatchObject({ coverageMode: 'unknown', policy: null, planYears: {} });
  });

  it('computes benefit-year ends without a calendar-year shortcut', () => {
    expect(benefitYearEnd('2026-01-01')).toBe('2026-12-31');
    expect(benefitYearEnd('2026-07-01')).toBe('2027-06-30');
  });

  it('edits coverage rules without touching existing benefit years', () => {
    const record = fixtureCase();
    const rules = rulesFromCase(record);
    expect(rules).toEqual({ yearStart: '2026-01-01', rates: { basic: '80', major: '50' }, deductibleApplies: { basic: 'yes', major: 'yes' } });
    const changes = rulesChanges(record, { ...rules, rates: { basic: '70', major: '50' } }, deps);
    expect(PatchCaseRequestSchema.parse({ expectedRevision: 1, changes })).toBeTruthy();
    expect(changes.policy?.insurerRateBpsByCategory).toEqual({ basic: 7000, major: 5000 });
    expect(changes.planYears).toBeUndefined();
  });
});
