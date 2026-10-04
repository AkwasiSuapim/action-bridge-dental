import { JobAnswersRequestSchema, type MissingFieldBlock, type UiBlockEnvelope } from '@actionbridge/contracts';
import { describe, expect, it } from 'vitest';
import { buildAnswers, initialDrafts, isTerminal, pollDelayMs, questionsOf } from './answers';

const base = { type: 'missing_field' as const, allowedResponseModes: ['tap' as const], required: true, allowUnknown: true, sourceRefs: [], expectedRevision: 2 };
const confirm: MissingFieldBlock = { ...base, id: 'confirm-1', questionId: 'confirm-1', fieldPath: 'procedures.proc-1', inputType: 'fact_review', label: 'Is this right? A recommended procedure', reason: 'From your description: “a crown at $1,000”', options: [], required: false, candidateValue: 'Crown (major service) · charge $1,000.00' };
const choice: MissingFieldBlock = { ...base, id: 'q-1', questionId: 'q-1', fieldPath: 'procedures.all.network', inputType: 'single_select', label: 'Is your dentist in your plan’s network?', reason: 'Because.', options: [{ id: 'in', label: 'In network' }, { id: 'out', label: 'Out of network' }] };
const money: MissingFieldBlock = { ...base, id: 'q-2', questionId: 'q-2', fieldPath: 'planYears.py-2026.insurerAlreadyPaidCents', inputType: 'currency', label: 'Paid?', reason: 'Because.', options: [], currency: 'USD', minimumCents: 0, maximumCents: 80000 };
const date: MissingFieldBlock = { ...base, id: 'q-3', questionId: 'q-3', fieldPath: 'procedures.proc-1.proposedDate', inputType: 'date', label: 'When?', reason: 'Because.', options: [] };

describe('assistant answers', () => {
  it('reads question blocks in order and defaults confirmations to yes', () => {
    const envelope: UiBlockEnvelope = { schemaVersion: 1, caseRevision: 2, blocks: [{ id: 'n', type: 'notice', severity: 'info', title: 'Hi', body: '' }, confirm, choice] };
    expect(questionsOf(envelope).map((q) => q.questionId)).toEqual(['confirm-1', 'q-1']);
    expect(initialDrafts([confirm, choice])).toEqual({ 'confirm-1': { kind: 'confirm', value: true } });
  });

  it('builds a contract-valid request with typed values and unknowns sent as unknown, never 0', () => {
    const built = buildAnswers([confirm, choice, money, date], {
      'confirm-1': { kind: 'confirm', value: false },
      'q-1': { kind: 'choice', optionId: 'in' },
      'q-2': { kind: 'unknown' },
      'q-3': { kind: 'text', text: '2026-11-12' },
    }, 2);
    if (!built.ok) throw new Error(JSON.stringify(built.problems));
    expect(JobAnswersRequestSchema.parse(built.request)).toEqual(built.request);
    expect(built.request.answers.map((a) => [a.questionId, a.value, a.unknown])).toEqual([
      ['confirm-1', false, false],
      ['q-1', 'in', false],
      ['q-2', null, true],
      ['q-3', '2026-11-12', false],
    ]);
  });

  it('lists every answer that needs attention instead of sending a guess', () => {
    const built = buildAnswers([choice, money, date], { 'q-1': { kind: 'choice', optionId: 'maybe' }, 'q-2': { kind: 'text', text: '900.00' }, 'q-3': { kind: 'text', text: '2026-02-30' } }, 2);
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.problems.map((p) => p.questionId)).toEqual(['q-1', 'q-2', 'q-3']);
    expect(buildAnswers([money], {}, 2)).toMatchObject({ ok: false, problems: [{ questionId: 'q-2' }] });
  });

  it('accepts dollars and cents for money answers', () => {
    const built = buildAnswers([money], { 'q-2': { kind: 'text', text: '$500' } }, 2);
    expect(built).toMatchObject({ ok: true, request: { answers: [{ value: 50000, responseMode: 'type' }] } });
  });

  it('polls quickly at first, then backs off to a cap; stops on terminal states', () => {
    expect(pollDelayMs(0)).toBe(800);
    expect(pollDelayMs(3)).toBe(2000);
    expect(pollDelayMs(50)).toBe(4000);
    expect(['queued', 'running'].map(isTerminal)).toEqual([false, false]);
    expect(['needs_information', 'completed', 'failed', 'cancelled'].every(isTerminal)).toBe(true);
  });
});
