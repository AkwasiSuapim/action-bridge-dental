import { randomUUID } from 'node:crypto';
import { SQSClient } from '@aws-sdk/client-sqs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { jobRoutes } from '../features/agent-jobs/api/job-routes.js';
import { JobService } from '../features/agent-jobs/application/job-service.js';
import { DynamoJobRepository, SqsJobQueue } from '../features/agent-jobs/infrastructure/aws.js';
import { requireJobQueueUrl, requireTableName } from '../shared/config.js';
import { composeHandler } from './compose.js';
import { dynamoServices } from './dynamo.js';

/** Agent jobs API: create, view, answer, retry, cancel. Enqueues work; never calls the model itself. */
export const handler = composeHandler((config) => {
  const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
  const jobs = new JobService({
    jobs: new DynamoJobRepository(documentClient, requireTableName(config)),
    queue: new SqsJobQueue(new SQSClient({}), requireJobQueueUrl(config)),
    cases: dynamoServices(config).cases,
    now: () => new Date(),
    newId: randomUUID,
    retentionDays: config.retentionDays,
    maxAttempts: 3,
  });
  return jobRoutes({ jobs, authMode: config.authMode });
});
