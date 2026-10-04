import { jobRoutes } from '../src/features/agent-jobs/api/job-routes.js';
import { runJob, type JobRunnerDeps } from '../src/features/agent-jobs/application/job-runner.js';
import { JobService } from '../src/features/agent-jobs/application/job-service.js';
import { InMemoryJobQueue, InMemoryJobRepository } from '../src/features/agent-jobs/infrastructure/in-memory.js';
import { ModelError, type AgentModel, type ContentBlock, type ModelTurn } from '../src/features/agent-jobs/ports.js';
import { caseRoutes } from '../src/features/cases/api/case-routes.js';
import { CaseService } from '../src/features/cases/application/case-service.js';
import { estimateRoutes } from '../src/features/estimates/estimate-routes.js';
import { createRouter, type HttpEvent } from '../src/shared/http.js';
import { InMemoryStore } from '../src/shared/in-memory-store.js';
import { MAYA } from './helpers.js';

/** A model that replays scripted turns and records every request it receives. */
export class ScriptedModel implements AgentModel {
  readonly requests: Parameters<AgentModel['converse']>[0][] = [];
  constructor(private readonly turns: (ModelTurn | Error)[]) {}

  async converse(request: Parameters<AgentModel['converse']>[0]): Promise<ModelTurn> {
    this.requests.push(structuredClone(request));
    const next = this.turns.shift();
    if (next === undefined) return { stopReason: 'end_turn', content: [{ text: 'Done.' }] };
    if (next instanceof Error) throw next;
    return next;
  }
}

export const toolTurn = (name: string, input: unknown = {}, id = `t-${name}`): ModelTurn => ({
  stopReason: 'tool_use',
  content: [{ toolUse: { toolUseId: id, name, input } } as ContentBlock],
});
export const textTurn = (text: string): ModelTurn => ({ stopReason: 'end_turn', content: [{ text }] });
export const throttled = () => new ModelError('Model call failed: ThrottlingException', true);

export function createAgentHarness(model: AgentModel) {
  let ids = 0;
  let tick = 0;
  let requests = 0;
  const clock = { now: () => new Date(Date.UTC(2026, 9, 3, 15, 0, tick++)), newId: () => `id-${++ids}`, retentionDays: null };
  const store = new InMemoryStore();
  const jobsRepo = new InMemoryJobRepository();
  const queue = new InMemoryJobQueue();
  const cases = new CaseService({ repository: store, ...clock });
  const jobs = new JobService({ jobs: jobsRepo, queue, cases, maxAttempts: 3, ...clock });
  const runner: JobRunnerDeps = { jobs: jobsRepo, cases: store, model, leaseMs: 120_000, ...clock };
  const router = createRouter({ ...caseRoutes({ cases, authMode: 'demo' }), ...estimateRoutes({ cases, authMode: 'demo' }), ...jobRoutes({ jobs, authMode: 'demo' }) });

  return {
    store,
    jobsRepo,
    queue,
    runner,
    async call(routeKey: string, params: Record<string, string> = {}, body?: unknown, user: string = MAYA) {
      const event: HttpEvent = {
        routeKey,
        pathParameters: params,
        headers: { 'x-demo-user-id': user },
        requestContext: { requestId: `req-${++requests}` },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      };
      const result = await router(event);
      return { status: result.statusCode, body: JSON.parse(result.body) };
    },
    /** Processes queued messages like the SQS worker would. */
    async drain() {
      while (queue.messages.length > 0) await runJob(runner, queue.messages.shift()!);
    },
  };
}
