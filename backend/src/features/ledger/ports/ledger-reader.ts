import type { LedgerPage } from '@actionbridge/contracts';

/** Reads one owner's case events, newest first. Writes happen atomically with the change they record. */
export interface LedgerReader {
  list(ownerId: string, caseId: string, cursor: string | null, limit: number): Promise<LedgerPage>;
}
