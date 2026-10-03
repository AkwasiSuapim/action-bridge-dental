import { DentalCaseSchema, type DentalCase, type LedgerEvent } from '@actionbridge/contracts';
import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { caseKey, isConditionFailure, ttl, type DocumentClient } from '../../../shared/dynamo.js';
import { ledgerItem } from '../../ledger/infrastructure/dynamo-ledger.js';
import type { CaseRepository, ReplaceOutcome } from '../ports/case-repository.js';

export { caseKey, type DocumentClient } from '../../../shared/dynamo.js';

/** Case item plus its ledger event, written in one transaction. */
export class DynamoCaseRepository implements CaseRepository {
  constructor(
    private readonly client: DocumentClient,
    private readonly tableName: string,
  ) {}

  async create(record: DentalCase, event: LedgerEvent, expiresAtEpochSeconds: number | null): Promise<void> {
    await this.client.send(
      new TransactWriteCommand({
        TransactItems: [
          { Put: { TableName: this.tableName, Item: this.item(record, expiresAtEpochSeconds), ConditionExpression: 'attribute_not_exists(pk)' } },
          { Put: { TableName: this.tableName, Item: ledgerItem(record.ownerId, event, expiresAtEpochSeconds) } },
        ],
      }),
    );
  }

  async get(ownerId: string, caseId: string): Promise<DentalCase | null> {
    const output = await this.client.send(
      new GetCommand({ TableName: this.tableName, Key: caseKey(ownerId, caseId), ConsistentRead: true }),
    );
    if (output.Item === undefined) return null;
    const record = DentalCaseSchema.parse(output.Item.case);
    // Defense in depth: the key already scopes by owner.
    return record.ownerId === ownerId ? record : null;
  }

  async replace(
    record: DentalCase,
    event: LedgerEvent,
    expectedRevision: number,
    expiresAtEpochSeconds: number | null,
  ): Promise<ReplaceOutcome> {
    try {
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.tableName,
                Item: this.item(record, expiresAtEpochSeconds),
                ConditionExpression: 'attribute_exists(pk) AND caseRevision = :expected',
                ExpressionAttributeValues: { ':expected': expectedRevision },
              },
            },
            { Put: { TableName: this.tableName, Item: ledgerItem(record.ownerId, event, expiresAtEpochSeconds) } },
          ],
        }),
      );
      return 'replaced';
    } catch (error) {
      if (isConditionFailure(error, 0)) return 'revision_conflict';
      throw error;
    }
  }

  private item(record: DentalCase, expiresAtEpochSeconds: number | null): Record<string, unknown> {
    return { ...caseKey(record.ownerId, record.caseId), caseRevision: record.caseRevision, case: record, ...ttl(expiresAtEpochSeconds) };
  }
}
