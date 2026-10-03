import type { MissingFact } from '@actionbridge/contracts';
import { describe, expect, it } from 'vitest';
import { answerChanges } from '../../lib/edits';
import { fixtureCase } from '../../lib/fixture.test-helper';
import { nextStep } from './question-loop';

const fact = (fieldPath: string): MissingFact => ({ fieldPath, code: 'VALUE_UNKNOWN', message: 'Needed.' });
const deps = { now: () => new Date('2026-10-03T16:00:00.000Z'), newId: () => 'x1' };

describe('question loop', () => {
  it('asks coverage first and sends plan rules to the rules screen', () => {
    expect(nextStep([fact('procedures.p.allowedCents'), fact('coverageMode')], new Set())).toMatchObject({ kind: 'question', fact: { fieldPath: 'coverageMode' }, remaining: 2 });
    expect(nextStep([fact('procedures.p.allowedCents'), fact('policy')], new Set())).toMatchObject({ kind: 'rules' });
  });

  it('skips what the user said they do not know, so it always ends', () => {
    const missing = [fact('planYears.py.insurerAlreadyPaidCents'), fact('procedures.p.allowedCents')];
    expect(nextStep(missing, new Set(['planYears.py.insurerAlreadyPaidCents']))).toMatchObject({ fact: { fieldPath: 'procedures.p.allowedCents' }, remaining: 1 });
    expect(nextStep(missing, new Set(missing.map((m) => m.fieldPath)))).toEqual({ kind: 'done' });
  });

  it('sets a zero write-off only when the allowed amount equals the charge', () => {
    const base = fixtureCase();
    const record = { ...base, procedures: base.procedures.map((p) => (p.id === 'crown-1' ? { ...p, allowedCents: null, contractualWriteoffCents: null } : p)) };
    const same = answerChanges(record, 'procedures.crown-1.allowedCents', 100000, deps);
    expect(same.procedures?.find((p) => p.id === 'crown-1')).toMatchObject({ allowedCents: 100000, contractualWriteoffCents: 0 });
    const lower = answerChanges(record, 'procedures.crown-1.allowedCents', 80000, deps);
    expect(lower.procedures?.find((p) => p.id === 'crown-1')?.contractualWriteoffCents).toBeNull();
  });
});
