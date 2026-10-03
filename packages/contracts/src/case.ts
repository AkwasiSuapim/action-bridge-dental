import { z } from 'zod';
import {
  BasisPointsSchema,
  CentsSchema,
  CurrencySchema,
  FieldPathSchema,
  IdSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
} from './primitives.js';

/**
 * A plan rule the MVP engine does not evaluate (waiting period, exclusion, frequency limit).
 * Its presence makes the case `unsupported` rather than silently treated as covered.
 */
export const PolicyRestrictionSchema = z.strictObject({
  id: IdSchema,
  description: z.string().min(1).max(500),
  categoryIds: z.array(IdSchema).max(20),
});

/** One documented individual PPO-style coinsurance/maximum policy (system design §5). */
export const PolicySchema = z.strictObject({
  id: IdSchema,
  deductibleBeforeCoinsurance: z.boolean(),
  deductibleAppliesByCategory: z.record(IdSchema, z.boolean()),
  insurerRateBpsByCategory: z.record(IdSchema, BasisPointsSchema),
  annualMaximumAppliesByCategory: z.record(IdSchema, z.boolean()),
  rounding: z.literal('half_up_to_cent'),
  allServicesCovered: z.boolean(),
  waitingPeriods: z.array(PolicyRestrictionSchema).max(20),
  exclusions: z.array(PolicyRestrictionSchema).max(20),
  frequencyRestrictions: z.array(PolicyRestrictionSchema).max(20),
  notes: z.string().max(1000).optional(),
});

/** Where a plan year's values came from. Origin is not insurer verification. */
export const PlanYearSourceStatusSchema = z.enum([
  'user_entered',
  'user_confirmed',
  'document_extracted',
  'insurer_confirmed',
  'synthetic_confirmed_input',
  'explicit_unchanged_plan_assumption',
]);

/**
 * A benefit period with its own maximum and deductible. Unknown money values are `null`,
 * never a default of 0.
 */
export const PlanYearSchema = z.strictObject({
  startDate: IsoDateSchema,
  endDate: IsoDateSchema,
  annualMaximumCents: CentsSchema.nullable(),
  /** Insurer payments already reported for this period. Never modified by estimates or saved strategies. */
  insurerAlreadyPaidCents: CentsSchema.nullable(),
  annualDeductibleCents: CentsSchema.nullable(),
  deductibleAlreadyMetCents: CentsSchema.nullable(),
  sourceStatus: PlanYearSourceStatusSchema,
});

export const NetworkStatusSchema = z.enum(['in', 'out', 'unknown']);

/** Who supplied the timing. Only a dentist-supplied window permits the optimizer to move a date. */
export const TimingSourceSchema = z.enum([
  'dentist_supplied',
  'fictional_dentist_supplied',
  'user_reported',
  'unknown',
]);

export const ProcedureSchema = z.strictObject({
  id: IdSchema,
  label: z.string().min(1).max(120),
  cdtCode: z
    .string()
    .regex(/^D\d{4}$/, 'Expected a CDT code such as D2740')
    .nullish(),
  /** Plan-specific benefit class; must exist in the policy's category maps. */
  category: IdSchema,
  network: NetworkStatusSchema,
  providerChargeCents: CentsSchema.nullable(),
  allowedCents: CentsSchema.nullable(),
  contractualWriteoffCents: CentsSchema.nullable(),
  proposedDate: IsoDateSchema.nullable(),
  dentistEarliestDate: IsoDateSchema.nullable(),
  dentistLatestDate: IsoDateSchema.nullable(),
  timingSource: TimingSourceSchema,
  prerequisiteIds: z.array(IdSchema).max(20),
});

/** The calculation-relevant snapshot of a case at one revision. This is the engine's input. */
export const DentalCaseInputSchema = z.strictObject({
  caseRevision: z.number().int().min(1),
  currency: CurrencySchema,
  policy: PolicySchema.nullable(),
  planYears: z.record(IdSchema, PlanYearSchema),
  procedures: z.array(ProcedureSchema).max(20),
});

export const SourceOriginSchema = z.enum([
  'document_extracted',
  'user_entered',
  'agent_proposed',
  'assumption',
  'synthetic',
]);

export const ExtractionStatusSchema = z.enum([
  'not_applicable',
  'extracted',
  'low_confidence',
  'failed',
]);

/**
 * Provenance for one field value. Origin, user confirmation and insurer confirmation are
 * separate facts and must not be collapsed into one badge.
 */
export const SourceFactSchema = z.strictObject({
  id: IdSchema,
  fieldPath: FieldPathSchema,
  value: z.union([z.string().max(500), z.number(), z.boolean(), z.null()]),
  sourceId: IdSchema.nullable(),
  location: z
    .strictObject({
      page: z.number().int().min(1).nullable(),
      section: z.string().max(200).nullable(),
      snippet: z.string().max(500).nullable(),
    })
    .nullable(),
  origin: SourceOriginSchema,
  extractionStatus: ExtractionStatusSchema,
  userConfirmed: z.boolean(),
  insurerConfirmed: z.boolean(),
  conflict: z.boolean(),
  recordedAt: IsoDateTimeSchema,
});

export const CaseStatusSchema = z.enum(['draft', 'ready', 'estimated', 'strategy_saved']);

/** Stored case as returned by `GET /v1/cases/{caseId}`. `ownerId` always comes from auth. */
export const DentalCaseSchema = DentalCaseInputSchema.extend({
  caseId: IdSchema,
  ownerId: z.string().min(1).max(200),
  status: CaseStatusSchema,
  sourceFacts: z.array(SourceFactSchema).max(200),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

// ---- Requests and responses -------------------------------------------------------------

/** `POST /v1/cases`. Missing values are allowed as `null`; owner and revision are server-assigned. */
export const CreateCaseRequestSchema = z.strictObject({
  currency: CurrencySchema,
  policy: PolicySchema.nullable(),
  planYears: z.record(IdSchema, PlanYearSchema),
  procedures: z.array(ProcedureSchema).max(20),
  sourceFacts: z.array(SourceFactSchema).max(200).optional(),
});

export const CreateCaseResponseSchema = z.strictObject({
  caseId: IdSchema,
  caseRevision: z.number().int().min(1),
});

/** `PATCH /v1/cases/{caseId}`. Each supplied section replaces the stored section as a whole. */
export const PatchCaseRequestSchema = z.strictObject({
  expectedRevision: z.number().int().min(1),
  changes: z
    .strictObject({
      policy: PolicySchema.nullable().optional(),
      planYears: z.record(IdSchema, PlanYearSchema).optional(),
      procedures: z.array(ProcedureSchema).max(20).optional(),
      sourceFacts: z.array(SourceFactSchema).max(200).optional(),
    })
    .refine((changes) => Object.keys(changes).length > 0, 'At least one change is required'),
});

/** `POST /v1/cases/{caseId}/estimates` and `/scenarios`. */
export const RevisionScopedRequestSchema = z.strictObject({
  expectedRevision: z.number().int().min(1),
});

/** `POST /v1/cases/{caseId}/strategies`, sent with an `Idempotency-Key` header. */
export const SaveStrategyRequestSchema = z.strictObject({
  scenarioId: IdSchema,
  expectedRevision: z.number().int().min(1),
  consent: z.literal(true),
});

export type PolicyRestriction = z.infer<typeof PolicyRestrictionSchema>;
export type Policy = z.infer<typeof PolicySchema>;
export type PlanYearSourceStatus = z.infer<typeof PlanYearSourceStatusSchema>;
export type PlanYear = z.infer<typeof PlanYearSchema>;
export type NetworkStatus = z.infer<typeof NetworkStatusSchema>;
export type TimingSource = z.infer<typeof TimingSourceSchema>;
export type Procedure = z.infer<typeof ProcedureSchema>;
export type DentalCaseInput = z.infer<typeof DentalCaseInputSchema>;
export type SourceFact = z.infer<typeof SourceFactSchema>;
export type CaseStatus = z.infer<typeof CaseStatusSchema>;
export type DentalCase = z.infer<typeof DentalCaseSchema>;
export type CreateCaseRequest = z.infer<typeof CreateCaseRequestSchema>;
export type CreateCaseResponse = z.infer<typeof CreateCaseResponseSchema>;
export type PatchCaseRequest = z.infer<typeof PatchCaseRequestSchema>;
export type RevisionScopedRequest = z.infer<typeof RevisionScopedRequestSchema>;
export type SaveStrategyRequest = z.infer<typeof SaveStrategyRequestSchema>;
