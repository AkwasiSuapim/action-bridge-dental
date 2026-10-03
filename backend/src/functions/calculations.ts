import { estimateRoutes } from '../features/estimates/estimate-routes.js';
import { scheduleRoutes } from '../features/schedules/schedule-routes.js';
import { composeHandler } from './compose.js';
import { dynamoServices } from './dynamo.js';

/** Estimates, scenarios and coverage comparison. Read-only access to cases. */
export const handler = composeHandler((config) => {
  const deps = { cases: dynamoServices(config).cases, authMode: config.authMode };
  return { ...estimateRoutes(deps), ...scheduleRoutes(deps) };
});
