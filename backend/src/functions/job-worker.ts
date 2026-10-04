import { randomUUID } from 'node:crypto';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { runJob, type JobRunnerDeps } from '../features/agent-jobs/application/job-runner.js';
import { BedrockAgentModel, DynamoJobRepository } from '../features/agent-jobs/infrastructure/aws.js';
import { DynamoCaseRepository } from '../features/cases/infrastructure/dynamo-case-repository.js';
import { loadConfig, requireBedrockModelId, requireTableName } from '../shared/config.js';
import { logEvent } from '../shared/logger.js';

const MessageSchema = z.object({ ownerId: z.string().min(1).max(300), jobId: z.string().min(1).max(64) });

interface SqsEvent {
  Records: { messageId: string; body: string }[];
}

let deps: JobRunnerDeps | null = null;
function build(): JobRunnerDeps {
  const config = loadConfig(process.env);
  const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
  const table = requireTableName(config);
  return {
    jobs: new DynamoJobRepository(documentClient, table),
    cases: new DynamoCaseRepository(documentClient, table),
    model: new BedrockAgentModel(new BedrockRuntimeClient({}), requireBedrockModelId(config)),
    now: () => new Date(),
    newId: randomUUID,
    retentionDays: config.retentionDays,
    leaseMs: 120_000,
  };
}

/**
 * SQS worker (batch size 1). Malformed messages are dropped and logged; unexpected errors are
 * reported as batch item failures so SQS redelivers, then the dead-letter queue keeps them.
 */
export const handler = async (event: SqsEvent) => {
  deps ??= build();
  const batchItemFailures: { itemIdentifier: string }[] = [];
  for (const record of event.Records) {
    let message: z.infer<typeof MessageSchema>;
    try {
      message = MessageSchema.parse(JSON.parse(record.body));
    } catch {
      logEvent('warn', 'job_message_malformed', { messageId: record.messageId });
      continue;
    }
    const started = Date.now();
    try {
      const outcome = await runJob(deps, message);
      logEvent('info', 'job_processed', { jobId: message.jobId, outcome, durationMs: Date.now() - started });
    } catch (error) {
      logEvent('error', 'job_worker_error', { jobId: message.jobId, errorName: error instanceof Error ? error.name : 'UnknownError' });
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures };
};
