import { z } from 'zod';
import { CoverageIssueSchema } from './estimate.js';
import { CentsSchema, CurrencySchema, FieldPathSchema, IdSchema, IsoDateSchema } from './primitives.js';

/**
 * Generative UI = data-driven selection of trusted, app-owned components (mobile doc §5, D-13).
 * Blocks carry constrained props only: no code, HTML, URLs, navigation or action authority.
 */

const LabelSchema = z.string().min(1).max(120);

/** How the user may answer. Voice and photo supplement accessible controls; they are never mandatory. */
export const ResponseModeSchema = z.enum(['tap', 'type', 'voice', 'photo', 'upload']);

export const QuestionInputTypeSchema = z.enum(['currency', 'single_select', 'date', 'fact_review', 'attachment']);

/**
 * One focused question for one unresolved field (doc 05 adaptive loop). The engine, not the
 * model, decides which facts are required; the model may only phrase and select among them.
 */
export const MissingFieldBlockSchema = z
  .strictObject({
    id: IdSchema,
    type: z.literal('missing_field'),
    questionId: IdSchema,
    fieldPath: FieldPathSchema,
    inputType: QuestionInputTypeSchema,
    label: LabelSchema,
    /** Why this matters, e.g. "This determines how much of your annual maximum remains." */
    reason: z.string().min(1).max(300),
    options: z.array(z.strictObject({ id: IdSchema, label: z.string().min(1).max(60) })).max(6),
    allowedResponseModes: z.array(ResponseModeSchema).min(1).max(5),
    required: z.boolean(),
    /** Every question offers a useful "I don't know" route unless the answer is a plain review. */
    allowUnknown: z.boolean(),
    sourceRefs: z.array(IdSchema).max(10),
    expectedRevision: z.number().int().min(1),
    currency: CurrencySchema.optional(),
    minimumCents: CentsSchema.optional(),
    maximumCents: CentsSchema.optional(),
    earliestDate: IsoDateSchema.optional(),
    latestDate: IsoDateSchema.optional(),
    candidateValue: z.union([z.string().max(200), z.number(), z.boolean(), z.null()]).optional(),
  })
  .superRefine((block, ctx) => {
    const fail = (message: string, path: string) => ctx.addIssue({ code: 'custom', message, path: [path] });
    if (block.inputType === 'single_select' && block.options.length < 2) fail('A choice needs at least two options', 'options');
    if (block.inputType !== 'single_select' && block.options.length > 0) fail('Options are only for single_select', 'options');
    if (block.inputType === 'currency') {
      if (block.currency === undefined || block.minimumCents === undefined || block.maximumCents === undefined) {
        fail('A currency question needs currency, minimumCents and maximumCents', 'currency');
      } else if (block.minimumCents > block.maximumCents) {
        fail('minimumCents must not exceed maximumCents', 'minimumCents');
      }
    }
    if (block.earliestDate !== undefined && block.latestDate !== undefined && block.earliestDate > block.latestDate) {
      fail('earliestDate must not be after latestDate', 'earliestDate');
    }
    if (block.inputType === 'fact_review' && block.candidateValue === undefined) fail('A fact review needs a candidateValue', 'candidateValue');
  });

/** Insured, self-pay and alternative-timing options side by side, referencing stored results by ID. */
export const CostComparisonBlockSchema = z.strictObject({
  id: IdSchema,
  type: z.literal('cost_comparison'),
  options: z
    .array(
      z.strictObject({
        kind: z.enum(['insured', 'self_pay', 'alternative_timing']),
        scenarioId: IdSchema.nullable(),
        /** False renders "quote needed" / "not available", never an apparent zero-cost option. */
        available: z.boolean(),
      }),
    )
    .min(1)
    .max(3),
});

export const CostSummaryBlockSchema = z.strictObject({
  id: IdSchema,
  type: z.literal('cost_summary'),
  scenarioId: IdSchema,
});

export const BenefitsTimelineBlockSchema = z.strictObject({
  id: IdSchema,
  type: z.literal('benefits_timeline'),
  scenarioId: IdSchema,
});

export const CoverageIssueBlockSchema = z.strictObject({
  id: IdSchema,
  type: z.literal('coverage_issue'),
  issue: CoverageIssueSchema,
});

export const SourceEvidenceBlockSchema = z.strictObject({
  id: IdSchema,
  type: z.literal('source_evidence'),
  sourceFactIds: z.array(IdSchema).min(1).max(20),
});

/** "Questions for my dentist/insurer", assembled from actual unresolved issues. Copy only; never sent. */
export const NextStepBlockSchema = z.strictObject({
  id: IdSchema,
  type: z.literal('next_step'),
  title: z.string().min(1).max(80),
  items: z
    .array(
      z.strictObject({
        id: IdSchema,
        audience: z.enum(['dentist', 'insurer', 'self']),
        text: z.string().min(1).max(200),
        issueId: IdSchema.nullable(),
      }),
    )
    .min(1)
    .max(10),
});

export const NoticeBlockSchema = z.strictObject({
  id: IdSchema,
  type: z.literal('notice'),
  severity: z.enum(['info', 'warning', 'error']),
  title: z.string().min(1).max(80),
  body: z.string().max(500),
});

export const UiBlockSchema = z.discriminatedUnion('type', [
  MissingFieldBlockSchema,
  CostComparisonBlockSchema,
  CostSummaryBlockSchema,
  BenefitsTimelineBlockSchema,
  CoverageIssueBlockSchema,
  SourceEvidenceBlockSchema,
  NextStepBlockSchema,
  NoticeBlockSchema,
]);

export const UI_BLOCK_SCHEMA_VERSION = 1;

export const UiBlockEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(UI_BLOCK_SCHEMA_VERSION),
  caseRevision: z.number().int().min(1),
  blocks: z.array(UiBlockSchema).min(1).max(10),
});

export type ResponseMode = z.infer<typeof ResponseModeSchema>;
export type QuestionInputType = z.infer<typeof QuestionInputTypeSchema>;
export type MissingFieldBlock = z.infer<typeof MissingFieldBlockSchema>;
export type UiBlock = z.infer<typeof UiBlockSchema>;
export type UiBlockType = UiBlock['type'];
export type UiBlockEnvelope = z.infer<typeof UiBlockEnvelopeSchema>;
