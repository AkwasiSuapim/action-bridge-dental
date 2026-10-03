import { readFileSync } from 'node:fs';
import type { CreateCaseRequest } from '@actionbridge/contracts';
import { caseRoutes } from '../src/features/cases/api/case-routes.js';
import { CaseService } from '../src/features/cases/application/case-service.js';
import { InMemoryCaseRepository } from '../src/features/cases/infrastructure/in-memory-case-repository.js';
import type { CaseRepository } from '../src/features/cases/ports/case-repository.js';
import { estimateRoutes } from '../src/features/estimates/estimate-routes.js';
import { healthRoutes } from '../src/features/health/health-routes.js';
import { scheduleRoutes } from '../src/features/schedules/schedule-routes.js';
import type { AuthMode } from '../src/shared/auth.js';
import { createRouter, type HttpEvent, type HttpResult } from '../src/shared/http.js';

export const MAYA = 'device-maya-0000000001';
export const OTHER = 'device-other-000000002';

export function fixtureCreateRequest(): CreateCaseRequest {
  const raw = JSON.parse(
    readFileSync(new URL('../../docs/fixtures/dental-regression.json', import.meta.url), 'utf8'),
  ) as CreateCaseRequest;
  return structuredClone({ currency: raw.currency, policy: raw.policy, planYears: raw.planYears, procedures: raw.procedures });
}

export interface TestApi {
  call(routeKey: string, options?: { caseId?: string; body?: unknown; user?: string | null; claims?: Record<string, unknown>; rawBody?: string }): Promise<{ status: number; body: any; headers: Record<string, string> }>;
}

export function createTestApi(options: { authMode?: AuthMode; repository?: CaseRepository } = {}): TestApi {
  let ids = 0;
  let requests = 0;
  const cases = new CaseService({
    repository: options.repository ?? new InMemoryCaseRepository(),
    now: () => new Date('2026-10-03T15:00:00.000Z'),
    newId: () => `case-${++ids}`,
    retentionDays: null,
  });
  const authMode = options.authMode ?? 'demo';
  const deps = { cases, authMode };
  const router = createRouter({ ...healthRoutes('test'), ...caseRoutes(deps), ...estimateRoutes(deps), ...scheduleRoutes(deps) });

  return {
    async call(routeKey, { caseId, body, user = MAYA, claims, rawBody } = {}) {
      const event: HttpEvent = {
        routeKey,
        pathParameters: caseId === undefined ? {} : { caseId },
        headers: user === null ? {} : { 'x-demo-user-id': user },
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
