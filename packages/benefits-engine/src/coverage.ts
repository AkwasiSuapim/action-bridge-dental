import type { CoverageComparison, DentalCaseInput, SelfPayEstimate } from '@actionbridge/contracts';
import { estimateCase, type InvalidResult } from './estimate.js';
import { ENGINE_VERSION } from './version.js';

export type EngineCoverageResult = CoverageComparison | InvalidResult;

/**
 * Insured versus self-pay for the same procedures (doc 05 §3A, D-12). The insured branch is the
 * ordinary baseline estimate; the self-pay branch uses only explicit cash quotes. Neither branch
 * changes reported benefit usage.
 */
export function compareCoverage(input: DentalCaseInput): EngineCoverageResult {
  const insured = estimateCase(input);
  if (insured.status === 'invalid') return insured;

  const selfPay = selfPayEstimate(input);
  const notes: CoverageComparison['notes'] = [];
  let difference: number | null = null;

  if (selfPay.status === 'available') {
    notes.push({
      code: 'CONFIRM_SCOPE_MATCHES',
      message: 'Check that each cash quote covers the same services as the treatment estimate.',
    });
    if (insured.status === 'estimated') {
      difference = selfPay.totalCents - insured.totals.patientPaysCents;
      notes.push({
        code: 'CONFIRM_CASH_BILLING_RULES',
        message: 'Ask the dentist and your plan whether paying cash affects your deductible or benefits before choosing it.',
      });
    }
  }
  if (insured.status === 'estimated' && insured.conditional) {
    notes.push({
      code: 'INSURED_ESTIMATE_CONDITIONAL',
      message: 'The insured estimate depends on an assumption; see its assumptions before comparing.',
    });
  }

  return {
    engineVersion: ENGINE_VERSION,
    caseRevision: input.caseRevision,
    insured,
    selfPay,
    selfPayMinusInsuredCents: difference,
    notes,
  };
}

function selfPayEstimate(input: DentalCaseInput): SelfPayEstimate {
  const missing = input.procedures.filter((p) => p.selfPayQuote === null || p.selfPayQuote === undefined).map((p) => p.id);
  if (input.procedures.length === 0 || missing.length > 0) {
    return { status: 'unavailable', missingQuoteProcedureIds: missing };
  }
  const lines = input.procedures.map((p) => {
    const quote = p.selfPayQuote as NonNullable<typeof p.selfPayQuote>;
    return {
      procedureId: p.id,
      amountCents: quote.amountCents,
      quotedOn: quote.quotedOn,
      source: quote.source,
      includedScope: quote.includedScope,
    };
  });
  return { status: 'available', totalCents: lines.reduce((sum, line) => sum + line.amountCents, 0), lines };
}
