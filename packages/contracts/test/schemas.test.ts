import { readFileSync } from 'node:fs';
import {
  AgentJobViewSchema,
  CentsSchema,
  DentalCaseInputSchema,
  ERROR_HTTP_STATUS,
  ErrorEnvelopeSchema,
  IsoDateSchema,
  MAX_CENTS,
  PatchCaseRequestSchema,
  RETRY_POLICY,
  retryDelayMs,
  SaveStrategyRequestSchema,
} from '@actionbridge/contracts';
import { describe, expect, it } from 'vitest';

const fixture = JSON.parse(
  readFileSync(new URL('../../../docs/fixtures/dental-regression.json', import.meta.url), 'utf8'),
) as Record<string, unknown>;

function fixtureInput() {
  const { caseRevision, currency, coverageMode, policy, planYears, procedures } = fixture;
  return structuredClone({ caseRevision, currency, coverageMode, policy, planYears, procedures }) as {
    policy: { insurerRateBpsByCategory: Record<string, number> };
    planYears: Record<string, Record<string, unknown>>;
    procedures: Record<string, unknown>[];
  };
}

describe('regression fixture conforms to the shared case contract', () => {
  it('parses without changes', () => {
    const input = fixtureInput();
    expect(DentalCaseInputSchema.parse(input)).toEqual(input);
  });
});

describe('Q-12 malformed numbers and values are rejected before any calculation', () => {
  it.each([
    ['negative', -1],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['fractional cents', 10.5],
    ['above the safe bound', MAX_CENTS + 1],
  ])('cents: %s', (_name, value) => {
    expect(CentsSchema.safeParse(value).success).toBe(false);
    const input = fixtureInput();
    input.procedures[0]!.providerChargeCents = value;
    expect(DentalCaseInputSchema.safeParse(input).success).toBe(false);
  });

  it('coverage rate above 100%', () => {
    const input = fixtureInput();
    input.policy.insurerRateBpsByCategory.basic = 10001;
    expect(DentalCaseInputSchema.safeParse(input).success).toBe(false);
  });

  it.each(['2026-02-30', '2026-13-01', '2026-1-01', '2026-11-10T00:00:00Z', ''])('date "%s"', (value) => {
    expect(IsoDateSchema.safeParse(value).success).toBe(false);
  });

  it('accepts a leap day', () => {
    expect(IsoDateSchema.safeParse('2028-02-29').success).toBe(true);
  });

  it('rejects unknown fields instead of silently dropping them', () => {
    const input = fixtureInput();
    input.procedures[0]!.urgency = 'high';
    expect(DentalCaseInputSchema.safeParse(input).success).toBe(false);
  });

  it('keeps unknown values as null rather than defaulting them', () => {
    const input = fixtureInput();
    input.planYears['py-2026']!.insurerAlreadyPaidCents = null;
    input.procedures[0]!.allowedCents = null;
    const parsed = DentalCaseInputSchema.parse(input);
    expect(parsed.planYears['py-2026']?.insurerAlreadyPaidCents).toBeNull();
    expect(parsed.procedures[0]?.allowedCents).toBeNull();

    delete input.procedures[0]!.allowedCents;
    expect(DentalCaseInputSchema.safeParse(input).success).toBe(false);
  });
});

describe('request contracts', () => {
  it('a save requires explicit consent', () => {
    expect(SaveStrategyRequestSchema.safeParse({ scenarioId: 'alt-1', expectedRevision: 2, consent: true }).success).toBe(true);
    expect(SaveStrategyRequestSchema.safeParse({ scenarioId: 'alt-1', expectedRevision: 2, consent: false }).success).toBe(false);
  });

  it('a patch must carry the expected revision and at least one change', () => {
    expect(PatchCaseRequestSchema.safeParse({ expectedRevision: 1, changes: {} }).success).toBe(false);
    expect(PatchCaseRequestSchema.safeParse({ changes: { policy: null } }).success).toBe(false);
    expect(PatchCaseRequestSchema.safeParse({ expectedRevision: 1, changes: { policy: null } }).success).toBe(true);
  });
});

describe('error envelope', () => {
  it('accepts the documented nested example', () => {
    const example = {
      error: {
        code: 'REVISION_CONFLICT',
        message: 'Your plan changed. Recalculate before saving.',
        retryable: false,
        requestId: 'request-demo-001',
      },
    };
    expect(ErrorEnvelopeSchema.parse(example)).toEqual(example);
  });

  it('rejects the legacy top-level shape the old mobile adapter expected', () => {
    expect(ErrorEnvelopeSchema.safeParse({ code: 'NOT_FOUND', message: 'x', retryable: false }).success).toBe(false);
  });

  it('maps codes to the documented HTTP statuses', () => {
    expect(ERROR_HTTP_STATUS.BAD_REQUEST).toBe(400);
    expect(ERROR_HTTP_STATUS.REVISION_CONFLICT).toBe(409);
    expect(ERROR_HTTP_STATUS.IDEMPOTENCY_CONFLICT).toBe(409);
    expect(ERROR_HTTP_STATUS.INCONSISTENT_INPUT).toBe(422);
    expect(ERROR_HTTP_STATUS.RATE_LIMITED).toBe(429);
  });

  it('retry delays use bounded exponential backoff with full jitter', () => {
    expect(retryDelayMs(1, () => 0.999)).toBeLessThan(RETRY_POLICY.baseDelayMs);
    expect(retryDelayMs(2, () => 0.999)).toBeLessThan(RETRY_POLICY.baseDelayMs * 2);
    expect(retryDelayMs(10, () => 0.999)).toBeLessThan(RETRY_POLICY.maxDelayMs);
    expect(retryDelayMs(3, () => 0)).toBe(0);
  });
});

describe('agent job view', () => {
  it('accepts a running job with a sequence-numbered stage event', () => {
    const job = {
      jobId: 'job-1',
      caseId: 'case-1',
      caseRevision: 2,
      operation: 'interpret',
      status: 'running',
      attempt: 1,
      maxAttempts: 3,
      events: [
        {
          jobId: 'job-1',
          caseRevision: 2,
          sequence: 1,
          stage: 'checking_missing_facts',
          status: 'completed',
          summary: 'Two values need confirmation.',
          at: '2026-10-03T15:00:00.000Z',
        },
      ],
      questions: null,
      resultBlocks: null,
      error: null,
      createdAt: '2026-10-03T14:59:58.000Z',
      updatedAt: '2026-10-03T15:00:00.000Z',
    };
    expect(AgentJobViewSchema.parse(job)).toEqual(job);
    job.events[0]!.sequence = 0;
    expect(AgentJobViewSchema.safeParse(job).success).toBe(false);
  });
});
