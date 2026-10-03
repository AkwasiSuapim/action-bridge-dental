import { ENGINE_VERSION } from '@actionbridge/benefits-engine';
import { jsonResult, type RouteHandler } from '../../shared/http.js';

export const API_VERSION = '0.1.0';

/** Health and version only; no sensitive state. */
export function healthRoutes(appEnv: string): Record<string, RouteHandler> {
  return {
    'GET /health': async (event) =>
      jsonResult(
        200,
        { status: 'ok', service: 'actionbridge-dental-api', appEnv, apiVersion: API_VERSION, engineVersion: ENGINE_VERSION },
        event.requestContext.requestId,
      ),
  };
}
