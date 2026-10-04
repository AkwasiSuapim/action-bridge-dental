import {
  AgentJobViewSchema,
  CoverageComparisonSchema,
  CreateJobResponseSchema,
  CreateCaseResponseSchema,
  DentalCaseSchema,
  ErrorEnvelopeSchema,
  EstimateResultSchema,
  LedgerPageSchema,
  RETRY_POLICY,
  retryDelayMs,
  SaveStrategyResponseSchema,
  ScenarioComparisonResultSchema,
  type CreateCaseRequest,
  type CreateJobRequest,
  type JobAnswersRequest,
  type ErrorIssue,
  type PatchCaseRequest,
  type SaveStrategyRequest,
} from '@actionbridge/contracts';
import type { z } from 'zod';

/**
 * Typed client for the live ActionBridge API. Every response is validated against the shared
 * contracts; nothing is cast. Failures surface as ApiError with a user-facing message and the
 * request ID for diagnostics — the client never substitutes sample data for a failed live call.
 */
export type ApiErrorCode =
  | 'NETWORK'
  | 'TIMEOUT'
  | 'UNAUTHENTICATED'
  | 'BAD_RESPONSE'
  | 'BAD_REQUEST'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'REVISION_CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INCONSISTENT_INPUT'
  | 'RATE_LIMITED'
  | 'UPSTREAM_UNAVAILABLE'
  | 'INTERNAL';

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly options: { status?: number; requestId?: string; retryable?: boolean; issues?: ErrorIssue[] } = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  getAccessToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  /** Called once per call that finds the session ended (no token or HTTP 401), before the error is thrown. */
  onUnauthenticated?: () => void;
}

export function createApiClient({
  baseUrl,
  getAccessToken,
  fetchImpl = fetch,
  timeoutMs = 15_000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random = Math.random,
  onUnauthenticated,
}: ApiClientOptions) {
  const sessionEnded = (error: ApiError) => {
    onUnauthenticated?.();
    return error;
  };

  async function once<S extends z.ZodType>(
    method: string,
    path: string,
    schema: S,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<z.infer<S>> {
    const token = await getAccessToken();
    if (!token) throw sessionEnded(new ApiError('UNAUTHENTICATED', 'Your session ended. Sign in again.'));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...extraHeaders },
        signal: controller.signal,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      if (controller.signal.aborted) throw new ApiError('TIMEOUT', 'The server took too long to respond. Your input is safe — try again.', { retryable: true });
      throw new ApiError('NETWORK', 'You appear to be offline. Your input is safe — try again when connected.', { retryable: true });
    } finally {
      clearTimeout(timer);
    }

    const requestId = response.headers.get('x-request-id') ?? undefined;
    const json: unknown = await response.json().catch(() => undefined);

    if (response.status === 401) {
      throw sessionEnded(new ApiError('UNAUTHENTICATED', 'Your session ended. Sign in again.', { status: 401, ...(requestId ? { requestId } : {}) }));
    }
    if (!response.ok) {
      const envelope = ErrorEnvelopeSchema.safeParse(json);
      if (envelope.success) {
        const { code, message, retryable, issues } = envelope.data.error;
        throw new ApiError(code, message, { status: response.status, requestId: envelope.data.error.requestId, retryable, ...(issues ? { issues } : {}) });
      }
      throw new ApiError(response.status >= 500 ? 'UPSTREAM_UNAVAILABLE' : 'BAD_RESPONSE', 'The service returned an unexpected error.', {
        status: response.status,
        retryable: response.status >= 500,
        ...(requestId ? { requestId } : {}),
      });
    }

    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new ApiError('BAD_RESPONSE', 'The service returned data this app version does not understand.', {
        status: response.status,
        ...(requestId ? { requestId } : {}),
      });
    }
    return parsed.data;
  }

  /** Safe reads retry with bounded exponential backoff and jitter; writes never auto-retry. */
  async function read<S extends z.ZodType>(path: string, schema: S): Promise<z.infer<S>> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await once('GET', path, schema);
      } catch (error) {
        const retryable = error instanceof ApiError && error.options.retryable === true;
        if (!retryable || attempt >= RETRY_POLICY.maxAttempts) throw error;
        await sleep(retryDelayMs(attempt, random));
      }
    }
  }

  const casePath = (caseId: string) => `/v1/cases/${encodeURIComponent(caseId)}`;
  const jobPath = (jobId: string) => `/v1/jobs/${encodeURIComponent(jobId)}`;

  return {
    health: () => fetchImpl(`${baseUrl}/health`).then((r) => r.ok),
    createCase: (request: CreateCaseRequest) => once('POST', '/v1/cases', CreateCaseResponseSchema, request),
    getCase: (caseId: string) => read(casePath(caseId), DentalCaseSchema),
    patchCase: (caseId: string, request: PatchCaseRequest) => once('PATCH', casePath(caseId), CreateCaseResponseSchema, request),
    estimate: (caseId: string, expectedRevision: number) =>
      once('POST', `${casePath(caseId)}/estimates`, EstimateResultSchema, { expectedRevision }),
    scenarios: (caseId: string, expectedRevision: number) =>
      once('POST', `${casePath(caseId)}/scenarios`, ScenarioComparisonResultSchema, { expectedRevision }),
    coverageComparison: (caseId: string, expectedRevision: number) =>
      once('POST', `${casePath(caseId)}/coverage-comparison`, CoverageComparisonSchema, { expectedRevision }),
    /**
     * Create the idempotency key once per user action (when Save is tapped) and reuse it for
     * retries of that action, so a double tap or a retry is one logical save.
     */
    saveStrategy: (caseId: string, request: SaveStrategyRequest, idempotencyKey: string) =>
      once('POST', `${casePath(caseId)}/strategies`, SaveStrategyResponseSchema, request, { 'idempotency-key': idempotencyKey }),
    ledger: (caseId: string, cursor?: string) =>
      read(`${casePath(caseId)}/ledger${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, LedgerPageSchema),

    // Agent jobs (system design §6, phases 5–6): interpret, explain, analyze_document, transcribe_audio.
    // Planned routes, not deployed yet; until they are, these fail with NOT_FOUND like any unknown route.
    createJob: (caseId: string, request: CreateJobRequest) => once('POST', `${casePath(caseId)}/jobs`, CreateJobResponseSchema, request),
    /** Poll with backoff until a terminal status; safe to retry. */
    getJob: (jobId: string) => read(jobPath(jobId), AgentJobViewSchema),
    /** Validated answers to a job's questions; the server starts a follow-up job. */
    answerJob: (jobId: string, request: JobAnswersRequest) => once('POST', `${jobPath(jobId)}/answers`, CreateJobResponseSchema, request),
    retryJob: (jobId: string) => once('POST', `${jobPath(jobId)}/retry`, CreateJobResponseSchema, {}),
    /** Best effort: returns the job's actual state, which may already be terminal. */
    cancelJob: (jobId: string) => once('POST', `${jobPath(jobId)}/cancel`, AgentJobViewSchema, {}),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** Normalizes anything thrown by an API call into an ApiError the UI can display. */
export function asApiError(caught: unknown): ApiError {
  return caught instanceof ApiError ? caught : new ApiError('INTERNAL', 'Something went wrong. Try again.');
}
