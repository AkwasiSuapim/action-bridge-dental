import { IdempotencyKeySchema, SaveStrategyRequestSchema } from '@actionbridge/contracts';
import { resolveOwnerId, type AuthMode } from '../../../shared/auth.js';
import { HttpError, jsonResult, parseBody, type RouteHandler } from '../../../shared/http.js';
import { caseIdFrom } from '../../cases/api/case-routes.js';
import type { StrategyService } from '../application/strategy-service.js';

export interface StrategyRouteDeps {
  strategies: StrategyService;
  authMode: AuthMode;
}

/**
 * `POST /v1/cases/{caseId}/strategies` with an `Idempotency-Key` header and
 * `{scenarioId, expectedRevision, consent: true}` → 201 first save, 200 replay,
 * 409 stale revision or reused key, 404 unknown option.
 */
export function strategyRoutes({ strategies, authMode }: StrategyRouteDeps): Record<string, RouteHandler> {
  return {
    'POST /v1/cases/{caseId}/strategies': async (event) => {
      const ownerId = resolveOwnerId(event, authMode);
      const key = IdempotencyKeySchema.safeParse(event.headers?.['idempotency-key']);
      if (!key.success) {
        throw new HttpError('BAD_REQUEST', 'Saving requires an Idempotency-Key header (8–100 letters, digits, hyphens or underscores).');
      }
      const result = await strategies.save(ownerId, caseIdFrom(event), key.data, parseBody(event, SaveStrategyRequestSchema));
      return jsonResult(result.replayed ? 200 : 201, result, event.requestContext.requestId);
    },
    'GET /v1/cases/{caseId}/strategies': async (event) => {
      const ownerId = resolveOwnerId(event, authMode);
      return jsonResult(200, await strategies.list(ownerId, caseIdFrom(event)), event.requestContext.requestId);
    },
  };
}
