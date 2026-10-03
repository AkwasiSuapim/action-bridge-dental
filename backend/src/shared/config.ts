import { z } from 'zod';
import type { AuthMode } from './auth.js';

const EnvSchema = z.object({
  APP_ENV: z.enum(['local', 'dev', 'demo']),
  AUTH_MODE: z.enum(['jwt', 'demo']),
  TABLE_NAME: z.string().min(1).optional(),
  /** Demo data expires via DynamoDB TTL (eventual deletion, not an immediate-delete guarantee). */
  RETENTION_DAYS: z.coerce.number().int().min(1).max(90).optional(),
});

export interface AppConfig {
  appEnv: 'local' | 'dev' | 'demo';
  authMode: AuthMode;
  tableName: string | null;
  retentionDays: number | null;
}

/** Fails closed: a missing or unknown setting is a configuration error, never a silent default. */
export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const parsed = EnvSchema.parse(env);
  return {
    appEnv: parsed.APP_ENV,
    authMode: parsed.AUTH_MODE,
    tableName: parsed.TABLE_NAME ?? null,
    retentionDays: parsed.RETENTION_DAYS ?? null,
  };
}

export function requireTableName(config: AppConfig): string {
  if (config.tableName === null) throw new Error('TABLE_NAME is not configured');
  return config.tableName;
}
