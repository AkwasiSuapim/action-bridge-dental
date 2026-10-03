import { RevisionScopedRequestSchema } from '@actionbridge/contracts';
import { compareSchedules } from '@actionbridge/benefits-engine';
import { resolveOwnerId } from '../../shared/auth.js';
import { HttpError, jsonResult, parseBody, type RouteHandler } from '../../shared/http.js';
import { caseIdFrom } from '../cases/api/case-routes.js';
import { toEngineInput } from '../cases/application/case-service.js';
import type { CalculationRouteDeps } from '../estimates/estimate-routes.js';

/** `POST /v1/cases/{caseId}/scenarios` → baseline plus up to two permitted lower-cost alternatives. */
export function scheduleRoutes({ cases, authMode }: CalculationRouteDeps): Record<string, RouteHandler> {
  return {
    'POST /v1/cases/{caseId}/scenarios': async (event) => {
      const ownerId = resolveOwnerId(event, authMode);
      const { expectedRevision } = parseBody(event, RevisionScopedRequestSchema);
      const record = await cases.getAtRevision(ownerId, caseIdFrom(event), expectedRevision);

      const result = compareSchedules(toEngineInput(record));
      if (result.status === 'invalid') {
        throw new HttpError('INCONSISTENT_INPUT', 'Some values contradict each other. Review them and try again.', result.issues);
      }
      return jsonResult(200, result, event.requestContext.requestId);
    },
  };
}
