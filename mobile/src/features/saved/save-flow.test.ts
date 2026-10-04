import { describe, expect, it } from 'vitest';
import { ApiError } from '../../services/api';
import { classifySaveFailure } from './save-flow';

describe('save failure recovery', () => {
  it('retries unknown outcomes and sends changed cases back to current options', () => {
    expect(classifySaveFailure(new ApiError('NETWORK', 'x', { retryable: true }))).toBe('retry');
    expect(classifySaveFailure(new ApiError('TIMEOUT', 'x'))).toBe('retry');
    expect(classifySaveFailure(new ApiError('REVISION_CONFLICT', 'x'))).toBe('stale');
    expect(classifySaveFailure(new ApiError('NOT_FOUND', 'x'))).toBe('stale');
    expect(classifySaveFailure(new ApiError('UNAUTHENTICATED', 'x'))).toBe('expired');
    expect(classifySaveFailure(new ApiError('IDEMPOTENCY_CONFLICT', 'x'))).toBe('error');
  });
});
