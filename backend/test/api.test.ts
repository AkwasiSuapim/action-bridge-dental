import {
  CoverageComparisonSchema,
  CreateCaseResponseSchema,
  DentalCaseSchema,
  ErrorEnvelopeSchema,
  EstimateResultSchema,
  ScenarioComparisonResultSchema,
} from '@actionbridge/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DentalCase } from '@actionbridge/contracts';
import { InMemoryStore } from '../src/shared/in-memory-store.js';
import { composeHandler } from '../src/functions/compose.js';
import { healthRoutes } from '../src/features/health/health-routes.js';
import { createTestApi, fixtureCreateRequest, OTHER, type TestApi } from './helpers.js';

const CREATE = 'POST /v1/cases';
const GET = 'GET /v1/cases/{caseId}';
const PATCH = 'PATCH /v1/cases/{caseId}';
const ESTIMATE = 'POST /v1/cases/{caseId}/estimates';
const SCENARIOS = 'POST /v1/cases/{caseId}/scenarios';

async function createFixtureCase(api: TestApi, mutate?: (body: ReturnType<typeof fixtureCreateRequest>) => void) {
  const body = fixtureCreateRequest();
  mutate?.(body);
  const response = await api.call(CREATE, { body });
  expect(response.status).toBe(201);
  return CreateCaseResponseSchema.parse(response.body);
}

function expectError(response: { status: number; body: unknown }, status: number, code: string) {
  expect(response.status).toBe(status);
  const envelope = ErrorEnvelopeSchema.parse(response.body);
  expect(envelope.error.code).toBe(code);
  return envelope.error;
}

afterEach(() => vi.restoreAllMocks());

describe('health', () => {
  it('reports status and versions only', async () => {
    const response = await createTestApi().call('GET /health', { user: null });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      service: 'actionbridge-dental-api',
      appEnv: 'test',
      apiVersion: '0.1.0',
      engineVersion: '0.1.0',
    });
  });
});

describe('T3-01 case lifecycle', () => {
  it('creates and reads back a case scoped to its owner', async () => {
    const api = createTestApi();
    const { caseId, caseRevision } = await createFixtureCase(api);
    expect(caseRevision).toBe(1);

    const response = await api.call(GET, { caseId });
    expect(response.status).toBe(200);
    const record: DentalCase = DentalCaseSchema.parse(response.body);
    expect(record).toMatchObject({ caseId, caseRevision: 1, status: 'ready', ownerId: 'demo:device-maya-0000000001' });
    expect(record.procedures.map((p) => p.id)).toEqual(['filling-1', 'filling-2', 'crown-1']);
  });

  it('stores incomplete intake as a draft, with unknown values kept as null', async () => {
    const api = createTestApi();
    const { caseId } = await createFixtureCase(api, (b) => (b.procedures[2]!.allowedCents = null));
    const record = (await api.call(GET, { caseId })).body;
    expect(record.status).toBe('draft');
    expect(record.procedures[2].allowedCents).toBeNull();
  });

  it('T3-04 analogue: changing prior benefit usage creates a new revision with a newly calculated estimate', async () => {
    const api = createTestApi();
    const { caseId } = await createFixtureCase(api);
    const before = await api.call(ESTIMATE, { caseId, body: { expectedRevision: 1 } });
    expect(before.body.totals.patientPaysCents).toBe(120000);

    const record = (await api.call(GET, { caseId })).body;
    record.planYears['py-2026'].insurerAlreadyPaidCents = 20000;
    const patched = await api.call(PATCH, { caseId, body: { expectedRevision: 1, changes: { planYears: record.planYears } } });
    expect(patched.status).toBe(200);
    expect(patched.body).toEqual({ caseId, caseRevision: 2 });

    const after = await api.call(ESTIMATE, { caseId, body: { expectedRevision: 2 } });
    expect(after.status).toBe(200);
    // $600 of the maximum remains: fillings $90 + $50, crown capped at $240 insurer → $760 employee.
    expect(after.body.totals.patientPaysCents).toBe(90000);
    expect(after.body.caseRevision).toBe(2);
  });

  it('rejects a stale edit with 409 and leaves the case unchanged', async () => {
    const api = createTestApi();
    const { caseId } = await createFixtureCase(api);
    await api.call(PATCH, { caseId, body: { expectedRevision: 1, changes: { policy: null } } });

    const stale = await api.call(PATCH, { caseId, body: { expectedRevision: 1, changes: { procedures: [] } } });
    expectError(stale, 409, 'REVISION_CONFLICT');
    const record = (await api.call(GET, { caseId })).body;
    expect(record.caseRevision).toBe(2);
    expect(record.procedures).toHaveLength(3);
  });

  it('lets exactly one of two simultaneous edits from the same revision win', async () => {
    const api = createTestApi();
    const { caseId } = await createFixtureCase(api);
    const results = await Promise.all([
      api.call(PATCH, { caseId, body: { expectedRevision: 1, changes: { policy: null } } }),
      api.call(PATCH, { caseId, body: { expectedRevision: 1, changes: { procedures: [] } } }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });
});

describe('T3-01 estimates and scenarios', () => {
  it('returns the fixture estimate and the conditional $725 alternative', async () => {
    const api = createTestApi();
    const { caseId } = await createFixtureCase(api);

    const estimate = await api.call(ESTIMATE, { caseId, body: { expectedRevision: 1 } });
    expect(estimate.status).toBe(200);
    expect(EstimateResultSchema.parse(estimate.body)).toMatchObject({ status: 'estimated', totals: { patientPaysCents: 120000 } });

    const scenarios = await api.call(SCENARIOS, { caseId, body: { expectedRevision: 1 } });
    expect(scenarios.status).toBe(200);
    const comparison = ScenarioComparisonResultSchema.parse(scenarios.body);
    expect(comparison).toMatchObject({
      status: 'estimated',
      outcome: 'alternatives_found',
      baseline: { estimate: { totals: { patientPaysCents: 120000 } } },
      alternatives: [{ differenceFromBaselineCents: 47500, conditional: true, estimate: { totals: { patientPaysCents: 72500 } } }],
    });
  });

  it('compares insured and self-pay, and reports self-pay as unavailable without quotes', async () => {
    const api = createTestApi();
    const { caseId } = await createFixtureCase(api);
    const withoutQuotes = await api.call('POST /v1/cases/{caseId}/coverage-comparison', { caseId, body: { expectedRevision: 1 } });
    expect(withoutQuotes.status).toBe(200);
    expect(CoverageComparisonSchema.parse(withoutQuotes.body)).toMatchObject({
      insured: { status: 'estimated', totals: { patientPaysCents: 120000 } },
      selfPay: { status: 'unavailable' },
      selfPayMinusInsuredCents: null,
    });

    const { caseId: quoted } = await createFixtureCase(api, (b) =>
      b.procedures.forEach((p) => (p.selfPayQuote = { amountCents: 50000, quotedOn: '2026-10-01', source: 'synthetic', includedScope: p.label })),
    );
    const withQuotes = await api.call('POST /v1/cases/{caseId}/coverage-comparison', { caseId: quoted, body: { expectedRevision: 1 } });
    expect(withQuotes.body).toMatchObject({ selfPay: { status: 'available', totalCents: 150000 }, selfPayMinusInsuredCents: 30000 });
  });

  it('refuses to calculate from a stale revision', async () => {
    const api = createTestApi();
    const { caseId } = await createFixtureCase(api);
    expectError(await api.call(ESTIMATE, { caseId, body: { expectedRevision: 2 } }), 409, 'REVISION_CONFLICT');
    expectError(await api.call(SCENARIOS, { caseId, body: { expectedRevision: 0 } }), 400, 'BAD_REQUEST');
  });

  it('returns needs_information (200) for incomplete inputs, never a made-up number', async () => {
    const api = createTestApi();
    const { caseId } = await createFixtureCase(api, (b) => (b.planYears['py-2026']!.insurerAlreadyPaidCents = null));
    const response = await api.call(ESTIMATE, { caseId, body: { expectedRevision: 1 } });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'needs_information',
      missing: [{ fieldPath: 'planYears.py-2026.insurerAlreadyPaidCents' }],
    });
  });

  it('returns unsupported (200) for plan rules the engine does not evaluate', async () => {
    const api = createTestApi();
    const { caseId } = await createFixtureCase(api, (b) =>
      b.policy!.exclusions.push({ id: 'x1', description: 'Cosmetic', categoryIds: ['major'] }),
    );
    const response = await api.call(SCENARIOS, { caseId, body: { expectedRevision: 1 } });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'unsupported', limitations: [{ code: 'EXCLUSION_UNSUPPORTED' }] });
  });

  it('returns 422 with field issues for contradictory inputs', async () => {
    const api = createTestApi();
    const { caseId } = await createFixtureCase(api, (b) => (b.procedures[0]!.allowedCents = 99999));
    const error = expectError(await api.call(ESTIMATE, { caseId, body: { expectedRevision: 1 } }), 422, 'INCONSISTENT_INPUT');
    expect(error.issues).toEqual([expect.objectContaining({ fieldPath: 'procedures.filling-1.allowedCents', code: 'ALLOWED_EXCEEDS_CHARGE' })]);
  });
});

describe('T3-03 ownership and authentication', () => {
  it('another user cannot read, edit or calculate a case — it looks like it does not exist', async () => {
    const api = createTestApi();
    const { caseId } = await createFixtureCase(api);
    expectError(await api.call(GET, { caseId, user: OTHER }), 404, 'NOT_FOUND');
    expectError(await api.call(PATCH, { caseId, user: OTHER, body: { expectedRevision: 1, changes: { policy: null } } }), 404, 'NOT_FOUND');
    expectError(await api.call(ESTIMATE, { caseId, user: OTHER, body: { expectedRevision: 1 } }), 404, 'NOT_FOUND');
    expectError(await api.call(SCENARIOS, { caseId, user: OTHER, body: { expectedRevision: 1 } }), 404, 'NOT_FOUND');
    expectError(await api.call(GET, { caseId: 'case-999' }), 404, 'NOT_FOUND');
  });

  it('demo mode requires a device identifier', async () => {
    const api = createTestApi();
    expectError(await api.call(CREATE, { user: null, body: fixtureCreateRequest() }), 401, 'UNAUTHENTICATED');
    expectError(await api.call(CREATE, { user: 'short', body: fixtureCreateRequest() }), 401, 'UNAUTHENTICATED');
  });

  it('jwt mode uses the authorizer subject and ignores the demo header', async () => {
    const api = createTestApi({ authMode: 'jwt' });
    expectError(await api.call(CREATE, { body: fixtureCreateRequest() }), 401, 'UNAUTHENTICATED');

    const created = await api.call(CREATE, { claims: { sub: 'cognito-sub-1' }, body: fixtureCreateRequest() });
    expect(created.status).toBe(201);
    const { caseId } = created.body;
    expect((await api.call(GET, { caseId, claims: { sub: 'cognito-sub-1' } })).body.ownerId).toBe('user:cognito-sub-1');
    expectError(await api.call(GET, { caseId, claims: { sub: 'cognito-sub-2' } }), 404, 'NOT_FOUND');
  });
});

describe('T3-05 errors are explicit and correlated', () => {
  it('malformed JSON and schema violations are 400 with field paths', async () => {
    const api = createTestApi();
    expectError(await api.call(CREATE, { rawBody: '{not json' }), 400, 'BAD_REQUEST');

    const body = fixtureCreateRequest() as any;
    body.procedures[0].providerChargeCents = -5;
    const error = expectError(await api.call(CREATE, { body }), 400, 'BAD_REQUEST');
    expect(error.issues?.[0]?.fieldPath).toBe('procedures.0.providerChargeCents');
  });

  it('rejects oversized bodies', async () => {
    const api = createTestApi();
    expectError(await api.call(CREATE, { rawBody: JSON.stringify({ pad: 'x'.repeat(70_000) }) }), 400, 'BAD_REQUEST');
  });

  it('unknown routes and malformed IDs are 404', async () => {
    const api = createTestApi();
    expectError(await api.call('DELETE /v1/cases/{caseId}', { caseId: 'case-1' }), 404, 'NOT_FOUND');
    expectError(await api.call(GET, { caseId: '../etc/passwd' }), 404, 'NOT_FOUND');
  });

  it('every response carries a request ID that matches the error envelope', async () => {
    const response = await createTestApi().call(GET, { caseId: 'case-404' });
    expect(response.headers['x-request-id']).toBe(response.body.error.requestId);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('unexpected failures return a generic 500 and never leak internal details', async () => {
    const store = new InMemoryStore();
    vi.spyOn(store, 'get').mockRejectedValue(new Error('DynamoDB connection string secret://abc'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const response = await createTestApi({ store }).call(GET, { caseId: 'case-1' });
    const error = expectError(response, 500, 'INTERNAL');
    expect(JSON.stringify(response.body)).not.toContain('secret');
    expect(error.retryable).toBe(false);
  });

  it('request logs contain IDs, status and timing — never plan values or labels', async () => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((line: string) => void lines.push(line));
    const api = createTestApi();
    const { caseId } = await createFixtureCase(api);
    await api.call(ESTIMATE, { caseId, body: { expectedRevision: 1 } });

    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const line of lines) {
      expect(Object.keys(JSON.parse(line)).sort()).toEqual(['durationMs', 'level', 'message', 'requestId', 'routeKey', 'statusCode']);
      expect(line).not.toMatch(/Crown|Filling|80000|maya/i);
    }
  });
});

describe('configuration fails closed', () => {
  it('a missing setting yields a 500 envelope, not a crash or a silent default', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const saved = { ...process.env };
    try {
      delete process.env.APP_ENV;
      process.env.AUTH_MODE = 'demo';
      const handler = composeHandler((config) => healthRoutes(config.appEnv));
      const result = await handler({ routeKey: 'GET /health', requestContext: { requestId: 'r1' } });
      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).error.code).toBe('INTERNAL');
    } finally {
      process.env = saved;
    }
  });
});
