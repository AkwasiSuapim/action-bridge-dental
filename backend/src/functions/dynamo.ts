import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { CaseService } from '../features/cases/application/case-service.js';
import { DynamoCaseRepository } from '../features/cases/infrastructure/dynamo-case-repository.js';
import { DynamoLedgerReader } from '../features/ledger/infrastructure/dynamo-ledger.js';
import { StrategyService } from '../features/strategies/application/strategy-service.js';
import { DynamoStrategyRepository } from '../features/strategies/infrastructure/dynamo-strategy-repository.js';
import { requireTableName, type AppConfig } from '../shared/config.js';

/** Services wired to DynamoDB. Kept apart from compose.ts so the health bundle has no AWS SDK. */
export function dynamoServices(config: AppConfig) {
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
  const table = requireTableName(config);
  const clock = { now: () => new Date(), newId: randomUUID, retentionDays: config.retentionDays };
  const cases = new CaseService({ repository: new DynamoCaseRepository(client, table), ...clock });
  return {
    cases,
    strategies: new StrategyService({ cases, strategies: new DynamoStrategyRepository(client, table), ...clock }),
    ledger: new DynamoLedgerReader(client, table),
  };
}
