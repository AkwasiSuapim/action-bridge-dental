import { loadConfig, type AppConfig } from '../shared/config.js';
import { createRouter, errorResult, type HttpEvent, type HttpResult, type RouteHandler } from '../shared/http.js';
import { logEvent } from '../shared/logger.js';

/**
 * Builds a Lambda handler once per cold start. A configuration error is logged and every
 * request gets a clean 500 envelope — the function never falls back to defaults or mock data.
 */
export function composeHandler(
  build: (config: AppConfig) => Record<string, RouteHandler>,
): (event: HttpEvent) => Promise<HttpResult> {
  try {
    return createRouter(build(loadConfig(process.env)));
  } catch (error) {
    logEvent('error', 'configuration_error', { errorName: error instanceof Error ? error.name : 'UnknownError' });
    return async (event) =>
      errorResult('INTERNAL', 'The service is not configured correctly.', event.requestContext.requestId);
  }
}
