import { BedrockRuntimeClient, ConverseCommand, type ContentBlock as BedrockContent, type Message } from '@aws-sdk/client-bedrock-runtime';
import { SendMessageCommand, type SQSClient } from '@aws-sdk/client-sqs';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { isConditionFailure, ttl, type DocumentClient } from '../../../shared/dynamo.js';
import {
  ModelError,
  type AgentModel,
  type ContentBlock,
  type JobQueue,
  type JobRecord,
  type JobRepository,
  type JobWriteCondition,
  type ModelTurn,
} from '../ports.js';

/** Jobs live in an owner-scoped partition `USER#<owner>#JOB#<jobId>`, so a job ID alone reaches nothing. */
function jobKey(ownerId: string, jobId: string) {
  return { pk: `USER#${encodeURIComponent(ownerId)}#JOB#${jobId}`, sk: 'JOB' };
}

export class DynamoJobRepository implements JobRepository {
  constructor(
    private readonly client: DocumentClient,
    private readonly tableName: string,
  ) {}

  async create(job: JobRecord, expiresAtEpochSeconds: number | null): Promise<void> {
    await this.client.send(
      new PutCommand({ TableName: this.tableName, Item: this.item(job, expiresAtEpochSeconds), ConditionExpression: 'attribute_not_exists(pk)' }),
    );
  }

  async get(ownerId: string, jobId: string): Promise<JobRecord | null> {
    const output = await this.client.send(new GetCommand({ TableName: this.tableName, Key: jobKey(ownerId, jobId), ConsistentRead: true }));
    const job = output.Item?.job as JobRecord | undefined;
    return job && job.ownerId === ownerId ? job : null;
  }

  async put(job: JobRecord, condition: JobWriteCondition, expiresAtEpochSeconds: number | null): Promise<boolean> {
    const clauses = ['attribute_exists(pk)'];
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = {};
    if (condition.status) {
      names['#status'] = 'status';
      clauses.push(`#status IN (${condition.status.map((s, i) => ((values[`:s${i}`] = s), `:s${i}`)).join(', ')})`);
    }
    if (condition.leaseToken !== undefined) {
      values[':lease'] = condition.leaseToken;
      clauses.push('leaseToken = :lease');
    }
    try {
      await this.client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: this.item(job, expiresAtEpochSeconds),
          ConditionExpression: clauses.join(' AND '),
          ...(Object.keys(names).length > 0 ? { ExpressionAttributeNames: names } : {}),
          ...(Object.keys(values).length > 0 ? { ExpressionAttributeValues: values } : {}),
        }),
      );
      return true;
    } catch (error) {
      if (isConditionFailure(error, 0)) return false;
      throw error;
    }
  }

  private item(job: JobRecord, expiresAtEpochSeconds: number | null) {
    return { ...jobKey(job.ownerId, job.jobId), status: job.status, leaseToken: job.leaseToken, job, ...ttl(expiresAtEpochSeconds) };
  }
}

export class SqsJobQueue implements JobQueue {
  constructor(
    private readonly client: Pick<SQSClient, 'send'>,
    private readonly queueUrl: string,
  ) {}

  async enqueue(message: { ownerId: string; jobId: string }): Promise<void> {
    await this.client.send(new SendMessageCommand({ QueueUrl: this.queueUrl, MessageBody: JSON.stringify(message) }));
  }
}

const RETRYABLE = new Set([
  'ThrottlingException',
  'ServiceUnavailableException',
  'ModelTimeoutException',
  'InternalServerException',
  'ModelNotReadyException',
  'TimeoutError',
]);

/** Bedrock Converse with tool use. Temperature 0 for consistent extraction. */
export class BedrockAgentModel implements AgentModel {
  constructor(
    private readonly client: Pick<BedrockRuntimeClient, 'send'>,
    private readonly modelId: string,
  ) {}

  async converse(request: Parameters<AgentModel['converse']>[0]): Promise<ModelTurn> {
    try {
      const output = await this.client.send(
        new ConverseCommand({
          modelId: this.modelId,
          system: [{ text: request.system }],
          messages: request.messages as unknown as Message[],
          inferenceConfig: { maxTokens: request.maxTokens, temperature: 0 },
          ...(request.tools.length > 0
            ? { toolConfig: { tools: request.tools.map((t) => ({ toolSpec: { name: t.name, description: t.description, inputSchema: { json: t.inputSchema as never } } })) } }
            : {}),
        }),
      );
      const content = (output.output?.message?.content ?? []) as BedrockContent[];
      return { stopReason: output.stopReason ?? 'end_turn', content: content as unknown as ContentBlock[] };
    } catch (error) {
      const name = error instanceof Error ? error.name : 'UnknownError';
      const detail = error instanceof Error ? error.message.slice(0, 300) : null;
      throw new ModelError(`Model call failed: ${name}`, RETRYABLE.has(name), detail);
    }
  }
}
