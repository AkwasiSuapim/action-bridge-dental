import { ErrorEnvelopeSchema, LedgerPageSchema, SaveStrategyResponseSchema } from '@actionbridge/contracts';
import { describe, expect, it } from 'vitest';
import { createTestApi, fixtureCreateRequest, OTHER, type TestApi } from './helpers.js';

const SAVE = 'POST /v1/cases/{caseId}/strategies';
const LEDGER = 'GET /v1/cases/{caseId}/ledger';
const KEY = { 'idempotency-key': 'save-tap-0001' };

async function newCase(api: TestApi, mutate?: (b: ReturnType<typeof fixtureCreateRequest>) => void) {
  const body = fixtureCreateRequest();
  mutate?.(body);
  const created = await api.call('POST /v1/cases', { body });
  expect(created.status).toBe(201);
  return created.body.caseId as string;
}

const errorCode = (response: { body: unknown }) => ErrorEnvelopeSchema.parse(response.body).error.code;

describe('T6-01 save a strategy', () => {
  it('saves a server-computed snapshot of the chosen option', async () => {
    const api = createTestApi();
    const caseId = await newCase(api);
    const response = await api.call(SAVE, { caseId, headers: KEY, body: { scenarioId: 'alt-1', expectedRevision: 1, consent: true } });

    expect(response.status).toBe(201);
    const { strategy, replayed } = SaveStrategyResponseSchema.parse(response.body);
    expect(replayed).toBe(false);
    expect(strategy).toMatchObject({ caseId, caseRevision: 1, scenario: { scenarioId: 'alt-1', differenceFromBaselineCents: 47500 } });
    expect(strategy.scenario.estimate.totals.patientPaysCents).toBe(72500);
  });

  it('a repeated tap with the same key is one logical save', async () => {
    const api = createTestApi();
    const caseId = await newCase(api);
    const body = { scenarioId: 'alt-1', expectedRevision: 1, consent: true };
    const first = await api.call(SAVE, { caseId, headers: KEY, body });
    const second = await api.call(SAVE, { caseId, headers: KEY, body });

    expect([first.status, second.status]).toEqual([201, 200]);
    expect(second.body).toEqual({ strategy: first.body.strategy, replayed: true });
    const ledger = await api.call(LEDGER, { caseId });
    expect(ledger.body.events.filter((e: { action: string }) => e.action === 'strategy_saved')).toHaveLength(1);
  });

  it('two simultaneous saves with the same key produce one strategy and one ledger event', async () => {
    const api = createTestApi();
    const caseId = await newCase(api);
    const body = { scenarioId: 'baseline', expectedRevision: 1, consent: true };
    const results = await Promise.all([api.call(SAVE, { caseId, headers: KEY, body }), api.call(SAVE, { caseId, headers: KEY, body })]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(results[0]?.body.strategy.strategyId).toBe(results[1]?.body.strategy.strategyId);
    const ledger = await api.call(LEDGER, { caseId });
    expect(ledger.body.events.filter((e: { action: string }) => e.action === 'strategy_saved')).toHaveLength(1);
  });

  it('rejects a key reused for a different choice', async () => {
    const api = createTestApi();
    const caseId = await newCase(api);
    await api.call(SAVE, { caseId, headers: KEY, body: { scenarioId: 'alt-1', expectedRevision: 1, consent: true } });
    const reused = await api.call(SAVE, { caseId, headers: KEY, body: { scenarioId: 'baseline', expectedRevision: 1, consent: true } });
    expect(reused.status).toBe(409);
    expect(errorCode(reused)).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('requires a key, explicit consent, the current revision and an option that exists', async () => {
    const api = createTestApi();
    const caseId = await newCase(api);
    const body = { scenarioId: 'alt-1', expectedRevision: 1, consent: true };

    expect(errorCode(await api.call(SAVE, { caseId, body }))).toBe('BAD_REQUEST');
    expect(errorCode(await api.call(SAVE, { caseId, headers: { 'idempotency-key': 'short' }, body }))).toBe('BAD_REQUEST');
    expect(errorCode(await api.call(SAVE, { caseId, headers: KEY, body: { ...body, consent: false } }))).toBe('BAD_REQUEST');
    expect(errorCode(await api.call(SAVE, { caseId, headers: KEY, body: { ...body, expectedRevision: 2 } }))).toBe('REVISION_CONFLICT');
    expect(errorCode(await api.call(SAVE, { caseId, headers: { 'idempotency-key': 'save-tap-0002' }, body: { ...body, scenarioId: 'alt-7' } }))).toBe('NOT_FOUND');
  });

  it('cannot save for an incomplete case', async () => {
    const api = createTestApi();
    const caseId = await newCase(api, (b) => (b.planYears['py-2026']!.insurerAlreadyPaidCents = null));
    const response = await api.call(SAVE, { caseId, headers: KEY, body: { scenarioId: 'baseline', expectedRevision: 1, consent: true } });
    expect(response.status).toBe(422);
  });

  it('another user cannot save to or read the ledger of a case', async () => {
    const api = createTestApi();
    const caseId = await newCase(api);
    expect((await api.call(SAVE, { caseId, user: OTHER, headers: KEY, body: { scenarioId: 'alt-1', expectedRevision: 1, consent: true } })).status).toBe(404);
    expect((await api.call(LEDGER, { caseId, user: OTHER })).status).toBe(404);
  });

  it('Q-17: saving never changes the case or its reported insurer-paid usage', async () => {
    const api = createTestApi();
    const caseId = await newCase(api);
    const before = (await api.call('GET /v1/cases/{caseId}', { caseId })).body;
    await api.call(SAVE, { caseId, headers: KEY, body: { scenarioId: 'alt-1', expectedRevision: 1, consent: true } });
    const after = (await api.call('GET /v1/cases/{caseId}', { caseId })).body;
    expect(after).toEqual(before);
    expect(after.planYears['py-2026'].insurerAlreadyPaidCents).toBe(50000);
  });
});

describe('case ledger', () => {
  it('records real events newest first, with summaries that carry no plan values', async () => {
    const api = createTestApi();
    const caseId = await newCase(api);
    const record = (await api.call('GET /v1/cases/{caseId}', { caseId })).body;
    record.planYears['py-2026'].insurerAlreadyPaidCents = 20000;
    await api.call('PATCH /v1/cases/{caseId}', { caseId, body: { expectedRevision: 1, changes: { planYears: record.planYears } } });
    await api.call(SAVE, { caseId, headers: KEY, body: { scenarioId: 'baseline', expectedRevision: 2, consent: true } });

    const response = await api.call(LEDGER, { caseId });
    expect(response.status).toBe(200);
    const page = LedgerPageSchema.parse(response.body);
    expect(page.events.map((e) => [e.action, e.caseRevision, e.summary])).toEqual([
      ['strategy_saved', 2, 'Strategy saved: baseline'],
      ['case_updated', 2, 'Case updated: planYears'],
      ['case_created', 1, 'Case created'],
    ]);
    expect(JSON.stringify(page)).not.toMatch(/20000|50000|Crown|Filling/);
    expect(page.nextCursor).toBeNull();
  });

  it('pages through long histories', async () => {
    const api = createTestApi();
    const caseId = await newCase(api);
    for (let revision = 1; revision <= 24; revision++) {
      await api.call('PATCH /v1/cases/{caseId}', { caseId, body: { expectedRevision: revision, changes: { coverageMode: 'insured' } } });
    }
    const first = await api.call(LEDGER, { caseId });
    expect(first.body.events).toHaveLength(20);
    const second = await api.call(LEDGER, { caseId, query: { cursor: first.body.nextCursor } });
    expect(second.body.events).toHaveLength(5);
    expect(second.body.nextCursor).toBeNull();
    expect(second.body.events.at(-1).action).toBe('case_created');
  });
});
