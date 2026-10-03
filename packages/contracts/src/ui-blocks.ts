import { z } from 'zod';
import { CentsSchema, CurrencySchema, FieldPathSchema, IdSchema } from './primitives.js';

/**
 * Generative UI = data-driven selection of trusted, app-owned components (mobile doc §5).
 * Blocks carry constrained props only: no code, HTML, URLs, navigation or action authority.
 */

const BlockBase = {
  id: IdSchema,
};

const LabelSchema = z.string().min(1).max(120);
const HelperTextSchema = z.string().max(300).optional();

export const MoneyInputBlockSchema = z
  .strictObject({
    ...BlockBase,
    type: z.literal('money_input'),
    fieldPath: FieldPathSchema,
    label: LabelSchema,
    helperText: HelperTextSchema,
    currency: CurrencySchema,
    minimumCents: CentsSchema,
    maximumCents: CentsSchema,
    allowUnknown: z.boolean(),
    requiredFor: z.array(z.enum(['estimate', 'compare'])).max(2),
  })
  .refine((block) => block.minimumCents <= block.maximumCents, {
    message: 'minimumCents must not exceed maximumCents',
    path: ['minimumCents'],
  });

export const SingleSelectBlockSchema = z.strictObject({
  ...BlockBase,
  type: z.literal('single_select'),
  fieldPath: FieldPathSchema,
  label: LabelSchema,
  helperText: HelperTextSchema,
  options: z
    .array(z.strictObject({ id: IdSchema, label: z.string().min(1).max(60) }))
    .min(2)
    .max(6),
  allowUnknown: z.boolean(),
});

export const DateWindowBlockSchema = z.strictObject({
  ...BlockBase,
  type: z.literal('date_window'),
  procedureId: IdSchema,
  label: LabelSchema,
  helperText: HelperTextSchema,
  allowUnknown: z.boolean(),
});

export const FactReviewBlockSchema = z.strictObject({
  ...BlockBase,
  type: z.literal('fact_review'),
  fieldPath: FieldPathSchema,
  label: LabelSchema,
  candidateValue: z.union([z.string().max(200), z.number(), z.boolean(), z.null()]),
  sourceFactId: IdSchema.nullable(),
});

export const CostSummaryBlockSchema = z.strictObject({
  ...BlockBase,
  type: z.literal('cost_summary'),
  scenarioId: IdSchema,
});

export const ScenarioComparisonBlockSchema = z.strictObject({
  ...BlockBase,
  type: z.literal('scenario_comparison'),
  scenarioIds: z.array(IdSchema).min(1).max(3),
});

export const BenefitsTimelineBlockSchema = z.strictObject({
  ...BlockBase,
  type: z.literal('benefits_timeline'),
  scenarioId: IdSchema,
});

export const EvidenceListBlockSchema = z.strictObject({
  ...BlockBase,
  type: z.literal('evidence_list'),
  sourceFactIds: z.array(IdSchema).min(1).max(20),
});

export const NoticeBlockSchema = z.strictObject({
  ...BlockBase,
  type: z.literal('notice'),
  severity: z.enum(['info', 'warning', 'error']),
  title: z.string().min(1).max(80),
  body: z.string().max(500),
});

export const UiBlockSchema = z.discriminatedUnion('type', [
  MoneyInputBlockSchema,
  SingleSelectBlockSchema,
  DateWindowBlockSchema,
  FactReviewBlockSchema,
  CostSummaryBlockSchema,
  ScenarioComparisonBlockSchema,
  BenefitsTimelineBlockSchema,
  EvidenceListBlockSchema,
  NoticeBlockSchema,
]);

export const UI_BLOCK_SCHEMA_VERSION = 1;

export const UiBlockEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(UI_BLOCK_SCHEMA_VERSION),
  caseRevision: z.number().int().min(1),
  blocks: z.array(UiBlockSchema).min(1).max(10),
});

export type UiBlock = z.infer<typeof UiBlockSchema>;
export type UiBlockType = UiBlock['type'];
export type UiBlockEnvelope = z.infer<typeof UiBlockEnvelopeSchema>;
