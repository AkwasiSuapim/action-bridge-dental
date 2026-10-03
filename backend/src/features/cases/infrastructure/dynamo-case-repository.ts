import { DentalCaseSchema, type DentalCase } from '@actionbridge/contracts';
import { GetCommand, PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { CaseRepository, ReplaceOutcome } from '../ports/case-repository.js';

/** Only `send` is used, which keeps the adapter testable with a stub client. */
export type DocumentClient = Pick<DynamoDBDocumentClient, 'send'>;

/**
 * Single-table layout (system design §9): partition `USER#<owner>#CASE#<caseId>`, sort key `CASE`.
 * Owner is part of the key, so no query can reach another user's case. No scans.
 */
export class DynamoCaseRepository implements CaseRepository {
  constructor(
    private readonly client: DocumentClient,
    private readonly tableName: string,
  ) {}

  async create(record: DentalCase, expiresAtEpochSeconds: number | null): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: this.item(record, expiresAtEpochSeconds),
        ConditionExpression: 'attribute_not_exists(pk)',
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

  async replace(record: DentalCase, expectedRevision: number, expiresAtEpochSeconds: number | null): Promise<ReplaceOutcome> {
    try {
      await this.client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: this.item(record, expiresAtEpochSeconds),
          ConditionExpression: 'attribute_exists(pk) AND caseRevision = :expected',
          ExpressionAttributeValues: { ':expected': expectedRevision },
        }),
      );
      return 'replaced';
    } catch (error) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') return 'revision_conflict';
      throw error;
    }
  }

  private item(record: DentalCase, expiresAtEpochSeconds: number | null): Record<string, unknown> {
    return {
      ...caseKey(record.ownerId, record.caseId),
      caseRevision: record.caseRevision,
      case: record,
      ...(expiresAtEpochSeconds !== null ? { expiresAt: expiresAtEpochSeconds } : {}),
    };
  }
}

export function caseKey(ownerId: string, caseId: string): { pk: string; sk: string } {
  return { pk: `USER#${encodeURIComponent(ownerId)}#CASE#${caseId}`, sk: 'CASE' };
}
