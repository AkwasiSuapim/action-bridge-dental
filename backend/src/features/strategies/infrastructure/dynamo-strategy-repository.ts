import { SavedStrategySchema } from '@actionbridge/contracts';
import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { caseKey, casePartition, isConditionFailure, ttl, type DocumentClient } from '../../../shared/dynamo.js';
import { ledgerItem } from '../../ledger/infrastructure/dynamo-ledger.js';
import type { IdempotencyRecord, SaveOutcome, StrategyRepository, StrategySave } from '../ports/strategy-repository.js';

/**
 * One transaction: (0) the case is still at the expected revision, (1) the idempotency key is
 * unused, then the strategy snapshot and its ledger event are written together.
 */
export class DynamoStrategyRepository implements StrategyRepository {
  constructor(
    private readonly client: DocumentClient,
    private readonly tableName: string,
  ) {}

  async findByIdempotencyKey(ownerId: string, caseId: string, idempotencyKey: string): Promise<IdempotencyRecord | null> {
    const output = await this.client.send(
      new GetCommand({ TableName: this.tableName, Key: idempotencyKeyOf(ownerId, caseId, idempotencyKey), ConsistentRead: true }),
    );
    if (output.Item === undefined) return null;
    return { strategy: SavedStrategySchema.parse(output.Item.strategy), requestFingerprint: String(output.Item.requestFingerprint) };
  }

  async save(input: StrategySave): Promise<SaveOutcome> {
    const { ownerId, strategy, expiresAtEpochSeconds } = input;
    try {
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              ConditionCheck: {
                TableName: this.tableName,
                Key: caseKey(ownerId, strategy.caseId),
                ConditionExpression: 'caseRevision = :expected',
                ExpressionAttributeValues: { ':expected': input.expectedRevision },
              },
            },
            {
              Put: {
                TableName: this.tableName,
                Item: {
                  ...idempotencyKeyOf(ownerId, strategy.caseId, input.idempotencyKey),
                  requestFingerprint: input.requestFingerprint,
                  strategy,
                  ...ttl(expiresAtEpochSeconds),
                },
                ConditionExpression: 'attribute_not_exists(pk)',
              },
            },
            {
              Put: {
                TableName: this.tableName,
                Item: { pk: casePartition(ownerId, strategy.caseId), sk: `STRATEGY#${strategy.strategyId}`, strategy, ...ttl(expiresAtEpochSeconds) },
              },
            },
            { Put: { TableName: this.tableName, Item: ledgerItem(ownerId, input.event, expiresAtEpochSeconds) } },
          ],
        }),
      );
      return 'saved';
    } catch (error) {
      if (isConditionFailure(error, 0)) return 'revision_conflict';
      if (isConditionFailure(error, 1)) return 'idempotency_key_taken';
      throw error;
    }
  }
}

function idempotencyKeyOf(ownerId: string, caseId: string, idempotencyKey: string): { pk: string; sk: string } {
  return { pk: casePartition(ownerId, caseId), sk: `IDEMPOTENCY#${idempotencyKey}` };
}
