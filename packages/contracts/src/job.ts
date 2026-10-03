import { z } from 'zod';
import { ErrorEnvelopeSchema } from './errors.js';
import { IdSchema, IsoDateTimeSchema } from './primitives.js';
import { UiBlockEnvelopeSchema } from './ui-blocks.js';

export const JobStatusSchema = z.enum([
  'queued',
  'running',
  'needs_information',
  'completed',
  'failed',
  'cancelled',
]);

export const TERMINAL_JOB_STATUSES = ['needs_information', 'completed', 'failed', 'cancelled'] as const;

export const JobOperationSchema = z.enum(['interpret', 'explain', 'analyze_document']);

/** Real operational stages. The UI never invents stages or percentages beyond these events. */
export const JobStageKeySchema = z.enum([
  'reading_input',
  'checking_missing_facts',
  'retrieving_evidence',
  'calculating_costs',
  'comparing_dates',
  'preparing_explanation',
  'analyzing',
]);

/**
 * A sanitized status event. `summary` is short operational text such as
 * "Two values need confirmation" — never model reasoning or document contents.
 */
export const JobStageEventSchema = z.strictObject({
  jobId: IdSchema,
  caseRevision: z.number().int().min(1),
  sequence: z.number().int().min(1),
  stage: JobStageKeySchema,
  status: z.enum(['started', 'completed', 'skipped', 'failed']),
  summary: z.string().max(200),
  at: IsoDateTimeSchema,
});

/** `POST /v1/cases/{caseId}/jobs` → 202. */
export const CreateJobRequestSchema = z.strictObject({
  expectedRevision: z.number().int().min(1),
  operation: JobOperationSchema,
  input: z.strictObject({
    text: z.string().max(8000).optional(),
    documentId: IdSchema.optional(),
  }),
});

export const CreateJobResponseSchema = z.strictObject({
  jobId: IdSchema,
});

/** `GET /v1/jobs/{jobId}`. Lease and queue internals are not part of the public contract. */
export const AgentJobViewSchema = z.strictObject({
  jobId: IdSchema,
  caseId: IdSchema,
  caseRevision: z.number().int().min(1),
  operation: JobOperationSchema,
  status: JobStatusSchema,
  attempt: z.number().int().min(1),
  maxAttempts: z.number().int().min(1),
  events: z.array(JobStageEventSchema).max(100),
  /** Present when status is `needs_information`. */
  questions: UiBlockEnvelopeSchema.nullable(),
  /** Explanation and display blocks referencing stored engine results by ID. */
  resultBlocks: UiBlockEnvelopeSchema.nullable(),
  error: ErrorEnvelopeSchema.shape.error.nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

/** `POST /v1/jobs/{jobId}/answers`. */
export const JobAnswersRequestSchema = z.strictObject({
  expectedRevision: z.number().int().min(1),
  answers: z
    .array(
      z.strictObject({
        questionId: IdSchema,
        value: z.union([z.number().int(), z.string().max(200), z.boolean()]).nullable(),
        unknown: z.boolean(),
      }),
    )
    .min(1)
    .max(10),
});

export type JobStatus = z.infer<typeof JobStatusSchema>;
export type JobOperation = z.infer<typeof JobOperationSchema>;
export type JobStageKey = z.infer<typeof JobStageKeySchema>;
export type JobStageEvent = z.infer<typeof JobStageEventSchema>;
export type CreateJobRequest = z.infer<typeof CreateJobRequestSchema>;
export type CreateJobResponse = z.infer<typeof CreateJobResponseSchema>;
export type AgentJobView = z.infer<typeof AgentJobViewSchema>;
export type JobAnswersRequest = z.infer<typeof JobAnswersRequestSchema>;
