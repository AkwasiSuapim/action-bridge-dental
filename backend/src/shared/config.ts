import { z } from 'zod';
import type { AuthMode } from './auth.js';

const EnvSchema = z.object({
  APP_ENV: z.enum(['local', 'dev', 'demo']),
  AUTH_MODE: z.enum(['jwt', 'demo']),
  TABLE_NAME: z.string().min(1).optional(),
  /** Demo data expires via DynamoDB TTL (eventual deletion, not an immediate-delete guarantee). */
  RETENTION_DAYS: z.coerce.number().int().min(1).max(90).optional(),
  JOB_QUEUE_URL: z.string().url().optional(),
  /** Bedrock model or inference profile ID, e.g. us.anthropic.claude-haiku-4-5-20251001-v1:0. */
  BEDROCK_MODEL_ID: z.string().min(1).optional(),
  /** Private bucket for voice notes and documents (short lifecycle). */
  UPLOAD_BUCKET: z.string().min(3).optional(),
});

export interface AppConfig {
  appEnv: 'local' | 'dev' | 'demo';
  authMode: AuthMode;
  tableName: string | null;
  retentionDays: number | null;
  jobQueueUrl: string | null;
  bedrockModelId: string | null;
  uploadBucket: string | null;
}

/** Fails closed: a missing or unknown setting is a configuration error, never a silent default. */
export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const parsed = EnvSchema.parse(env);
  return {
    appEnv: parsed.APP_ENV,
    authMode: parsed.AUTH_MODE,
    tableName: parsed.TABLE_NAME ?? null,
    retentionDays: parsed.RETENTION_DAYS ?? null,
    jobQueueUrl: parsed.JOB_QUEUE_URL ?? null,
    bedrockModelId: parsed.BEDROCK_MODEL_ID ?? null,
    uploadBucket: parsed.UPLOAD_BUCKET ?? null,
  };
}

function required<T>(value: T | null, name: string): T {
  if (value === null) throw new Error(`${name} is not configured`);
  return value;
}

export const requireTableName = (config: AppConfig) => required(config.tableName, 'TABLE_NAME');
export const requireJobQueueUrl = (config: AppConfig) => required(config.jobQueueUrl, 'JOB_QUEUE_URL');
export const requireBedrockModelId = (config: AppConfig) => required(config.bedrockModelId, 'BEDROCK_MODEL_ID');
export const requireUploadBucket = (config: AppConfig) => required(config.uploadBucket, 'UPLOAD_BUCKET');
