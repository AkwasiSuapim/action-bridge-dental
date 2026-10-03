import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

/** Only `send` is used, which keeps adapters testable with a stub client. */
export type DocumentClient = Pick<DynamoDBDocumentClient, 'send'>;

/**
 * Single-table layout (system design §9): one partition per owner's case,
 * `USER#<owner>#CASE#<caseId>`, with sort keys `CASE`, `LEDGER#<time>#<eventId>`,
 * `STRATEGY#<id>` and `IDEMPOTENCY#<key>`. The owner is always part of the partition key.
 */
export function casePartition(ownerId: string, caseId: string): string {
  return `USER#${encodeURIComponent(ownerId)}#CASE#${caseId}`;
}

export function caseKey(ownerId: string, caseId: string): { pk: string; sk: string } {
  return { pk: casePartition(ownerId, caseId), sk: 'CASE' };
}

export function ttl(expiresAtEpochSeconds: number | null): { expiresAt?: number } {
  return expiresAtEpochSeconds !== null ? { expiresAt: expiresAtEpochSeconds } : {};
}

/** True when a write failed because the condition on transaction item `index` (or a single put) failed. */
export function isConditionFailure(error: unknown, index: number): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'ConditionalCheckFailedException') return true;
  if (error.name !== 'TransactionCanceledException') return false;
  const reasons = (error as Error & { CancellationReasons?: { Code?: string }[] }).CancellationReasons;
  return reasons?.[index]?.Code === 'ConditionalCheckFailed';
}

/** Retention for demo records (DynamoDB TTL: eventual deletion, not an immediate-delete guarantee). */
export function expiresAtFrom(now: Date, retentionDays: number | null): number | null {
  return retentionDays === null ? null : Math.floor(now.getTime() / 1000) + retentionDays * 86_400;
}
