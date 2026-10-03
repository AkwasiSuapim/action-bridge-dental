import { healthRoutes } from '../features/health/health-routes.js';
import { composeHandler } from './compose.js';

export const handler = composeHandler((config) => healthRoutes(config.appEnv));
