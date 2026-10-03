import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { CaseService } from '../features/cases/application/case-service.js';
import { DynamoCaseRepository } from '../features/cases/infrastructure/dynamo-case-repository.js';
import { requireTableName, type AppConfig } from '../shared/config.js';

/** Case service wired to DynamoDB. Kept apart from compose.ts so the health bundle has no AWS SDK. */
export function dynamoCaseService(config: AppConfig): CaseService {
  const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  });
  return new CaseService({
    repository: new DynamoCaseRepository(documentClient, requireTableName(config)),
    now: () => new Date(),
    newId: randomUUID,
    retentionDays: config.retentionDays,
  });
}
