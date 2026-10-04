import type { LedgerEvent, SavedStrategy } from '@actionbridge/contracts';

export interface IdempotencyRecord {
  strategy: SavedStrategy;
  /** Fingerprint of the original request, to detect the same key reused for a different request. */
  requestFingerprint: string;
}

export type SaveOutcome = 'saved' | 'revision_conflict' | 'idempotency_key_taken';

export interface StrategySave {
  ownerId: string;
  idempotencyKey: string;
  requestFingerprint: string;
  expectedRevision: number;
  strategy: SavedStrategy;
  event: LedgerEvent;
  expiresAtEpochSeconds: number | null;
}

/**
 * Saves are atomic: the case must still be at `expectedRevision`, the idempotency key must be
 * unused, and the strategy, idempotency record and ledger event are written together.
 */
export interface StrategyRepository {
  findByIdempotencyKey(ownerId: string, caseId: string, idempotencyKey: string): Promise<IdempotencyRecord | null>;
  save(input: StrategySave): Promise<SaveOutcome>;
  /** Saved strategies for one of the owner's cases, any order. */
  listForCase(ownerId: string, caseId: string): Promise<SavedStrategy[]>;
}
