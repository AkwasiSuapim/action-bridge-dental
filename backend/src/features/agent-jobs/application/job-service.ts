import {
  DentalCaseInputSchema,
  type AgentJobView,
  type CreateJobRequest,
  type DentalCaseInput,
  type ErrorIssue,
  type JobAnswersRequest,
  type MissingFieldBlock,
  type PatchCaseRequest,
  type SourceFact,
} from '@actionbridge/contracts';
import { estimateCase } from '@actionbridge/benefits-engine';
import { expiresAtFrom } from '../../../shared/dynamo.js';
import { HttpError } from '../../../shared/http.js';
import { toEngineInput, type CaseService } from '../../cases/application/case-service.js';
import { applyGroups, type FactGroup } from '../domain/extraction.js';
import { applyAnswer, NEXT_YEAR_PATH, skipMarker } from '../domain/adaptive.js';
import type { JobQueue, JobRecord, JobRepository } from '../ports.js';

export interface JobServiceDeps {
  jobs: JobRepository;
  queue: JobQueue;
  cases: CaseService;
  now: () => Date;
  newId: () => string;
  retentionDays: number | null;
  maxAttempts: number;
}

/** Agent jobs API (system design §6): create, view, answer, retry, cancel. Owner-scoped throughout. */
export class JobService {
  constructor(private readonly deps: JobServiceDeps) {}

  async create(ownerId: string, caseId: string, request: CreateJobRequest): Promise<{ jobId: string }> {
    if (request.operation === 'explain') {
      throw new HttpError('BAD_REQUEST', 'This kind of analysis is not available yet.');
    }
    const needsUpload = request.operation === 'transcribe_audio' || request.operation === 'analyze_document';
    if (needsUpload && !request.input.documentId) {
      throw new HttpError('BAD_REQUEST', 'Upload the recording or document first, then send its documentId.');
    }
    const record = await this.deps.cases.getAtRevision(ownerId, caseId, request.expectedRevision);
    return this.start(ownerId, record.caseId, record.caseRevision, needsUpload ? null : request.input.text?.trim() || null, undefined, {
      operation: request.operation,
      documentId: needsUpload ? (request.input.documentId ?? null) : null,
      documentIds: request.operation === 'interpret' ? [...new Set(request.input.documentIds ?? [])] : [],
    });
  }

  async view(ownerId: string, jobId: string): Promise<AgentJobView> {
    return toView(await this.load(ownerId, jobId));
  }

  /**
   * Applies confirmed proposals and answered questions as one new case revision, then starts a
   * follow-up job that decides what to ask or show next. Returns that job's ID.
   */
  async answer(ownerId: string, jobId: string, request: JobAnswersRequest): Promise<{ jobId: string }> {
    const job = await this.load(ownerId, jobId);
    if (job.status !== 'needs_information' || !job.questions) {
      throw new HttpError('REVISION_CONFLICT', 'These questions are no longer open. Reload to see the latest step.');
    }
    if (request.expectedRevision !== job.caseRevision) {
      throw new HttpError('REVISION_CONFLICT', 'These questions belong to an older version of the case. Reload and try again.');
    }
    const record = await this.deps.cases.getAtRevision(ownerId, job.caseId, request.expectedRevision);
    const blocks = new Map(
      job.questions.blocks.flatMap((b) => (b.type === 'missing_field' ? [[b.questionId, b] as [string, MissingFieldBlock]] : [])),
    );

    const confirmed: FactGroup[] = [];
    const fieldAnswers: { block: MissingFieldBlock; value: unknown }[] = [];
    const skipped = new Set(job.skippedFieldPaths ?? []);
    const expanded = new Set(job.expandedGroups ?? []);
    const issues: ErrorIssue[] = [];
    for (const answer of request.answers) {
      const block = blocks.get(answer.questionId);
      if (!block) {
        issues.push({ fieldPath: null, code: 'UNKNOWN_QUESTION', message: `Question ${answer.questionId} is not part of this step.` });
        continue;
      }
      if (block.inputType === 'fact_review') {
        const index = Number(block.questionId.replace('confirm-', '')) - 1;
        const group = job.proposals[index];
        if (!answer.unknown && answer.value === true && group) confirmed.push(group);
        continue;
      }
      if (answer.unknown) {
        skipped.add(skipMarker(block));
        continue;
      }
      fieldAnswers.push({ block, value: answer.value });
    }
    if (issues.length > 0) throw new HttpError('BAD_REQUEST', 'Some answers could not be used.', issues);

    const recordedAt = this.deps.now().toISOString();
    const makeFact = (fieldPath: string, value: string | number | boolean | null, quote: string | null, origin: SourceFact['origin'], groupSourceId?: string): SourceFact => ({
      id: `fact-${this.deps.newId()}`,
      fieldPath,
      value,
      sourceId: quote ? (groupSourceId ?? (job.documentId ? `upload-${job.documentId}` : 'user-description')) : null,
      location: quote ? { page: null, section: null, snippet: quote.slice(0, 500) } : null,
      origin,
      extractionStatus: origin === 'agent_proposed' ? 'extracted' : 'not_applicable',
      userConfirmed: origin !== 'assumption',
      insurerVerification: { status: 'not_verified' },
      conflict: false,
      recordedAt,
    });

    const before = toEngineInput(record);
    let { input, facts } = applyGroups(before, confirmed, makeFact);
    for (const { block, value } of fieldAnswers) {
      const applied = applyAnswer(input, block, value);
      if ('error' in applied) {
        issues.push({ fieldPath: block.fieldPath, code: 'INVALID_ANSWER', message: applied.error });
        continue;
      }
      input = applied.input;
      // Next year's terms are asked once: "No, it changes" means the user will enter them.
      if (block.fieldPath === NEXT_YEAR_PATH && value !== 'same') skipped.add(NEXT_YEAR_PATH);
      if (applied.expand) expanded.add(applied.expand);
      for (const change of applied.changed) facts.push(makeFact(change.fieldPath, change.value, null, 'user_entered'));
    }
    if (issues.length > 0) throw new HttpError('BAD_REQUEST', 'Some answers could not be used.', issues);
    const valid = DentalCaseInputSchema.safeParse(input);
    if (!valid.success) throw new HttpError('BAD_REQUEST', 'Those answers would make the case invalid. Review them and try again.');
    // Never store numbers that contradict each other (e.g. deductible met above the deductible):
    // the calculator would refuse every estimate afterwards. Say which detail conflicts instead.
    const after = estimateCase(valid.data);
    if (after.status === 'invalid' && estimateCase(before).status !== 'invalid') {
      throw new HttpError(
        'BAD_REQUEST',
        `That answer conflicts with your other details: ${after.issues.map((i) => i.message).join(' ')}`.slice(0, 300),
        after.issues.map((i) => ({ fieldPath: i.fieldPath, code: 'CONFLICTING_ANSWER', message: i.message })),
      );
    }

    let revision = record.caseRevision;
    const changes = changedSections(before, input);
    if (Object.keys(changes).length > 0 || facts.length > 0) {
      const patch: PatchCaseRequest = {
        expectedRevision: record.caseRevision,
        changes: { ...changes, sourceFacts: [...record.sourceFacts, ...facts].slice(-200) },
      };
      revision = (await this.deps.cases.patch(ownerId, job.caseId, patch)).caseRevision;
    }

    // Close this step; a concurrent duplicate submit already lost the revision check above.
    await this.deps.jobs.put({ ...job, status: 'completed', updatedAt: recordedAt }, { status: ['needs_information'] }, this.ttl());
    return this.start(ownerId, job.caseId, revision, null, { skippedFieldPaths: [...skipped], expandedGroups: [...expanded] });
  }

  async retry(ownerId: string, jobId: string): Promise<{ jobId: string }> {
    const job = await this.load(ownerId, jobId);
    if (job.status !== 'failed' || !job.error?.retryable || job.attempt >= job.maxAttempts) {
      throw new HttpError('REVISION_CONFLICT', 'This analysis can’t be retried. Start a new one.');
    }
    const ok = await this.deps.jobs.put({ ...job, status: 'queued', error: null, updatedAt: this.deps.now().toISOString() }, { status: ['failed'] }, this.ttl());
    if (!ok) throw new HttpError('REVISION_CONFLICT', 'This analysis changed. Reload and try again.');
    await this.deps.queue.enqueue({ ownerId, jobId });
    return { jobId };
  }

  async cancel(ownerId: string, jobId: string): Promise<AgentJobView> {
    const job = await this.load(ownerId, jobId);
    if (job.status === 'queued' || job.status === 'running' || job.status === 'needs_information') {
      const cancelled: JobRecord = { ...job, status: 'cancelled', leaseToken: null, leaseUntil: null, updatedAt: this.deps.now().toISOString() };
      if (await this.deps.jobs.put(cancelled, { status: [job.status] }, this.ttl())) return toView(cancelled);
      return toView(await this.load(ownerId, jobId));
    }
    return toView(job);
  }

  private async start(
    ownerId: string,
    caseId: string,
    caseRevision: number,
    inputText: string | null,
    carry: { skippedFieldPaths: string[]; expandedGroups: string[] } = { skippedFieldPaths: [], expandedGroups: [] },
    kind: { operation: JobRecord['operation']; documentId: string | null; documentIds?: string[] } = { operation: 'interpret', documentId: null },
  ): Promise<{ jobId: string }> {
    const now = this.deps.now().toISOString();
    const job: JobRecord = {
      jobId: this.deps.newId(),
      ownerId,
      caseId,
      caseRevision,
      operation: kind.operation,
      documentId: kind.documentId,
      ...(kind.documentIds && kind.documentIds.length > 0 ? { documentIds: kind.documentIds } : {}),
      status: 'queued',
      attempt: 0,
      maxAttempts: this.deps.maxAttempts,
      inputText,
      events: [],
      questions: null,
      resultBlocks: null,
      error: null,
      proposals: [],
      skippedFieldPaths: carry.skippedFieldPaths,
      expandedGroups: carry.expandedGroups,
      leaseToken: null,
      leaseUntil: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.jobs.create(job, this.ttl());
    try {
      await this.deps.queue.enqueue({ ownerId, jobId: job.jobId });
    } catch {
      await this.deps.jobs.put(
        { ...job, status: 'failed', error: { code: 'UPSTREAM_UNAVAILABLE', message: 'The assistant is busy. Try again in a moment.', retryable: true, requestId: job.jobId } },
        { status: ['queued'] },
        this.ttl(),
      );
      throw new HttpError('UPSTREAM_UNAVAILABLE', 'The assistant is busy. Try again in a moment.');
    }
    return { jobId: job.jobId };
  }

  private async load(ownerId: string, jobId: string): Promise<JobRecord> {
    const job = await this.deps.jobs.get(ownerId, jobId);
    if (!job) throw new HttpError('NOT_FOUND', 'Analysis not found.');
    return job;
  }

  private ttl(): number | null {
    return expiresAtFrom(this.deps.now(), this.deps.retentionDays);
  }
}

export function toView(job: JobRecord): AgentJobView {
  return {
    jobId: job.jobId,
    caseId: job.caseId,
    caseRevision: job.caseRevision,
    operation: job.operation,
    status: job.status,
    attempt: Math.max(1, job.attempt),
    maxAttempts: job.maxAttempts,
    events: job.events.slice(-100),
    questions: job.questions,
    resultBlocks: job.resultBlocks,
    transcript: job.transcript ?? null,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

function changedSections(before: DentalCaseInput, after: DentalCaseInput): PatchCaseRequest['changes'] {
  const changes: PatchCaseRequest['changes'] = {};
  if (before.coverageMode !== after.coverageMode) changes.coverageMode = after.coverageMode;
  if (JSON.stringify(before.policy) !== JSON.stringify(after.policy)) changes.policy = after.policy;
  if (JSON.stringify(before.planYears) !== JSON.stringify(after.planYears)) changes.planYears = after.planYears;
  if (JSON.stringify(before.procedures) !== JSON.stringify(after.procedures)) changes.procedures = after.procedures;
  return changes;
}
