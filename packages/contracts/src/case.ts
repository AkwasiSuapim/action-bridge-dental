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

/**
 * A dentist's explicit cash (self-pay) price for one procedure (doc 05 §3A, D-12). Unknown is
 * `null`/absent, never 0; a real $0 quote is allowed. An insurer allowed amount is never a cash price.
 */
export const SelfPayQuoteSchema = z.strictObject({
  amountCents: CentsSchema,
  quotedOn: IsoDateSchema,
  source: z.enum(['dentist_quote', 'user_reported', 'synthetic']),
  /** What the quoted price includes, so insured and self-pay scopes can be compared like for like. */
  includedScope: z.string().min(1).max(200),
});

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
  selfPayQuote: SelfPayQuoteSchema.nullish(),
});

/** Whether the person has dental coverage. Describes the current situation, not a purchase recommendation. */
export const CoverageModeSchema = z.enum(['insured', 'self_pay', 'unknown']);

/** The calculation-relevant snapshot of a case at one revision. This is the engine's input. */
export const DentalCaseInputSchema = z.strictObject({
  caseRevision: z.number().int().min(1),
  currency: CurrencySchema,
  coverageMode: CoverageModeSchema,
  policy: PolicySchema.nullable(),
  planYears: z.record(IdSchema, PlanYearSchema),
  procedures: z.array(ProcedureSchema).max(20),
});

export const SourceOriginSchema = z.enum([
  'document_extracted',
  'user_entered',
  'voice_transcribed',
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
 * Insurer verification is a separate fact from origin and user confirmation. "Verified" requires an
 * attributable reference and time; a bare verified flag fails validation (doc 05 §6).
 */
export const InsurerVerificationSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('not_verified') }),
  z.strictObject({
    status: z.literal('verified'),
    reference: z.string().min(1).max(100),
    verifiedAt: IsoDateTimeSchema,
  }),
]);

/**
 * Provenance for one field value. Origin, user confirmation and insurer verification are
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
      /** For voice answers: the transcript span the value came from. */
      transcriptSpan: z
        .strictObject({ startMs: z.number().int().min(0), endMs: z.number().int().min(0) })
        .refine((span) => span.startMs <= span.endMs, 'Transcript span ends before it starts')
        .nullish(),
    })
    .nullable(),
  /** Date printed on the source document, when it has one. */
  documentDate: IsoDateSchema.nullish(),
  origin: SourceOriginSchema,
  extractionStatus: ExtractionStatusSchema,
  userConfirmed: z.boolean(),
  insurerVerification: InsurerVerificationSchema,
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
  coverageMode: CoverageModeSchema,
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
      coverageMode: CoverageModeSchema.optional(),
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
export type SelfPayQuote = z.infer<typeof SelfPayQuoteSchema>;
export type CoverageMode = z.infer<typeof CoverageModeSchema>;
export type InsurerVerification = z.infer<typeof InsurerVerificationSchema>;
export type DentalCaseInput = z.infer<typeof DentalCaseInputSchema>;
export type SourceFact = z.infer<typeof SourceFactSchema>;
export type CaseStatus = z.infer<typeof CaseStatusSchema>;
export type DentalCase = z.infer<typeof DentalCaseSchema>;
export type CreateCaseRequest = z.infer<typeof CreateCaseRequestSchema>;
export type CreateCaseResponse = z.infer<typeof CreateCaseResponseSchema>;
export type PatchCaseRequest = z.infer<typeof PatchCaseRequestSchema>;
export type RevisionScopedRequest = z.infer<typeof RevisionScopedRequestSchema>;
export type SaveStrategyRequest = z.infer<typeof SaveStrategyRequestSchema>;
