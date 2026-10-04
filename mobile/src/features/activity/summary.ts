import type { DentalCase, LedgerEvent } from '@actionbridge/contracts';

/**
 * One line per case for Home, My plan and Activity (design v3 case status). Derived from the
 * live case and its ledger: a plan counts as saved only for the revision it was saved at.
 */
export type CaseState = 'needs_info' | 'ready' | 'saved' | 'changed';

export interface CaseSummary {
  caseId: string;
  title: string;
  state: CaseState;
  statusText: string;
  detail: string;
  updatedAt: string;
  /** Where "Continue" goes. */
  resume: 'questions' | 'options';
  cta: string;
}

export function caseTitle(record: DentalCase): string {
  const labels = record.procedures.map((p) => p.label);
  if (labels.length === 0) return 'New estimate';
  return labels.length === 1 ? labels[0]! : `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
}

export function caseSummary(record: DentalCase, events: LedgerEvent[]): CaseSummary {
  const saves = events.filter((event) => event.action === 'strategy_saved');
  const savedNow = saves.some((event) => event.caseRevision === record.caseRevision);
  const state: CaseState = record.status === 'draft' ? 'needs_info' : savedNow ? 'saved' : saves.length > 0 ? 'changed' : 'ready';
  const text: Record<CaseState, [string, string, string]> = {
    needs_info: ['Needs information', 'A few details are still missing', 'Continue'],
    ready: ['Ready to review', 'Estimates are ready to compare', 'Review options'],
    saved: ['Plan saved', 'Your chosen plan is saved', 'Open options'],
    changed: ['Changed since you saved', 'Details changed after you saved a plan', 'Review options'],
  };
  const [statusText, detail, cta] = text[state];
  return {
    caseId: record.caseId,
    title: caseTitle(record),
    state,
    statusText,
    detail,
    updatedAt: record.updatedAt,
    resume: state === 'needs_info' ? 'questions' : 'options',
    cta,
  };
}
