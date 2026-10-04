import { randomUUID } from 'node:crypto';
import { S3Client } from '@aws-sdk/client-s3';
import { SQSClient } from '@aws-sdk/client-sqs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { jobRoutes } from '../features/agent-jobs/api/job-routes.js';
import { JobService } from '../features/agent-jobs/application/job-service.js';
import { UploadService } from '../features/agent-jobs/application/upload-service.js';
import { S3UploadStore } from '../features/agent-jobs/infrastructure/aws-inputs.js';
import { DynamoJobRepository, SqsJobQueue } from '../features/agent-jobs/infrastructure/aws.js';
import { requireJobQueueUrl, requireTableName, requireUploadBucket } from '../shared/config.js';
import { composeHandler } from './compose.js';
import { dynamoServices } from './dynamo.js';

/** Agent jobs API: create, view, answer, retry, cancel. Enqueues work; never calls the model itself. */
export const handler = composeHandler((config) => {
  const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
  const cases = dynamoServices(config).cases;
  const jobs = new JobService({
    jobs: new DynamoJobRepository(documentClient, requireTableName(config)),
    queue: new SqsJobQueue(new SQSClient({}), requireJobQueueUrl(config)),
    cases,
    now: () => new Date(),
    newId: randomUUID,
    retentionDays: config.retentionDays,
    maxAttempts: 3,
  });
  const uploads = new UploadService({ cases, uploads: new S3UploadStore(new S3Client({}), requireUploadBucket(config)), newId: randomUUID, now: () => new Date() });
  return jobRoutes({ jobs, uploads, authMode: config.authMode });
});
