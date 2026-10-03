import { HttpError, type HttpEvent } from './http.js';

/**
 * - `jwt`: owner is the `sub` claim from the API Gateway JWT authorizer (Cognito/OIDC).
 * - `demo`: synthetic-data-only environment without login. Each device sends a random
 *   `x-demo-user-id`; this isolates demo sessions from each other but is NOT authentication.
 *   Never use demo mode with real dental documents or patient data.
 */
export type AuthMode = 'jwt' | 'demo';

const DEMO_USER_PATTERN = /^[A-Za-z0-9-]{16,64}$/;

export function resolveOwnerId(event: HttpEvent, mode: AuthMode): string {
  if (mode === 'jwt') {
    const sub = event.requestContext.authorizer?.jwt?.claims?.sub;
    if (typeof sub !== 'string' || sub.length === 0) {
      throw new HttpError('UNAUTHENTICATED', 'Sign in to continue.');
    }
    return `user:${sub}`;
  }
  const demoUser = event.headers?.['x-demo-user-id'];
  if (demoUser === undefined || !DEMO_USER_PATTERN.test(demoUser)) {
    throw new HttpError('UNAUTHENTICATED', 'Demo mode requires an x-demo-user-id device identifier.');
  }
  return `demo:${demoUser}`;
}
