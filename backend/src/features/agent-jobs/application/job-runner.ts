import {
  UI_BLOCK_SCHEMA_VERSION,
  UiBlockEnvelopeSchema,
  type DentalCaseInput,
  type JobStageEvent,
  type MissingFieldBlock,
  type UiBlock,
  type UiBlockEnvelope,
} from '@actionbridge/contracts';
import { compareCoverage, compareSchedules, estimateCase } from '@actionbridge/benefits-engine';
import { expiresAtFrom } from '../../../shared/dynamo.js';
import { logEvent } from '../../../shared/logger.js';
import { toEngineInput } from '../../cases/application/case-service.js';
import type { CaseRepository } from '../../cases/ports/case-repository.js';
import type { FactGroup } from '../domain/extraction.js';
import { questionBlocks } from '../domain/questions.js';
import { ModelError, type AgentModel, type JobRecord, type JobRepository } from '../ports.js';
import { explainComparison } from './explain.js';
import { runInterpretAgent } from './interpret-agent.js';

export interface JobRunnerDeps {
  jobs: JobRepository;
  cases: Pick<CaseRepository, 'get'>;
  model: AgentModel;
  now: () => Date;
  newId: () => string;
  retentionDays: number | null;
  leaseMs: number;
}

/**
 * Worker entry (T5-04). Claims the job with a lease so a duplicate queue delivery cannot produce
 * a second result; reports real stage events; never writes a result for a stale revision or a
 * job that was cancelled meanwhile. Failures are recorded on the job, not retried silently.
 */
export async function runJob(deps: JobRunnerDeps, message: { ownerId: string; jobId: string }): Promise<'completed' | 'skipped'> {
  const stored = await deps.jobs.get(message.ownerId, message.jobId);
  if (!stored) return 'skipped';
  const nowMs = deps.now().getTime();
  const claimable = stored.status === 'queued' || (stored.status === 'running' && (stored.leaseUntil ?? 0) < nowMs);
  if (!claimable) return 'skipped';

  const token = deps.newId();
  let job: JobRecord = {
    ...stored,
    status: 'running',
    attempt: stored.attempt + 1,
    leaseToken: token,
    leaseUntil: nowMs + deps.leaseMs,
    updatedAt: deps.now().toISOString(),
  };
  const ttl = () => expiresAtFrom(deps.now(), deps.retentionDays);
  const claimed = await deps.jobs.put(job, { status: [stored.status], ...(stored.leaseToken ? { leaseToken: stored.leaseToken } : {}) }, ttl());
  if (!claimed) return 'skipped';

  const save = async (next: JobRecord): Promise<boolean> => {
    const ok = await deps.jobs.put({ ...next, updatedAt: deps.now().toISOString() }, { status: ['running'], leaseToken: token }, ttl());
    if (ok) job = next;
    return ok;
  };
  const report = async (stage: JobStageEvent['stage'], status: JobStageEvent['status'], summary: string) => {
    const event: JobStageEvent = { jobId: job.jobId, caseRevision: job.caseRevision, sequence: job.events.length + 1, stage, status, summary, at: deps.now().toISOString() };
    if (!(await save({ ...job, events: [...job.events, event] }))) throw new LeaseLost();
  };

  try {
    const record = await deps.cases.get(job.ownerId, job.caseId);
    if (!record || record.caseRevision !== job.caseRevision) {
      await finish('failed', null, null, { code: 'REVISION_CONFLICT', message: 'This case changed while it was being analyzed. Start the analysis again.', retryable: false, requestId: job.jobId });
      return 'completed';
    }
    const input = toEngineInput(record);

    if (job.inputText) {
      const result = await runInterpretAgent({ model: deps.model, input, text: job.inputText, today: deps.now().toISOString().slice(0, 10), report });
      if (result.groups.length > 0) {
        await report('preparing_explanation', 'completed', 'Ready for you to confirm');
        const questions = envelope(job.caseRevision, [...confirmationBlocks(result.groups, job.caseRevision), foundNotice(result)]);
        await finish('needs_information', questions, null, null, result.groups);
        return 'completed';
      }
    }

    // No description, or nothing quotable in it: let the engine decide what to ask or show.
    await report('checking_missing_facts', 'started', 'Checking what is still needed');
    await assess(input, Boolean(job.inputText));
    return 'completed';
  } catch (error) {
    if (error instanceof LeaseLost) return 'skipped';
    const retryable = error instanceof ModelError ? error.retryable : true;
    // ModelError messages are our own fixed text plus the AWS error name (e.g. AccessDeniedException); never user content.
    const errorName = error instanceof ModelError ? error.message.replace('Model call failed: ', 'Bedrock:') : error instanceof Error ? error.name : 'UnknownError';
    logEvent('error', 'job_failed', { jobId: job.jobId, errorName, retryable });
    await finish('failed', null, null, {
      code: error instanceof ModelError && !retryable ? 'INTERNAL' : 'UPSTREAM_UNAVAILABLE',
      message: 'The assistant could not finish. Your case is unchanged — try again or enter the details yourself.',
      retryable: retryable && job.attempt < job.maxAttempts,
      requestId: job.jobId,
    }).catch(() => undefined);
    return 'completed';
  }

  async function assess(input: DentalCaseInput, afterDescription: boolean) {
    const estimate = estimateCase(input);
    const lead: UiBlock[] = afterDescription
      ? [notice('info', 'Nothing to confirm from your description', 'We could not find plan or treatment details stated in your words. Answer the questions below or enter the details yourself.')]
      : [];

    if (estimate.status === 'needs_information') {
      const { blocks, unanswerable } = questionBlocks(estimate.missing, input, job.caseRevision);
      const extra = unanswerable.length > 0 ? [notice('info', 'Also needed in your case details', unanswerable.map((m) => m.message).join(' ').slice(0, 500))] : [];
      if (blocks.length > 0) {
        await report('checking_missing_facts', 'completed', `${blocks.length} ${blocks.length === 1 ? 'question' : 'questions'} for you`);
        await finish('needs_information', envelope(job.caseRevision, [...lead, ...blocks, ...extra].slice(0, 10)), null, null);
      } else {
        await finish('completed', null, envelope(job.caseRevision, [...lead, ...extra].slice(0, 10)), null);
      }
      return;
    }
    if (estimate.status === 'unsupported' || estimate.status === 'invalid') {
      const body = estimate.status === 'unsupported' ? estimate.limitations.map((l) => l.message).join(' ') : estimate.issues.map((i) => i.message).join(' ');
      await finish('completed', null, envelope(job.caseRevision, [...lead, notice('warning', estimate.status === 'unsupported' ? 'This plan needs details we can’t estimate yet' : 'Some values contradict each other', body.slice(0, 500))]), null);
      return;
    }

    await report('calculating_costs', 'completed', 'Estimate calculated');
    const comparison = compareSchedules(input);
    const coverage = compareCoverage(input);
    const blocks: UiBlock[] = [{ id: 'summary', type: 'cost_summary', scenarioId: 'baseline' }];
    const options: { kind: 'insured' | 'self_pay' | 'alternative_timing'; scenarioId: string | null; available: boolean }[] = [
      { kind: 'insured', scenarioId: 'baseline', available: true },
    ];
    if (!('status' in coverage)) options.push({ kind: 'self_pay', scenarioId: null, available: coverage.selfPay.status === 'available' });
    if (comparison.status === 'estimated' && comparison.alternatives[0]) options.push({ kind: 'alternative_timing', scenarioId: comparison.alternatives[0].scenarioId, available: true });
    blocks.push({ id: 'compare', type: 'cost_comparison', options });

    let explanation: string | null = null;
    if (comparison.status === 'estimated') {
      await report('preparing_explanation', 'started', 'Preparing a short explanation');
      explanation = await explainComparison(deps.model, comparison).catch(() => null);
      await report('preparing_explanation', explanation ? 'completed' : 'skipped', explanation ? 'Explanation ready' : 'Showing the calculator summary');
    }
    blocks.push(
      notice(
        'info',
        explanation ? 'What this means (AI explanation of the calculator’s results)' : 'Estimate ready',
        explanation ?? 'These amounts come from the calculator using the details you confirmed. They are estimates, not a guarantee of payment.',
      ),
    );
    await finish('completed', null, envelope(job.caseRevision, blocks), null);
  }

  async function finish(status: JobRecord['status'], questions: UiBlockEnvelope | null, resultBlocks: UiBlockEnvelope | null, error: JobRecord['error'], proposals: FactGroup[] = []) {
    const ok = await deps.jobs.put(
      { ...job, status, questions, resultBlocks, error, proposals, leaseToken: null, leaseUntil: null, updatedAt: deps.now().toISOString() },
      { status: ['running'], leaseToken: token },
      ttl(),
    );
    if (!ok) throw new LeaseLost();
  }
}

class LeaseLost extends Error {
  override readonly name = 'LeaseLost';
}

function envelope(caseRevision: number, blocks: UiBlock[]): UiBlockEnvelope {
  return UiBlockEnvelopeSchema.parse({ schemaVersion: UI_BLOCK_SCHEMA_VERSION, caseRevision, blocks });
}

function notice(severity: 'info' | 'warning' | 'error', title: string, body: string): UiBlock {
  return { id: `notice-${title.length}-${body.length}`, type: 'notice', severity, title: title.slice(0, 80), body: body.slice(0, 500) };
}

const GROUP_LABEL: Record<FactGroup['kind'], string> = {
  coverageMode: 'Is this right? Your coverage',
  benefitYear: 'Is this right? Your benefit year',
  coverageRules: 'Is this right? Your plan’s coverage rules',
  procedure: 'Is this right? A recommended procedure',
};

/** One "Is this right?" confirmation per group of proposed facts (`confirm-N` ↔ proposals[N-1]). */
export function confirmationBlocks(groups: FactGroup[], caseRevision: number): MissingFieldBlock[] {
  return groups.slice(0, 9).map((group, index) => ({
    id: `confirm-${index + 1}`,
    type: 'missing_field',
    questionId: `confirm-${index + 1}`,
    fieldPath: group.fieldPath,
    inputType: 'fact_review',
    label: GROUP_LABEL[group.kind],
    reason: `From your description: “${group.quote}”`.slice(0, 300),
    options: [],
    allowedResponseModes: ['tap'],
    required: false,
    allowUnknown: true,
    sourceRefs: [],
    expectedRevision: caseRevision,
    candidateValue: group.summary.slice(0, 200),
  }));
}

function foundNotice(result: { groups: FactGroup[]; dropped: unknown[]; missingAfter: { message: string }[]; summary: string | null }): UiBlock {
  const parts = [
    result.summary ?? `We found ${result.groups.length} ${result.groups.length === 1 ? 'group' : 'groups'} of details in your description.`,
    'Nothing is used until you confirm it.',
    result.missingAfter.length > 0 ? `After you confirm, ${result.missingAfter.length} more ${result.missingAfter.length === 1 ? 'value is' : 'values are'} still needed.` : null,
    result.dropped.length > 0 ? `${result.dropped.length} ${result.dropped.length === 1 ? 'detail was' : 'details were'} left out because your description did not state ${result.dropped.length === 1 ? 'it' : 'them'} clearly.` : null,
  ].filter(Boolean);
  return notice('info', 'What I found', parts.join(' '));
}
