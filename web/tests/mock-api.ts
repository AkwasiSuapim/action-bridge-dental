import type { Page, Route } from '@playwright/test';
import {
  compareCoverage,
  compareSchedules,
  estimateCase,
} from '@actionbridge/benefits-engine';
import type {
  AgentJobView,
  DentalCase,
  DentalCaseInput,
  LedgerEvent,
  SavedStrategy,
  SourceFact,
  UiBlock,
} from '@actionbridge/contracts';
import fixture from '../../docs/fixtures/dental-regression.json' with { type: 'json' };

/**
 * A contract-shaped stand-in for the live API and Cognito, used by the browser tests. Amounts come
 * from the real benefits engine, exactly as the Lambda returns them; the browser under test never
 * calculates. The assistant is scripted: it proposes the shared fixture, quoting the user's words.
 */
export interface MockApi {
  cases: Map<string, DentalCase>;
  strategies: Map<string, SavedStrategy[]>;
  requests: {
    method: string;
    path: string;
    body: unknown;
    headers: Record<string, string>;
  }[];
  /** Make the next strategy save fail once with a retryable error. */
  failNextSave: boolean;
}

const now = () => new Date().toISOString();
let counter = 0;
const id = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}${(++counter).toString(36)}`;

function engineInput(record: DentalCase): DentalCaseInput {
  return {
    caseRevision: record.caseRevision,
    currency: record.currency,
    coverageMode: record.coverageMode,
    policy: record.policy,
    planYears: record.planYears,
    procedures: record.procedures,
  };
}

export async function mockBackend(
  page: Page,
  options: { newPasswordFor?: string; transcript?: string } = {},
): Promise<MockApi> {
  const state: MockApi = {
    cases: new Map(),
    strategies: new Map(),
    requests: [],
    failNextSave: false,
  };
  const ledger = new Map<string, LedgerEvent[]>();
  const jobs = new Map<string, AgentJobView & { proposeFrom?: string }>();

  const record = (
    caseId: string,
    action: LedgerEvent['action'],
    revision: number,
    strategyId: string | null = null,
  ) => {
    const events = ledger.get(caseId) ?? [];
    events.unshift({
      eventId: id('evt'),
      caseId,
      action,
      actor: 'user',
      caseRevision: revision,
      summary: action,
      strategyId,
      at: now(),
    });
    ledger.set(caseId, events);
  };

  await page.route(/cognito-idp\..*\.amazonaws\.com/, async (route) => {
    const target = route.request().headers()['x-amz-target'] ?? '';
    const body = JSON.parse(route.request().postData() ?? '{}');
    const tokens = {
      AccessToken: 'test-access',
      RefreshToken: 'test-refresh',
      ExpiresIn: 3600,
    };
    if (target.endsWith('InitiateAuth')) {
      if (
        body.AuthFlow === 'USER_PASSWORD_AUTH' &&
        body.AuthParameters.PASSWORD === 'wrong-password'
      )
        return route.fulfill({
          status: 400,
          json: { __type: 'NotAuthorizedException' },
        });
      if (
        body.AuthFlow === 'USER_PASSWORD_AUTH' &&
        body.AuthParameters.USERNAME === options.newPasswordFor
      )
        return route.fulfill({
          json: {
            ChallengeName: 'NEW_PASSWORD_REQUIRED',
            Session: 'challenge-session',
          },
        });
      return route.fulfill({ json: { AuthenticationResult: tokens } });
    }
    if (target.endsWith('RespondToAuthChallenge'))
      return route.fulfill({ json: { AuthenticationResult: tokens } });
    return route.fulfill({ json: {} });
  });

  await page.route('https://uploads.test/**', (route) =>
    route.fulfill({ status: 204, body: '' }),
  );

  const error = (
    route: Route,
    status: number,
    code: string,
    message: string,
    retryable = false,
  ) =>
    route.fulfill({
      status,
      json: { error: { code, message, retryable, requestId: 'req-test' } },
    });

  await page.route(/\/v1\//, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^.*?(\/v1\/)/, '$1');
    const method = request.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204 });
    const body = request.postData()
      ? JSON.parse(request.postData()!)
      : undefined;
    state.requests.push({ method, path, body, headers: request.headers() });
    if (request.headers().authorization !== 'Bearer test-access')
      return error(route, 401, 'UNAUTHENTICATED', 'Sign in.');

    let m: RegExpMatchArray | null;
    if (method === 'POST' && path === '/v1/cases') {
      const caseId = id('case');
      const created: DentalCase = {
        caseId,
        ownerId: 'user-test',
        status: 'draft',
        caseRevision: 1,
        currency: 'USD',
        coverageMode: body.coverageMode,
        policy: body.policy,
        planYears: body.planYears,
        procedures: body.procedures,
        sourceFacts: body.sourceFacts ?? [],
        createdAt: now(),
        updatedAt: now(),
      };
      state.cases.set(caseId, created);
      record(caseId, 'case_created', 1);
      return route.fulfill({ status: 201, json: { caseId, caseRevision: 1 } });
    }
    if ((m = path.match(/^\/v1\/cases\/([^/]+)$/))) {
      const current = state.cases.get(m[1]!);
      if (!current) return error(route, 404, 'NOT_FOUND', 'Case not found.');
      if (method === 'GET') return route.fulfill({ json: current });
      if (body.expectedRevision !== current.caseRevision)
        return error(route, 409, 'REVISION_CONFLICT', 'This case changed.');
      const next: DentalCase = {
        ...current,
        ...body.changes,
        caseRevision: current.caseRevision + 1,
        updatedAt: now(),
      };
      state.cases.set(current.caseId, next);
      record(current.caseId, 'case_updated', next.caseRevision);
      return route.fulfill({
        json: { caseId: current.caseId, caseRevision: next.caseRevision },
      });
    }
    if (
      (m = path.match(
        /^\/v1\/cases\/([^/]+)\/(estimates|scenarios|coverage-comparison)$/,
      ))
    ) {
      const current = state.cases.get(m[1]!);
      if (!current) return error(route, 404, 'NOT_FOUND', 'Case not found.');
      if (body.expectedRevision !== current.caseRevision)
        return error(route, 409, 'REVISION_CONFLICT', 'This case changed.');
      const input = engineInput(current);
      const result =
        m[2] === 'estimates'
          ? estimateCase(input)
          : m[2] === 'scenarios'
            ? compareSchedules(input)
            : compareCoverage(input);
      if ('status' in result && result.status === 'invalid')
        return error(
          route,
          422,
          'INCONSISTENT_INPUT',
          'Some values contradict each other.',
        );
      return route.fulfill({ json: result });
    }
    if ((m = path.match(/^\/v1\/cases\/([^/]+)\/strategies$/))) {
      const caseId = m[1]!;
      const current = state.cases.get(caseId);
      if (!current) return error(route, 404, 'NOT_FOUND', 'Case not found.');
      if (method === 'GET')
        return route.fulfill({
          json: {
            strategies: [...(state.strategies.get(caseId) ?? [])].reverse(),
          },
        });
      if (state.failNextSave) {
        state.failNextSave = false;
        return error(
          route,
          503,
          'UPSTREAM_UNAVAILABLE',
          'The service is busy. Try again.',
          true,
        );
      }
      const existing = (state.strategies.get(caseId) ?? []).find(
        (s) => s.strategyId === `str-${request.headers()['idempotency-key']}`,
      );
      if (existing)
        return route.fulfill({
          status: 200,
          json: { strategy: existing, replayed: true },
        });
      const comparison = compareSchedules(engineInput(current));
      if (comparison.status !== 'estimated')
        return error(route, 422, 'INCONSISTENT_INPUT', 'Not estimable.');
      const scenario = [comparison.baseline, ...comparison.alternatives].find(
        (s) => s.scenarioId === body.scenarioId,
      );
      if (!scenario) return error(route, 404, 'NOT_FOUND', 'Unknown option.');
      const strategy: SavedStrategy = {
        strategyId: `str-${request.headers()['idempotency-key']}`,
        caseId,
        caseRevision: current.caseRevision,
        scenario,
        savedAt: now(),
      };
      state.strategies.set(caseId, [
        ...(state.strategies.get(caseId) ?? []),
        strategy,
      ]);
      record(
        caseId,
        'strategy_saved',
        current.caseRevision,
        strategy.strategyId,
      );
      return route.fulfill({
        status: 201,
        json: { strategy, replayed: false },
      });
    }
    if ((m = path.match(/^\/v1\/cases\/([^/]+)\/ledger$/)))
      return route.fulfill({
        json: { events: ledger.get(m[1]!) ?? [], nextCursor: null },
      });
    if ((m = path.match(/^\/v1\/cases\/([^/]+)\/uploads$/)))
      return route.fulfill({
        status: 201,
        json: {
          uploadId: id('up'),
          url: 'https://uploads.test/',
          fields: { key: 'k', 'Content-Type': body.mimeType },
          expiresAt: now(),
          maxBytes: 5242880,
        },
      });
    if ((m = path.match(/^\/v1\/cases\/([^/]+)\/jobs$/))) {
      const current = state.cases.get(m[1]!)!;
      const job = newJob(current, body.operation);
      if (body.operation === 'transcribe_audio') {
        job.status = 'completed';
        job.transcript = options.transcript ?? 'My dentist recommends a crown.';
      } else if (body.input.text || body.input.documentIds?.length) {
        job.status = 'needs_information';
        job.proposeFrom = body.input.text ?? 'Crown (D2740) fee $1,000.00';
        job.questions = envelope(
          current.caseRevision,
          confirmations(
            job.proposeFrom!,
            current.caseRevision,
            !!body.input.documentIds?.length && !body.input.text,
          ),
        );
      } else {
        job.status = 'completed';
        job.resultBlocks = envelope(current.caseRevision, [
          {
            id: 'notice-1',
            type: 'notice',
            severity: 'info',
            title: 'Nothing else is needed',
            body: 'Your details are complete.',
          },
        ]);
      }
      jobs.set(job.jobId, job);
      return route.fulfill({ status: 202, json: { jobId: job.jobId } });
    }
    if ((m = path.match(/^\/v1\/jobs\/([^/]+)$/))) {
      const job = jobs.get(m[1]!);
      if (!job) return error(route, 404, 'NOT_FOUND', 'Job not found.');
      const { proposeFrom: _p, ...view } = job;
      return route.fulfill({ json: view });
    }
    if ((m = path.match(/^\/v1\/jobs\/([^/]+)\/answers$/))) {
      const job = jobs.get(m[1]!)!;
      const current = state.cases.get(job.caseId)!;
      const accepted = body.answers.some(
        (a: { value: unknown }) => a.value === true,
      );
      // Confirming applies the proposal: the shared fixture, quoted from what the user shared.
      const quote = job.proposeFrom ?? '';
      const facts: SourceFact[] = [
        'coverageMode',
        ...fixture.procedures.map((p) => `procedures.${p.id}`),
      ].map((fieldPath) => ({
        id: id('fact'),
        fieldPath,
        value: fieldPath,
        sourceId: 'user-description',
        location: { page: null, section: null, snippet: quote.slice(0, 80) },
        origin: 'agent_proposed',
        extractionStatus: 'extracted',
        userConfirmed: true,
        insurerVerification: { status: 'not_verified' },
        conflict: false,
        recordedAt: now(),
      }));
      const next: DentalCase = accepted
        ? {
            ...current,
            coverageMode: 'insured',
            policy: fixture.policy as DentalCase['policy'],
            planYears: Object.fromEntries(
              Object.entries(fixture.planYears).map(([k, y]) => [
                k,
                y.sourceStatus === 'synthetic_confirmed_input'
                  ? { ...y, sourceStatus: 'user_confirmed' }
                  : y,
              ]),
            ) as DentalCase['planYears'],
            procedures: fixture.procedures.map((p) => ({
              ...p,
              timingSource: 'dentist_supplied',
            })) as DentalCase['procedures'],
            sourceFacts: [...current.sourceFacts, ...facts],
            caseRevision: current.caseRevision + 1,
            updatedAt: now(),
          }
        : current;
      state.cases.set(current.caseId, next);
      if (accepted) record(current.caseId, 'case_updated', next.caseRevision);
      const followUp = newJob(next, 'interpret');
      followUp.status = 'completed';
      followUp.resultBlocks = envelope(next.caseRevision, [
        { id: 'summary', type: 'cost_summary', scenarioId: 'baseline' },
      ]);
      jobs.set(followUp.jobId, followUp);
      return route.fulfill({ status: 202, json: { jobId: followUp.jobId } });
    }
    return error(route, 404, 'NOT_FOUND', `No mock for ${method} ${path}`);
  });
  return state;
}

function newJob(
  record: DentalCase,
  operation: AgentJobView['operation'],
): AgentJobView & { proposeFrom?: string } {
  const at = now();
  return {
    jobId: id('job'),
    caseId: record.caseId,
    caseRevision: record.caseRevision,
    operation,
    status: 'running',
    attempt: 1,
    maxAttempts: 2,
    events: [
      {
        jobId: 'job',
        caseRevision: record.caseRevision,
        sequence: 1,
        stage: 'reading_input',
        status: 'completed',
        summary: 'Read what you shared',
        at,
      },
    ],
    questions: null,
    resultBlocks: null,
    transcript: null,
    error: null,
    createdAt: at,
    updatedAt: at,
  };
}

function envelope(caseRevision: number, blocks: UiBlock[]) {
  return { schemaVersion: 1 as const, caseRevision, blocks };
}

function confirmations(
  quote: string,
  revision: number,
  fromDocument: boolean,
): UiBlock[] {
  const base = {
    type: 'missing_field' as const,
    inputType: 'fact_review' as const,
    options: [],
    allowedResponseModes: ['tap' as const],
    required: false,
    allowUnknown: true,
    sourceRefs: [],
    expectedRevision: revision,
  };
  const reason = `From your ${fromDocument ? 'document' : 'description'}: “${quote.slice(0, 80)}”`;
  return [
    {
      id: 'notice-found',
      type: 'notice',
      severity: 'info',
      title: 'What I found',
      body: 'Nothing is used until you confirm it.',
    },
    {
      ...base,
      id: 'confirm-1',
      questionId: 'confirm-1',
      fieldPath: 'coverageMode',
      label: 'Is this right? Your coverage',
      reason,
      candidateValue: 'You have dental insurance for this treatment',
    },
    {
      ...base,
      id: 'confirm-2',
      questionId: 'confirm-2',
      fieldPath: 'procedures.crown-1',
      label: 'Is this right? A recommended procedure',
      reason,
      candidateValue: 'Crown (major service) · charge $1,000.00',
    },
  ];
}
