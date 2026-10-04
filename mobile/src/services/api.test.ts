import { describe, expect, it, vi } from 'vitest';
import { createCognitoClient } from '../features/auth/cognito';
import { ApiError, createApiClient } from './api';

type Reply = { status: number; body?: unknown; headers?: Record<string, string> } | 'network-error';

function fakeFetch(...replies: Reply[]) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const reply = replies.shift() ?? { status: 500 };
    if (reply === 'network-error') throw new TypeError('Network request failed');
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status: reply.status,
      headers: { 'content-type': 'application/json', ...reply.headers },
    });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const client = (fetchImpl: typeof fetch, token: string | null = 'token-abc') =>
  createApiClient({ baseUrl: 'https://api.example/dev', getAccessToken: async () => token, fetchImpl, sleep: async () => {}, random: () => 0 });

describe('API client', () => {
  it('calls the planned agent-job routes and validates job views', async () => {
    const view = {
      jobId: 'job-1',
      caseId: 'case-1',
      caseRevision: 2,
      operation: 'interpret',
      status: 'running',
      attempt: 1,
      maxAttempts: 3,
      events: [],
      questions: null,
      resultBlocks: null,
      error: null,
      createdAt: '2026-10-03T16:00:00.000Z',
      updatedAt: '2026-10-03T16:00:01.000Z',
    };
    const { impl, calls } = fakeFetch({ status: 202, body: { jobId: 'job-1' } }, { status: 200, body: view }, { status: 200, body: { ...view, status: 'cancelled' } });
    const api = client(impl);
    await expect(api.createJob('case-1', { expectedRevision: 2, operation: 'interpret', input: { text: 'Two fillings and a crown' } })).resolves.toEqual({ jobId: 'job-1' });
    await expect(api.getJob('job-1')).resolves.toMatchObject({ status: 'running' });
    await expect(api.cancelJob('job-1')).resolves.toMatchObject({ status: 'cancelled' });
    expect(calls.map((c) => `${c.init?.method} ${c.url.replace('https://api.example/dev', '')}`)).toEqual([
      'POST /v1/cases/case-1/jobs',
      'GET /v1/jobs/job-1',
      'POST /v1/jobs/job-1/cancel',
    ]);
  });

  it('reports an ended session once per call, for a missing token and for HTTP 401', async () => {
    const onUnauthenticated = vi.fn();
    const make = (impl: typeof fetch, token: string | null) =>
      createApiClient({ baseUrl: 'https://api.example/dev', getAccessToken: async () => token, fetchImpl: impl, sleep: async () => {}, random: () => 0, onUnauthenticated });
    await expect(make(fakeFetch().impl, null).getCase('c')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(make(fakeFetch({ status: 401 }).impl, 't').estimate('c', 1)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(onUnauthenticated).toHaveBeenCalledTimes(2);
    await make(fakeFetch({ status: 200, body: { caseId: 'c', caseRevision: 1 } }).impl, 't').patchCase('c', { expectedRevision: 1, changes: { coverageMode: 'insured' } });
    expect(onUnauthenticated).toHaveBeenCalledTimes(2);
  });

  it('sends the bearer token and validates the response against the contract', async () => {
    const { impl, calls } = fakeFetch({ status: 201, body: { caseId: 'case-1', caseRevision: 1 } });
    await expect(client(impl).createCase({ currency: 'USD', coverageMode: 'unknown', policy: null, planYears: {}, procedures: [] })).resolves.toEqual({
      caseId: 'case-1',
      caseRevision: 1,
    });
    expect(calls[0]?.url).toBe('https://api.example/dev/v1/cases');
    expect((calls[0]?.init?.headers as Record<string, string>).authorization).toBe('Bearer token-abc');
  });

  it('turns the shared error envelope into a typed error with its request ID', async () => {
    const { impl } = fakeFetch({
      status: 409,
      body: { error: { code: 'REVISION_CONFLICT', message: 'This case changed.', retryable: false, requestId: 'req-9' } },
    });
    const error = await client(impl).estimate('case-1', 1).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'REVISION_CONFLICT', message: 'This case changed.', options: { status: 409, requestId: 'req-9' } });
  });

  it('rejects a response that does not match the contract instead of trusting it', async () => {
    const { impl } = fakeFetch({ status: 200, body: { status: 'estimated', totals: { patientPaysCents: '1200' } } });
    await expect(client(impl).estimate('case-1', 1)).rejects.toMatchObject({ code: 'BAD_RESPONSE' });
  });

  it('retries safe reads with a bounded budget, but never retries writes', async () => {
    const reads = fakeFetch('network-error', 'network-error', 'network-error', { status: 200, body: {} });
    await expect(client(reads.impl).getCase('case-1')).rejects.toMatchObject({ code: 'NETWORK' });
    expect(reads.calls).toHaveLength(3);

    const writes = fakeFetch('network-error', { status: 201, body: { caseId: 'c', caseRevision: 1 } });
    await expect(client(writes.impl).patchCase('case-1', { expectedRevision: 1, changes: { policy: null } })).rejects.toMatchObject({ code: 'NETWORK' });
    expect(writes.calls).toHaveLength(1);
  });

  it('requires a session and reports an expired one', async () => {
    await expect(client(fakeFetch().impl, null).getCase('case-1')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(client(fakeFetch({ status: 401, body: { message: 'Unauthorized' } }).impl).estimate('c', 1)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('sends the idempotency key with a save and reads ledger pages with an encoded cursor', async () => {
    const strategy = {
      strategyId: 'st-1',
      caseId: 'case-1',
      caseRevision: 1,
      savedAt: '2026-10-03T15:00:00.000Z',
      scenario: { bad: true },
    };
    const save = fakeFetch({ status: 201, body: { strategy, replayed: false } });
    await expect(
      client(save.impl).saveStrategy('case-1', { scenarioId: 'alt-1', expectedRevision: 1, consent: true }, 'key-12345678'),
    ).rejects.toMatchObject({ code: 'BAD_RESPONSE' });
    expect((save.calls[0]?.init?.headers as Record<string, string>)['idempotency-key']).toBe('key-12345678');
    expect(save.calls[0]?.url).toBe('https://api.example/dev/v1/cases/case-1/strategies');

    const ledger = fakeFetch({ status: 200, body: { events: [], nextCursor: null } });
    await expect(client(ledger.impl).ledger('case-1', 'TEVER0dFUiM=')).resolves.toEqual({ events: [], nextCursor: null });
    expect(ledger.calls[0]?.url).toBe('https://api.example/dev/v1/cases/case-1/ledger?cursor=TEVER0dFUiM%3D');
  });

  it('encodes case IDs in paths', async () => {
    const { impl, calls } = fakeFetch({ status: 404, body: { error: { code: 'NOT_FOUND', message: 'Case not found.', retryable: false, requestId: 'r' } } });
    await client(impl).getCase('../etc').catch(() => undefined);
    expect(calls[0]?.url).toBe('https://api.example/dev/v1/cases/..%2Fetc');
  });
});

describe('Cognito client', () => {
  const cognito = (fetchImpl: typeof fetch) => createCognitoClient({ region: 'us-east-2', clientId: 'client123', fetchImpl, now: () => 1_000 });

  it('signs in with USER_PASSWORD_AUTH and computes token expiry', async () => {
    const { impl, calls } = fakeFetch({ status: 200, body: { AuthenticationResult: { AccessToken: 'a', RefreshToken: 'r', ExpiresIn: 3600 } } });
    await expect(cognito(impl).signIn('maya@example.com', 'pw')).resolves.toEqual({
      kind: 'signed_in',
      tokens: { accessToken: 'a', refreshToken: 'r', expiresAt: 3_601_000 },
    });
    expect(calls[0]?.url).toBe('https://cognito-idp.us-east-2.amazonaws.com/');
    expect((calls[0]?.init?.headers as Record<string, string>)['X-Amz-Target']).toBe('AWSCognitoIdentityProviderService.InitiateAuth');
  });

  it('surfaces a new-password challenge and friendly errors without echoing service internals', async () => {
    const challenge = fakeFetch({ status: 200, body: { ChallengeName: 'NEW_PASSWORD_REQUIRED', Session: 's1' } });
    await expect(cognito(challenge.impl).signIn('a@b.c', 'pw')).resolves.toEqual({ kind: 'new_password_required', session: 's1' });

    const wrong = fakeFetch({ status: 400, body: { __type: 'NotAuthorizedException', message: 'Incorrect username or password.' } });
    await expect(cognito(wrong.impl).signIn('a@b.c', 'bad')).rejects.toMatchObject({ code: 'NotAuthorizedException', message: 'Email or password is incorrect.' });
  });

  it('keeps the existing refresh token when refreshing', async () => {
    const { impl } = fakeFetch({ status: 200, body: { AuthenticationResult: { AccessToken: 'a2', ExpiresIn: 60 } } });
    await expect(cognito(impl).refresh('r1')).resolves.toEqual({ accessToken: 'a2', refreshToken: 'r1', expiresAt: 61_000 });
  });
});
