import type { LedgerEvent } from '@actionbridge/contracts';

/**
 * Plan history (design v3 ledger): only what the server recorded as actually happening.
 * Routine detail edits are collapsed by default; creating the case and saving are always shown.
 */
export interface LedgerEntry {
  eventId: string;
  at: string;
  text: string;
  routine: boolean;
}

const SECTION_NAMES: Record<string, string> = {
  coverageMode: 'coverage',
  policy: 'plan rules',
  planYears: 'benefit-year amounts',
  procedures: 'treatment',
  sourceFacts: 'sources',
};

export function describeEvent(event: LedgerEvent): LedgerEntry {
  switch (event.action) {
    case 'case_created':
      return { eventId: event.eventId, at: event.at, text: 'Started this estimate', routine: false };
    case 'strategy_saved':
      return { eventId: event.eventId, at: event.at, text: 'Saved your plan', routine: false };
    case 'case_updated': {
      // Server summary is "Case updated: planYears, sourceFacts" — section names only, never values.
      const sections = (event.summary.split(':')[1] ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s && s !== 'sourceFacts')
        .map((s) => SECTION_NAMES[s] ?? s);
      return { eventId: event.eventId, at: event.at, text: sections.length ? `Updated your ${sections.join(' and ')}` : 'Updated your details', routine: true };
    }
  }
}

export function ledgerView(events: LedgerEvent[], showRoutine: boolean): { entries: LedgerEntry[]; hiddenRoutine: number } {
  const all = events.map(describeEvent);
  const hiddenRoutine = showRoutine ? 0 : all.filter((entry) => entry.routine).length;
  return { entries: showRoutine ? all : all.filter((entry) => !entry.routine), hiddenRoutine };
}
