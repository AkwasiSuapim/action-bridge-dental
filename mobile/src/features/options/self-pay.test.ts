import { PatchCaseRequestSchema } from '@actionbridge/contracts';
import { describe, expect, it } from 'vitest';
import { fixtureCase } from '../../lib/fixture.test-helper';
import { localToday, QUOTE_SCOPE, selfPayChanges } from './self-pay';

describe('self-pay quotes', () => {
  const record = fixtureCase();

  it('requires scope confirmation and well-formed amounts', () => {
    expect(selfPayChanges(record, { 'crown-1': '1200' }, false, '2026-10-03')).toEqual({ errors: { scope: expect.any(String) } });
    expect(selfPayChanges(record, { 'crown-1': 'cheap' }, true, '2026-10-03')).toEqual({ errors: { 'crown-1': expect.any(String) } });
  });

  it('stores entered quotes as user-reported, keeps a typed $0 and treats empty as no quote', () => {
    const result = selfPayChanges(record, { 'crown-1': '1,200', 'filling-1': '0', 'filling-2': '' }, true, '2026-10-03');
    if (!('changes' in result)) throw new Error('expected changes');
    expect(PatchCaseRequestSchema.parse({ expectedRevision: 1, changes: result.changes })).toBeTruthy();
    const byId = Object.fromEntries((result.changes.procedures ?? []).map((p) => [p.id, p.selfPayQuote]));
    expect(byId['crown-1']).toEqual({ amountCents: 120000, quotedOn: '2026-10-03', source: 'user_reported', includedScope: QUOTE_SCOPE });
    expect(byId['filling-1']?.amountCents).toBe(0);
    expect(byId['filling-2']).toBeNull();
  });

  it('formats the local calendar date', () => {
    expect(localToday(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});
