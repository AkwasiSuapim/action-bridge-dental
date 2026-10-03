import { LedgerEventSchema, type LedgerEvent, type LedgerPage } from '@actionbridge/contracts';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { casePartition, ttl, type DocumentClient } from '../../../shared/dynamo.js';
import type { LedgerReader } from '../ports/ledger-reader.js';

const PREFIX = 'LEDGER#';

/** Ledger events sort by time within the case partition: `LEDGER#<ISO time>#<eventId>`. */
export function ledgerItem(ownerId: string, event: LedgerEvent, expiresAtEpochSeconds: number | null): Record<string, unknown> {
  return {
    pk: casePartition(ownerId, event.caseId),
    sk: `${PREFIX}${event.at}#${event.eventId}`,
    event,
    ...ttl(expiresAtEpochSeconds),
  };
}

/**
 * The cursor carries only the sort key; the partition is always rebuilt from the authenticated
 * owner, so a forged cursor cannot reach another user's events.
 */
export function encodeCursor(sk: string): string {
  return Buffer.from(sk, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): string | null {
  const sk = Buffer.from(cursor, 'base64url').toString('utf8');
  return sk.startsWith(PREFIX) && sk.length <= 200 ? sk : null;
}

export class DynamoLedgerReader implements LedgerReader {
  constructor(
    private readonly client: DocumentClient,
    private readonly tableName: string,
  ) {}

  async list(ownerId: string, caseId: string, cursor: string | null, limit: number): Promise<LedgerPage> {
    const pk = casePartition(ownerId, caseId);
    const startSk = cursor === null ? null : decodeCursor(cursor);
    const output = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: { ':pk': pk, ':prefix': PREFIX },
        ScanIndexForward: false,
        Limit: limit,
        ConsistentRead: true,
        ...(startSk !== null ? { ExclusiveStartKey: { pk, sk: startSk } } : {}),
      }),
    );
    const events = (output.Items ?? []).map((item) => LedgerEventSchema.parse(item.event));
    const lastSk = output.LastEvaluatedKey?.sk;
    return { events, nextCursor: typeof lastSk === 'string' ? encodeCursor(lastSk) : null };
  }
}
