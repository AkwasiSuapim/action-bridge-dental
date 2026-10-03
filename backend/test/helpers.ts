import { readFileSync } from 'node:fs';
import type { CreateCaseRequest } from '@actionbridge/contracts';
import { caseRoutes } from '../src/features/cases/api/case-routes.js';
import { CaseService } from '../src/features/cases/application/case-service.js';
import { estimateRoutes } from '../src/features/estimates/estimate-routes.js';
import { healthRoutes } from '../src/features/health/health-routes.js';
import { ledgerRoutes } from '../src/features/ledger/api/ledger-routes.js';
import { scheduleRoutes } from '../src/features/schedules/schedule-routes.js';
import { strategyRoutes } from '../src/features/strategies/api/strategy-routes.js';
import { StrategyService } from '../src/features/strategies/application/strategy-service.js';
import type { AuthMode } from '../src/shared/auth.js';
import { createRouter, type HttpEvent, type HttpResult } from '../src/shared/http.js';
import { InMemoryStore } from '../src/shared/in-memory-store.js';

export const MAYA = 'device-maya-0000000001';
export const OTHER = 'device-other-000000002';

export function fixtureCreateRequest(): CreateCaseRequest {
  const raw = JSON.parse(
    readFileSync(new URL('../../docs/fixtures/dental-regression.json', import.meta.url), 'utf8'),
  ) as CreateCaseRequest;
  return structuredClone({
    currency: raw.currency,
    coverageMode: raw.coverageMode,
    policy: raw.policy,
    planYears: raw.planYears,
    procedures: raw.procedures,
  });
}

export interface CallOptions {
  caseId?: string;
  body?: unknown;
  user?: string | null;
  claims?: Record<string, unknown>;
  rawBody?: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
}

export interface TestApi {
  store: InMemoryStore;
  call(routeKey: string, options?: CallOptions): Promise<{ status: number; body: any; headers: Record<string, string> }>;
}

export function createTestApi(options: { authMode?: AuthMode; store?: InMemoryStore } = {}): TestApi {
  let ids = 0;
  let requests = 0;
  let tick = 0;
  const store = options.store ?? new InMemoryStore();
  const clock = {
    // Advances one second per call so ledger ordering is deterministic.
    now: () => new Date(Date.UTC(2026, 9, 3, 15, 0, tick++)),
    newId: () => `id-${++ids}`,
    retentionDays: null,
  };
  const cases = new CaseService({ repository: store, ...clock });
  const strategies = new StrategyService({ cases, strategies: store, ...clock });
  const authMode = options.authMode ?? 'demo';
  const deps = { cases, authMode };
  const router = createRouter({
    ...healthRoutes('test'),
    ...caseRoutes(deps),
    ...estimateRoutes(deps),
    ...scheduleRoutes(deps),
    ...strategyRoutes({ strategies, authMode }),
    ...ledgerRoutes({ cases, ledger: store, authMode }),
  });

  return {
    store,
    async call(routeKey, { caseId, body, user = MAYA, claims, rawBody, headers = {}, query } = {}) {
      const event: HttpEvent = {
        routeKey,
        pathParameters: caseId === undefined ? {} : { caseId },
        headers: { ...(user === null ? {} : { 'x-demo-user-id': user }), ...headers },
        ...(query ? { queryStringParameters: query } : {}),
        requestContext: {
          requestId: `req-${++requests}`,
          ...(claims ? { authorizer: { jwt: { claims } } } : {}),
        },
        ...(rawBody !== undefined ? { body: rawBody } : body !== undefined ? { body: JSON.stringify(body) } : {}),
      };
      const result: HttpResult = await router(event);
      return { status: result.statusCode, body: JSON.parse(result.body), headers: result.headers };
    },
  };
}
