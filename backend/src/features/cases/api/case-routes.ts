import { CreateCaseRequestSchema, IdSchema, PatchCaseRequestSchema } from '@actionbridge/contracts';
import { resolveOwnerId, type AuthMode } from '../../../shared/auth.js';
import { HttpError, jsonResult, parseBody, type HttpEvent, type RouteHandler } from '../../../shared/http.js';
import type { CaseService } from '../application/case-service.js';

export interface CaseRouteDeps {
  cases: CaseService;
  authMode: AuthMode;
}

export function caseRoutes({ cases, authMode }: CaseRouteDeps): Record<string, RouteHandler> {
  return {
    'POST /v1/cases': async (event) => {
      const ownerId = resolveOwnerId(event, authMode);
      const created = await cases.create(ownerId, parseBody(event, CreateCaseRequestSchema));
      return jsonResult(201, created, event.requestContext.requestId);
    },

    'GET /v1/cases/{caseId}': async (event) => {
      const ownerId = resolveOwnerId(event, authMode);
      const record = await cases.get(ownerId, caseIdFrom(event));
      return jsonResult(200, record, event.requestContext.requestId);
    },

    'PATCH /v1/cases/{caseId}': async (event) => {
      const ownerId = resolveOwnerId(event, authMode);
      const updated = await cases.patch(ownerId, caseIdFrom(event), parseBody(event, PatchCaseRequestSchema));
      return jsonResult(200, updated, event.requestContext.requestId);
    },
  };
}

/** A malformed ID is reported exactly like an unknown one. */
export function caseIdFrom(event: HttpEvent): string {
  const parsed = IdSchema.safeParse(event.pathParameters?.caseId);
  if (!parsed.success) throw new HttpError('NOT_FOUND', 'Case not found.');
  return parsed.data;
}
