import { z } from 'zod';
import { FieldPathSchema } from './primitives.js';

export const ErrorCodeSchema = z.enum([
  'BAD_REQUEST',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'REVISION_CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'INCONSISTENT_INPUT',
  'RATE_LIMITED',
  'UPSTREAM_UNAVAILABLE',
  'INTERNAL',
]);

/** HTTP status for each error code (system design §6, decision D-02). */
export const ERROR_HTTP_STATUS = {
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  REVISION_CONFLICT: 409,
  IDEMPOTENCY_CONFLICT: 409,
  INCONSISTENT_INPUT: 422,
  RATE_LIMITED: 429,
  UPSTREAM_UNAVAILABLE: 503,
  INTERNAL: 500,
} as const satisfies Record<z.infer<typeof ErrorCodeSchema>, number>;

/** Field-level detail for 400/422 responses. Never contains raw document text. */
export const ErrorIssueSchema = z.strictObject({
  fieldPath: FieldPathSchema.nullable(),
  code: z.string().min(1).max(60),
  message: z.string().max(300),
});

/** The single error shape shared by every endpoint and client adapter. */
export const ErrorEnvelopeSchema = z.strictObject({
  error: z.strictObject({
    code: ErrorCodeSchema,
    message: z.string().min(1).max(300),
    retryable: z.boolean(),
    requestId: z.string().min(1).max(100),
    issues: z.array(ErrorIssueSchema).max(50).optional(),
  }),
});

/** Header carrying the client-generated key for keyed writes (save strategy, reminders). */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

/**
 * Client retry policy: only safe reads or keyed writes, only when the error is retryable,
 * with exponential backoff and full jitter inside a bounded attempt budget.
 */
export const RETRY_POLICY = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 4000,
} as const;

/**
 * Delay before retry `attempt` (1 = first retry). `random` is injected so callers and tests
 * stay deterministic; pass `Math.random` in production.
 */
export function retryDelayMs(attempt: number, random: () => number): number {
  const exponential = RETRY_POLICY.baseDelayMs * 2 ** Math.max(0, attempt - 1);
  const capped = Math.min(RETRY_POLICY.maxDelayMs, exponential);
  return Math.floor(random() * capped);
}

export type ErrorCode = z.infer<typeof ErrorCodeSchema>;
export type ErrorIssue = z.infer<typeof ErrorIssueSchema>;
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;
