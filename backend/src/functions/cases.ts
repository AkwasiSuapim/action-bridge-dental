import { caseRoutes } from '../features/cases/api/case-routes.js';
import { composeHandler } from './compose.js';
import { dynamoCaseService } from './dynamo.js';

/** POST /v1/cases, GET and PATCH /v1/cases/{caseId}. */
export const handler = composeHandler((config) =>
  caseRoutes({ cases: dynamoCaseService(config), authMode: config.authMode }),
);
