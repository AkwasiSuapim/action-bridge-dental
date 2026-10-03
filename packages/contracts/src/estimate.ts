import { z } from 'zod';
import { BasisPointsSchema, CentsSchema, FieldPathSchema, IdSchema, IsoDateSchema } from './primitives.js';

export const ScheduleEntrySchema = z.strictObject({
  procedureId: IdSchema,
  date: IsoDateSchema,
});

/**
 * One procedure's itemized estimate. Reconciles exactly:
 *   patientPays + insurerPays + contractualWriteoff = providerCharge
 *   deductibleApplied + coinsurance + capShortfall + balanceBill = patientPays
 */
export const CostLineSchema = z.strictObject({
  procedureId: IdSchema,
  planYearId: IdSchema,
  date: IsoDateSchema,
  providerChargeCents: CentsSchema,
  allowedCents: CentsSchema,
  contractualWriteoffCents: CentsSchema,
  insurerRateBps: BasisPointsSchema,
  deductibleAppliedCents: CentsSchema,
  coinsuranceCents: CentsSchema,
  capShortfallCents: CentsSchema,
  balanceBillCents: CentsSchema,
  insurerPaysCents: CentsSchema,
  patientPaysCents: CentsSchema,
});

export const EstimateTotalsSchema = z.strictObject({
  providerChargeCents: CentsSchema,
  contractualWriteoffCents: CentsSchema,
  insurerPaysCents: CentsSchema,
  patientPaysCents: CentsSchema,
});

/**
 * Projected use of one plan year's annual maximum under a scenario. `reportedInsurerPaidCents`
 * is the user's reported baseline and is never changed by projections.
 */
export const YearProjectionSchema = z.strictObject({
  planYearId: IdSchema,
  annualMaximumCents: CentsSchema,
  reportedInsurerPaidCents: CentsSchema,
  /** All insurer payments this scenario places in the plan year. */
  scenarioInsurerPaysCents: CentsSchema,
  /** Reported paid plus this scenario's payments that count toward the annual maximum. */
  projectedTotalInsurerPaidCents: CentsSchema,
  remainingMaximumCents: CentsSchema,
  annualDeductibleCents: CentsSchema,
  projectedDeductibleMetCents: CentsSchema,
  assumedPlanTerms: z.boolean(),
});

export const AssumptionSchema = z.strictObject({
  code: z.enum(['UNCHANGED_PLAN_ASSUMED', 'SYNTHETIC_INPUT']),
  message: z.string().max(300),
  planYearId: IdSchema.optional(),
});

export const MissingFactSchema = z.strictObject({
  fieldPath: FieldPathSchema,
  code: z.enum([
    'COVERAGE_MODE_UNKNOWN',
    'POLICY_NOT_SUPPLIED',
    'NO_PROCEDURES',
    'VALUE_UNKNOWN',
    'NETWORK_UNKNOWN',
    'DATE_UNKNOWN',
    'PLAN_YEAR_NOT_SUPPLIED',
    'POLICY_CATEGORY_RULE_MISSING',
  ]),
  message: z.string().max(300),
});

export const LimitationSchema = z.strictObject({
  code: z.enum([
    'NOT_INSURED',
    'DEDUCTIBLE_AFTER_COINSURANCE_UNSUPPORTED',
    'PARTIAL_COVERAGE_UNSUPPORTED',
    'WAITING_PERIOD_UNSUPPORTED',
    'EXCLUSION_UNSUPPORTED',
    'FREQUENCY_RESTRICTION_UNSUPPORTED',
    'CATEGORY_NOT_IN_POLICY',
    'TOO_MANY_PROCEDURES',
    'NEXT_PLAN_YEAR_NOT_SUPPLIED',
    'NEXT_PLAN_YEAR_INCOMPLETE',
  ]),
  message: z.string().max(300),
  fieldPath: FieldPathSchema.optional(),
  procedureId: IdSchema.optional(),
});

/**
 * A specific finding from coverage review (doc 05 §3B): what is missing, conflicting or assumed,
 * which fields it affects, whether it blocks a definitive result, and what resolves it.
 * Never a made-up confidence percentage.
 */
export const CoverageIssueSchema = z.strictObject({
  id: IdSchema,
  code: z.enum([
    'MISSING_REQUIRED_FACT',
    'CONFLICTING_SOURCES',
    'UNCONFIRMED_ASSUMPTION',
    'UNSUPPORTED_RULE',
    'USER_REPORTED_TIMING',
    'NETWORK_UNCONFIRMED',
    'PLAN_YEAR_MISMATCH',
    'SCOPE_MISMATCH',
  ]),
  /** `blocking`: no definitive result; `conditional`: result shown but labeled conditional; `info`: worth knowing. */
  severity: z.enum(['blocking', 'conditional', 'info']),
  fieldPaths: z.array(FieldPathSchema).min(1).max(10),
  message: z.string().min(1).max(300),
  resolution: z.enum([
    'answer_question',
    'upload_document',
    'review_conflict',
    'confirm_with_dentist',
    'confirm_with_insurer',
  ]),
  sourceFactIds: z.array(IdSchema).max(10),
});

const ResultMetaShape = {
  engineVersion: z.string().min(1).max(40),
  caseRevision: z.number().int().min(1),
};

export const EstimatedResultSchema = z.strictObject({
  status: z.literal('estimated'),
  ...ResultMetaShape,
  schedule: z.array(ScheduleEntrySchema),
  lines: z.array(CostLineSchema),
  totals: EstimateTotalsSchema,
  yearProjections: z.record(IdSchema, YearProjectionSchema),
  assumptions: z.array(AssumptionSchema),
  /** True when any line depends on an assumption such as unchanged next-year terms. */
  conditional: z.boolean(),
});

export const NeedsInformationResultSchema = z.strictObject({
  status: z.literal('needs_information'),
  ...ResultMetaShape,
  missing: z.array(MissingFactSchema).min(1),
});

export const UnsupportedResultSchema = z.strictObject({
  status: z.literal('unsupported'),
  ...ResultMetaShape,
  limitations: z.array(LimitationSchema).min(1),
});

/** Response body of `POST /v1/cases/{caseId}/estimates` (HTTP 200). */
export const EstimateResultSchema = z.discriminatedUnion('status', [
  EstimatedResultSchema,
  NeedsInformationResultSchema,
  UnsupportedResultSchema,
]);

export const ScenarioSchema = z.strictObject({
  scenarioId: IdSchema,
  kind: z.enum(['baseline', 'alternative']),
  schedule: z.array(ScheduleEntrySchema),
  movedProcedureIds: z.array(IdSchema),
  estimate: EstimatedResultSchema,
  /** Baseline employee cost minus this scenario's employee cost. Positive means lower estimated cost. */
  differenceFromBaselineCents: z.number().int(),
  conditional: z.boolean(),
});

/**
 * - `alternatives_found`: at least one lower-cost permitted schedule.
 * - `no_lower_cost_alternative`: options were compared; none costs less.
 * - `no_flexible_timing`: no procedure has a dentist window reaching another plan year.
 * - `comparison_incomplete`: an option could not be compared; see `limitations`.
 */
export const ScenarioComparisonOutcomeSchema = z.enum([
  'alternatives_found',
  'no_lower_cost_alternative',
  'no_flexible_timing',
  'comparison_incomplete',
]);

export const ScenarioComparisonSchema = z.strictObject({
  status: z.literal('estimated'),
  ...ResultMetaShape,
  outcome: ScenarioComparisonOutcomeSchema,
  baseline: ScenarioSchema,
  alternatives: z.array(ScenarioSchema).max(2),
  limitations: z.array(LimitationSchema),
  search: z.strictObject({
    selectionRule: z.literal('lowest_estimated_cost_among_evaluated_feasible_options'),
    flexibleProcedureIds: z.array(IdSchema),
    evaluatedAssignments: z.number().int().min(1),
    feasibleAssignments: z.number().int().min(1),
    maxAssignments: z.number().int().min(1),
  }),
});

/** Response body of `POST /v1/cases/{caseId}/scenarios` (HTTP 200). */
export const ScenarioComparisonResultSchema = z.discriminatedUnion('status', [
  ScenarioComparisonSchema,
  NeedsInformationResultSchema,
  UnsupportedResultSchema,
]);

/**
 * Self-pay branch (doc 05 §3A, D-12): only explicit dentist cash quotes. Any procedure without a
 * quote makes the whole branch unavailable — never a partial or zero total.
 */
export const SelfPayEstimateSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('available'),
    totalCents: CentsSchema,
    lines: z.array(
      z.strictObject({
        procedureId: IdSchema,
        amountCents: CentsSchema,
        quotedOn: IsoDateSchema,
        source: z.enum(['dentist_quote', 'user_reported', 'synthetic']),
        includedScope: z.string().min(1).max(200),
      }),
    ),
  }),
  z.strictObject({
    status: z.literal('unavailable'),
    /** Empty when the case has no procedures yet. */
    missingQuoteProcedureIds: z.array(IdSchema).max(20),
  }),
]);

/**
 * Treatment cost under the current plan versus explicit cash quotes for the same procedures.
 * Not the value of buying insurance: premiums and other plan costs are out of scope.
 */
export const CoverageComparisonSchema = z.strictObject({
  engineVersion: z.string().min(1).max(40),
  caseRevision: z.number().int().min(1),
  insured: EstimateResultSchema,
  selfPay: SelfPayEstimateSchema,
  /** Self-pay total minus insured employee estimate; null unless both branches are available. Negative: cash quote is lower. */
  selfPayMinusInsuredCents: z.number().int().nullable(),
  notes: z.array(
    z.strictObject({
      code: z.enum(['CONFIRM_CASH_BILLING_RULES', 'CONFIRM_SCOPE_MATCHES', 'INSURED_ESTIMATE_CONDITIONAL']),
      message: z.string().max(300),
    }),
  ),
});

export type ScheduleEntry = z.infer<typeof ScheduleEntrySchema>;
export type SelfPayEstimate = z.infer<typeof SelfPayEstimateSchema>;
export type CoverageComparison = z.infer<typeof CoverageComparisonSchema>;
export type CostLine = z.infer<typeof CostLineSchema>;
export type EstimateTotals = z.infer<typeof EstimateTotalsSchema>;
export type YearProjection = z.infer<typeof YearProjectionSchema>;
export type Assumption = z.infer<typeof AssumptionSchema>;
export type MissingFact = z.infer<typeof MissingFactSchema>;
export type Limitation = z.infer<typeof LimitationSchema>;
export type CoverageIssue = z.infer<typeof CoverageIssueSchema>;
export type EstimatedResult = z.infer<typeof EstimatedResultSchema>;
export type NeedsInformationResult = z.infer<typeof NeedsInformationResultSchema>;
export type UnsupportedResult = z.infer<typeof UnsupportedResultSchema>;
export type EstimateResult = z.infer<typeof EstimateResultSchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;
export type ScenarioComparisonOutcome = z.infer<typeof ScenarioComparisonOutcomeSchema>;
export type ScenarioComparison = z.infer<typeof ScenarioComparisonSchema>;
export type ScenarioComparisonResult = z.infer<typeof ScenarioComparisonResultSchema>;
