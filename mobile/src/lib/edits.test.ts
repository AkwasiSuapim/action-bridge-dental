import { PatchCaseRequestSchema } from '@actionbridge/contracts';
import { describe, expect, it } from 'vitest';
import { userEditChanges, valueAt } from './edits';
import { fixtureCase } from './fixture.test-helper';

const deps = { now: () => new Date('2026-10-03T16:00:00.000Z'), newId: () => 'abc' };

describe('userEditChanges', () => {
  it('patches the value, relabels the edited plan year and records a user fact', () => {
    const record = fixtureCase();
    const changes = userEditChanges(record, 'planYears.py-2026.insurerAlreadyPaidCents', 20000, deps);
    expect(PatchCaseRequestSchema.parse({ expectedRevision: 1, changes })).toBeTruthy();
    expect(changes.planYears?.['py-2026']).toMatchObject({ insurerAlreadyPaidCents: 20000, sourceStatus: 'user_entered' });
    expect(changes.planYears?.['py-2027']?.sourceStatus).toBe('explicit_unchanged_plan_assumption');
    expect(changes.sourceFacts).toEqual([
      expect.objectContaining({
        fieldPath: 'planYears.py-2026.insurerAlreadyPaidCents',
        value: 20000,
        origin: 'user_entered',
        userConfirmed: true,
        insurerVerification: { status: 'not_verified' },
      }),
    ]);
  });

  it('keeps unknown as null and replaces an earlier fact for the same field', () => {
    const first = fixtureCase();
    const once = userEditChanges(first, 'procedures.crown-1.allowedCents', 90000, deps);
    const second = fixtureCase({ sourceFacts: once.sourceFacts ?? [] });
    const twice = userEditChanges(second, 'procedures.crown-1.allowedCents', null, deps);
    expect(twice.procedures?.find((p) => p.id === 'crown-1')?.allowedCents).toBeNull();
    expect(twice.sourceFacts).toHaveLength(1);
    expect(twice.sourceFacts?.[0]?.value).toBeNull();
  });
});

describe('valueAt', () => {
  it('reads values by the same field paths edits write', () => {
    const record = fixtureCase();
    expect(valueAt(record, 'planYears.py-2026.insurerAlreadyPaidCents')).toBe(50000);
    expect(valueAt(record, 'procedures.crown-1.network')).toBe('in');
    expect(valueAt(record, 'coverageMode')).toBe('insured');
    expect(valueAt(record, 'policy.deductibleAppliesByCategory.major')).toBe(true);
    expect(valueAt(record, 'procedures.ghost.network')).toBeUndefined();
  });
});
