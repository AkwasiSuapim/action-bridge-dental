import type { LedgerEvent } from '@actionbridge/contracts';
import { describe, expect, it } from 'vitest';
import { formatDateTime } from '../../lib/format';
import { describeEvent, ledgerView } from './ledger';

const event = (action: LedgerEvent['action'], summary: string, eventId: string): LedgerEvent => ({
  eventId,
  caseId: 'case-1',
  action,
  actor: 'user',
  caseRevision: 1,
  summary,
  strategyId: null,
  at: '2026-10-03T16:05:00.000Z',
});

describe('plan history', () => {
  const events = [event('strategy_saved', 'Strategy saved: alt-1', 'e3'), event('case_updated', 'Case updated: planYears, sourceFacts', 'e2'), event('case_created', 'Case created', 'e1')];

  it('describes events in plain language without values', () => {
    expect(events.map((e) => describeEvent(e).text)).toEqual(['Saved your plan', 'Updated your benefit-year amounts', 'Started this estimate']);
    expect(describeEvent(event('case_updated', 'Case updated: sourceFacts', 'x')).text).toBe('Updated your details');
  });

  it('collapses routine edits until asked', () => {
    expect(ledgerView(events, false)).toMatchObject({ hiddenRoutine: 1, entries: [{ eventId: 'e3' }, { eventId: 'e1' }] });
    expect(ledgerView(events, true).entries).toHaveLength(3);
  });

  it('formats timestamps in local time', () => {
    expect(formatDateTime(new Date(2026, 9, 3, 16, 5).toISOString())).toBe('Oct 3, 2026, 4:05 PM');
    expect(formatDateTime(new Date(2026, 9, 3, 0, 9).toISOString())).toBe('Oct 3, 2026, 12:09 AM');
  });
});
