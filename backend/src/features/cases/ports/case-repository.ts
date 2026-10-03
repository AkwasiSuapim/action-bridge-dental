import type { DentalCase } from '@actionbridge/contracts';

export type ReplaceOutcome = 'replaced' | 'revision_conflict';

/**
 * Owner-scoped case storage. Every lookup takes the owner ID from authentication, so another
 * user's case is indistinguishable from one that does not exist.
 */
export interface CaseRepository {
  create(record: DentalCase, expiresAtEpochSeconds: number | null): Promise<void>;
  get(ownerId: string, caseId: string): Promise<DentalCase | null>;
  /** Conditional write: succeeds only if the stored revision still equals `expectedRevision`. */
  replace(record: DentalCase, expectedRevision: number, expiresAtEpochSeconds: number | null): Promise<ReplaceOutcome>;
}
