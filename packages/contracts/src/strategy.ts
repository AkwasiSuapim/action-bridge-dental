import { z } from 'zod';
import { ScenarioSchema } from './estimate.js';
import { IdSchema, IsoDateTimeSchema } from './primitives.js';

/**
 * An immutable snapshot of the scenario the user chose, at the revision it was calculated for
 * (T6-01). Saving records a decision only: it does not spend benefits, reserve insurer funds,
 * submit a claim or change reported insurer-paid usage.
 */
export const SavedStrategySchema = z.strictObject({
  strategyId: IdSchema,
  caseId: IdSchema,
  caseRevision: z.number().int().min(1),
  scenario: ScenarioSchema,
  savedAt: IsoDateTimeSchema,
});

/** `POST /v1/cases/{caseId}/strategies` → 201 (first save) or 200 (same idempotency key replayed). */
export const SaveStrategyResponseSchema = z.strictObject({
  strategy: SavedStrategySchema,
  /** True when this response replays an earlier save with the same idempotency key. */
  replayed: z.boolean(),
});

/** Idempotency keys are client-generated per user action, e.g. a UUID created when the Save button is tapped. */
export const IdempotencyKeySchema = z
  .string()
  .min(8)
  .max(100)
  .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, digits, hyphens or underscores');

export const LedgerActionSchema = z.enum(['case_created', 'case_updated', 'strategy_saved']);

/** Server-generated record of something that actually happened. Never a simulated action. */
export const LedgerEventSchema = z.strictObject({
  eventId: IdSchema,
  caseId: IdSchema,
  action: LedgerActionSchema,
  actor: z.enum(['user']),
  caseRevision: z.number().int().min(1),
  /** Short operational summary, e.g. "Strategy saved: alt-1". No plan values or personal data. */
  summary: z.string().max(200),
  strategyId: IdSchema.nullable(),
  at: IsoDateTimeSchema,
});

/** `GET /v1/cases/{caseId}/ledger?cursor=` → newest first. */
export const LedgerPageSchema = z.strictObject({
  events: z.array(LedgerEventSchema).max(50),
  nextCursor: z.string().max(500).nullable(),
});

export type SavedStrategy = z.infer<typeof SavedStrategySchema>;
export type SaveStrategyResponse = z.infer<typeof SaveStrategyResponseSchema>;
export type LedgerAction = z.infer<typeof LedgerActionSchema>;
export type LedgerEvent = z.infer<typeof LedgerEventSchema>;
export type LedgerPage = z.infer<typeof LedgerPageSchema>;
