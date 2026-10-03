import { resolveOwnerId, type AuthMode } from '../../../shared/auth.js';
import { jsonResult, type RouteHandler } from '../../../shared/http.js';
import { caseIdFrom } from '../../cases/api/case-routes.js';
import type { CaseService } from '../../cases/application/case-service.js';
import type { LedgerReader } from '../ports/ledger-reader.js';

export interface LedgerRouteDeps {
  cases: CaseService;
  ledger: LedgerReader;
  authMode: AuthMode;
}

const PAGE_SIZE = 20;

/** `GET /v1/cases/{caseId}/ledger?cursor=` → the owner's case events, newest first. */
export function ledgerRoutes({ cases, ledger, authMode }: LedgerRouteDeps): Record<string, RouteHandler> {
  return {
    'GET /v1/cases/{caseId}/ledger': async (event) => {
      const ownerId = resolveOwnerId(event, authMode);
      const caseId = caseIdFrom(event);
      await cases.get(ownerId, caseId); // 404 for an unknown or another user's case
      const rawCursor = event.queryStringParameters?.cursor;
      const cursor = rawCursor !== undefined && /^[A-Za-z0-9_-]{1,500}$/.test(rawCursor) ? rawCursor : null;
      const page = await ledger.list(ownerId, caseId, cursor, PAGE_SIZE);
      return jsonResult(200, page, event.requestContext.requestId);
    },
  };
}
