import { estimateRoutes } from '../features/estimates/estimate-routes.js';
import { scheduleRoutes } from '../features/schedules/schedule-routes.js';
import { composeHandler } from './compose.js';
import { dynamoCaseService } from './dynamo.js';

/** POST /v1/cases/{caseId}/estimates and /scenarios. Read-only access to cases. */
export const handler = composeHandler((config) => {
  const deps = { cases: dynamoCaseService(config), authMode: config.authMode };
  return { ...estimateRoutes(deps), ...scheduleRoutes(deps) };
});
