import type { ApiError } from '../../services/api';

/**
 * How a failed save is recovered (design v3 Recovery):
 * - `retry`: the outcome is unknown (offline, timeout, server) — retry with the same idempotency key, never a duplicate.
 * - `stale`: the case or option changed — the saved choice would not match; go back to current options.
 * - `expired`: the session ended — sign in again.
 * - `error`: anything else — show the message and reference.
 */
export type SaveFailure = 'retry' | 'stale' | 'expired' | 'error';

export function classifySaveFailure(error: ApiError): SaveFailure {
  switch (error.code) {
    case 'NETWORK':
    case 'TIMEOUT':
    case 'UPSTREAM_UNAVAILABLE':
    case 'RATE_LIMITED':
    case 'INTERNAL':
      return 'retry';
    case 'REVISION_CONFLICT':
    case 'NOT_FOUND':
    case 'INCONSISTENT_INPUT':
      return 'stale';
    case 'UNAUTHENTICATED':
      return 'expired';
    default:
      return error.options.retryable ? 'retry' : 'error';
  }
}
