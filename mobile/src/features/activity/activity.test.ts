import type { LedgerEvent } from '@actionbridge/contracts';
import { describe, expect, it } from 'vitest';
import { fixtureCase } from '../../lib/fixture.test-helper';
import { addRecent, MAX_RECENT, parseRecent, recentKey } from './recent';
import { caseSummary, caseTitle } from './summary';

const saved = (revision: number): LedgerEvent => ({
  eventId: `e${revision}`,
  caseId: 'case-1',
  action: 'strategy_saved',
  actor: 'user',
  caseRevision: revision,
  summary: 'Strategy saved',
  strategyId: 's1',
  at: '2026-10-03T16:00:00.000Z',
});

describe('recent cases on this device', () => {
  it('keeps newest first, without duplicates, capped', () => {
    let list = addRecent([], 'a', 't1');
    list = addRecent(list, 'b', 't2');
    list = addRecent(list, 'a', 't3');
    expect(list.map((r) => r.caseId)).toEqual(['a', 'b']);
    for (let i = 0; i < 20; i++) list = addRecent(list, `c${i}`, 't');
    expect(list).toHaveLength(MAX_RECENT);
  });

  it('survives corrupted storage and rejects odd IDs', () => {
    expect(parseRecent('not json')).toEqual([]);
    expect(parseRecent(JSON.stringify([{ caseId: '../x', startedAt: 't' }, { caseId: 'ok-1', startedAt: 't' }]))).toEqual([{ caseId: 'ok-1', startedAt: 't' }]);
  });

  it('uses a storage key per account that secure storage accepts', () => {
    expect(recentKey('Maya.Demo@Example.com')).toBe('actionbridge.recent.maya.demo_example.com');
  });
});

describe('case summary', () => {
  const record = fixtureCase();

  it('names the case by its procedures', () => {
    expect(caseTitle(record)).toBe('Filling one, Filling two and Crown');
    expect(caseTitle({ ...record, procedures: [] })).toBe('New estimate');
  });

  it('derives the status from the case and its ledger', () => {
    expect(caseSummary({ ...record, status: 'draft' }, [])).toMatchObject({ state: 'needs_info', resume: 'questions' });
    expect(caseSummary(record, [])).toMatchObject({ state: 'ready', statusText: 'Ready to review', resume: 'options' });
    expect(caseSummary(record, [saved(1)])).toMatchObject({ state: 'saved', statusText: 'Plan saved' });
    expect(caseSummary({ ...record, caseRevision: 2 }, [saved(1)])).toMatchObject({ state: 'changed' });
  });
});
