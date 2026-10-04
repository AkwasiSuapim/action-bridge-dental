import { z } from 'zod';
import { ErrorEnvelopeSchema } from './errors.js';
import { IdSchema, IsoDateTimeSchema } from './primitives.js';
import { ResponseModeSchema, UiBlockEnvelopeSchema } from './ui-blocks.js';

export const JobStatusSchema = z.enum([
  'queued',
  'running',
  'needs_information',
  'completed',
  'failed',
  'cancelled',
]);

export const TERMINAL_JOB_STATUSES = ['needs_information', 'completed', 'failed', 'cancelled'] as const;

/** `transcribe_audio` produces an editable transcript that then feeds `interpret` (D-14). */
export const JobOperationSchema = z.enum(['interpret', 'explain', 'analyze_document', 'transcribe_audio']);

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
    /** For `interpret`: up to three uploaded pages read together with the text, in one analysis. */
    documentIds: z.array(IdSchema).max(3).optional(),
  }),
});

export const CreateJobResponseSchema = z.strictObject({
  jobId: IdSchema,
});

/** Body of `POST /v1/jobs/{jobId}/retry` and `/cancel`. */
export const EmptyRequestSchema = z.strictObject({});

/** Upload limits (doc 03 §7): short voice notes and single-page documents or photos. */
export const UPLOAD_LIMITS = {
  audio: { maxBytes: 5 * 1024 * 1024, mimeTypes: ['audio/mp4', 'audio/m4a', 'audio/x-m4a'] },
  document: { maxBytes: 5 * 1024 * 1024, mimeTypes: ['application/pdf', 'image/jpeg', 'image/png'] },
} as const;

/** `POST /v1/cases/{caseId}/uploads`: asks for a short-lived, size- and type-restricted upload slot. */
export const CreateUploadRequestSchema = z
  .strictObject({
    kind: z.enum(['audio', 'document']),
    mimeType: z.string().min(3).max(100),
    sizeBytes: z.number().int().min(1),
  })
  .superRefine((request, ctx) => {
    const limits = UPLOAD_LIMITS[request.kind];
    if (!(limits.mimeTypes as readonly string[]).includes(request.mimeType)) {
      ctx.addIssue({ code: 'custom', path: ['mimeType'], message: `Use ${limits.mimeTypes.join(', ')}` });
    }
    if (request.sizeBytes > limits.maxBytes) ctx.addIssue({ code: 'custom', path: ['sizeBytes'], message: `Files must be ${limits.maxBytes / 1024 / 1024} MB or smaller` });
  });

/**
 * A presigned S3 POST: send `fields` plus the file (form field `file`) to `url` before `expiresAt`.
 * S3 itself enforces the size limit and content type. Then start a job with `documentId: uploadId`.
 */
export const CreateUploadResponseSchema = z.strictObject({
  uploadId: IdSchema,
  url: z.string().url(),
  fields: z.record(z.string(), z.string()),
  expiresAt: IsoDateTimeSchema,
  maxBytes: z.number().int().min(1),
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
  /** For `transcribe_audio`: what was heard, for the user to read and edit before anything is used. */
  transcript: z.string().max(8000).nullish(),
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
        /** How the user answered; voice and photo answers are confirmed by the user before submission. */
        responseMode: ResponseModeSchema,
        /** Uploaded audio or document the answer came from, when any. */
        attachmentId: IdSchema.nullable(),
      })
      .refine((answer) => !(answer.unknown && answer.value !== null), 'An unknown answer cannot also carry a value'),
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
export type CreateUploadRequest = z.infer<typeof CreateUploadRequestSchema>;
export type CreateUploadResponse = z.infer<typeof CreateUploadResponseSchema>;
