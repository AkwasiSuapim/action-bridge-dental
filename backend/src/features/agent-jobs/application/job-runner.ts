import {
  UPLOAD_LIMITS,
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
import { verifiedQuote, type FactGroup } from '../domain/extraction.js';
import { nextStepItems, planStep } from '../domain/adaptive.js';
import { ModelError, uploadKey, type AgentModel, type DocumentReader, type JobRecord, type JobRepository, type Transcriber, type UploadStore } from '../ports.js';
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
  uploads?: UploadStore;
  transcriber?: Transcriber;
  reader?: DocumentReader;
  sleep?: (ms: number) => Promise<void>;
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

    if (job.operation === 'transcribe_audio') {
      await transcribe();
      return 'completed';
    }

    // Everything the user shared: their own words and any uploaded pages (each read, then deleted).
    const words = job.inputText?.trim() ?? '';
    const docs: { id: string; label: string; text: string }[] = [];
    const unreadable: string[] = [];
    if (job.operation === 'analyze_document') {
      const read = await readDocument(job.documentId ?? '', '', false);
      if (read === null || read === UNREADABLE) return 'completed';
      docs.push({ id: job.documentId ?? '', label: '', text: read });
    }
    for (const [index, id] of (job.documentIds ?? []).entries()) {
      const label = `Document ${index + 1}`;
      const read = await readDocument(id, label, true);
      if (read === null) return 'completed';
      if (read === UNREADABLE) unreadable.push(label);
      else docs.push({ id, label, text: read });
    }
    const text = [words, ...docs.map((d) => (d.label ? `${d.label}:\n${d.text}` : d.text))].filter(Boolean).join('\n\n');
    const unreadableNotice: UiBlock[] =
      unreadable.length > 0
        ? [notice('warning', `I couldn’t read ${unreadable.join(' and ')}`, 'It may be blurry or cut off. Retake it in good light, upload a PDF, or add the details in your own words.')]
        : [];

    if (text) {
      const source = words ? 'description' : 'document';
      const result = await runInterpretAgent({ model: deps.model, input, text, today: deps.now().toISOString().slice(0, 10), report, source });
      for (const group of result.groups) {
        // Attribute each confirmation to where its verified quote actually appears.
        const doc = docs.find((d) => verifiedQuote(group.quote, d.text) !== null);
        if (words && verifiedQuote(group.quote, words) !== null) Object.assign(group, { source: 'description', sourceId: 'user-description' });
        else if (doc) Object.assign(group, { source: 'document', sourceId: `upload-${doc.id}` });
      }
      if (result.groups.length > 0) {
        await report('preparing_explanation', 'completed', 'Ready for you to confirm');
        const questions = envelope(job.caseRevision, [...confirmationBlocks(result.groups, job.caseRevision, source), foundNotice(result), ...unreadableNotice].slice(0, 10));
        await finish('needs_information', questions, null, null, result.groups);
        return 'completed';
      }
    } else if (unreadable.length > 0) {
      // Every page was unreadable and nothing else was shared.
      await finish('completed', null, envelope(job.caseRevision, [notice('warning', 'I couldn’t read your documents', 'The photos may be blurry or cut off. Retake them in good light with the whole page in view, upload a PDF, or type the details instead.')]), null);
      return 'completed';
    }

    // Nothing shared, or nothing quotable in it: let the engine decide what to ask or show.
    await report('checking_missing_facts', 'started', 'Checking what is still needed');
    await assess(input, Boolean(text), unreadableNotice);
    return 'completed';
  } catch (error) {
    if (error instanceof LeaseLost) return 'skipped';
    const retryable = error instanceof ModelError ? error.retryable : true;
    // ModelError messages are our own fixed text plus the AWS error name (e.g. AccessDeniedException); never user content.
    const errorName = error instanceof ModelError ? error.message.replace('Model call failed: ', 'Bedrock:') : error instanceof Error ? error.name : 'UnknownError';
    logEvent('error', 'job_failed', {
      jobId: job.jobId,
      errorName,
      retryable,
      ...(error instanceof ModelError && error.detail ? { errorDetail: error.detail } : {}),
    });
    await finish('failed', null, null, {
      code: error instanceof ModelError && !retryable ? 'INTERNAL' : 'UPSTREAM_UNAVAILABLE',
      message: 'The assistant could not finish. Your case is unchanged — try again or enter the details yourself.',
      retryable: retryable && job.attempt < job.maxAttempts,
      requestId: job.jobId,
    }).catch(() => undefined);
    return 'completed';
  }

  /** Size and real file type (first bytes), never the file name. Removes the object when it fails. */
  async function verifiedUpload(kind: 'audio' | 'document', documentId = job.documentId ?? '', label = ''): Promise<{ key: string; type: FileType } | null> {
    const store = deps.uploads;
    if (!store || !documentId) throw new Error('Uploads are not configured');
    const key = uploadKey(job.ownerId, job.caseId, documentId);
    const head = await store.head(key);
    const reject = async (message: string) => {
      await store.remove(key).catch(() => undefined);
      await finish('failed', null, null, { code: 'BAD_REQUEST', message: label ? `${label}: ${message}` : message, retryable: false, requestId: job.jobId });
      return null;
    };
    if (!head) return reject('The upload was not found. It may have expired — please upload it again.');
    if (head.sizeBytes > UPLOAD_LIMITS[kind].maxBytes) return reject('That file is too large. Please use a shorter recording or a smaller file.');
    const type = fileTypeOf(await store.firstBytes(key, 16));
    const allowed = kind === 'audio' ? type === 'm4a' || type === 'webm' || type === 'ogg' : type === 'pdf' || type === 'jpeg' || type === 'png';
    if (!type || !allowed) return reject(kind === 'audio' ? 'That recording format isn’t supported. Please record again in the app.' : 'Please upload a PDF, JPEG or PNG — or take a photo of the page.');
    return { key, type };
  }

  async function transcribe() {
    const transcriber = deps.transcriber;
    if (!transcriber || !deps.uploads) throw new Error('Transcription is not configured');
    await report('reading_input', 'started', 'Listening to your recording');
    const upload = await verifiedUpload('audio');
    if (!upload) return;
    const name = `actionbridge-${job.jobId}`;
    try {
      await transcriber.start(name, `s3://${deps.uploads.bucket}/${upload.key}`, upload.type === 'webm' || upload.type === 'ogg' ? upload.type : 'm4a');
    } catch (error) {
      // A retried attempt may find its own transcription job already started; keep following it.
      if (!(error instanceof Error && error.name === 'ConflictException')) throw error;
    }
    let transcript: string | null = null;
    for (let i = 0; i < 35 && transcript === null; i++) {
      const state = await transcriber.get(name);
      if (state.status === 'COMPLETED' && state.transcriptUri) transcript = await transcriber.fetchTranscript(state.transcriptUri);
      else if (state.status === 'FAILED') {
        await cleanUp();
        await finish('failed', null, null, { code: 'BAD_REQUEST', message: 'I couldn’t process that recording. Please try again, or type instead.', retryable: false, requestId: job.jobId });
        return;
      } else await (deps.sleep ?? defaultSleep)(2000);
    }
    // On a timeout keep the audio and the transcription job: a retry resumes following the same job.
    if (transcript === null) throw new ModelError('Transcription timed out', true);
    await cleanUp();
    await report('reading_input', 'completed', transcript ? 'Recording transcribed' : 'No words recognized');
    const body = transcript
      ? 'Check the words below and fix anything I misheard. Nothing is used until you continue.'
      : 'I couldn’t make out any words. Try again a little closer to the phone, or type instead.';
    await finish('completed', null, envelope(job.caseRevision, [notice(transcript ? 'info' : 'warning', transcript ? 'Here’s what I heard' : 'No words recognized', body)]), null, [], transcript.slice(0, 8000));

    async function cleanUp() {
      // Raw audio and the transcription job are removed as soon as the text is read.
      await transcriber!.remove(name);
      await deps.uploads!.remove(upload!.key).catch(() => undefined);
    }
  }

  /**
   * Reads one uploaded page and deletes it. Returns its text; UNREADABLE when no text was found and
   * the caller can carry on without it; null when the job has already been finished with a message.
   */
  async function readDocument(documentId: string, label: string, skipUnreadable: boolean): Promise<string | typeof UNREADABLE | null> {
    const reader = deps.reader;
    if (!reader || !deps.uploads) throw new Error('Document reading is not configured');
    await report('reading_input', 'started', label ? `Reading ${label.toLowerCase()}` : 'Reading your document');
    const upload = await verifiedUpload('document', documentId, label);
    if (!upload) return null;
    let lines: string[];
    try {
      lines = await reader.readLines(deps.uploads.bucket, upload.key);
    } catch (error) {
      await deps.uploads.remove(upload.key).catch(() => undefined);
      if (error instanceof Error && /UnsupportedDocument|BadDocument|DocumentTooLarge|InvalidParameter|TextractTimeout/.test(error.name)) {
        logEvent('warn', 'document_unreadable', { jobId: job.jobId, errorName: error.name });
        const message =
          error.name === 'TextractTimeout'
            ? 'That document is taking too long to read. Take a photo of the page with the costs, or upload a shorter PDF.'
            : 'I couldn’t read that file. It may be password-protected or in an unusual format. Take a photo of the page with the costs, or upload a different PDF.';
        await finish('failed', null, null, { code: 'BAD_REQUEST', message: label ? `${label}: ${message}` : message, retryable: false, requestId: job.jobId });
        return null;
      }
      throw error;
    }
    await deps.uploads.remove(upload.key).catch(() => undefined);
    const text = lines.join('\n').slice(0, 8000);
    if (text.replace(/\s/g, '').length < 20) {
      await report('reading_input', 'completed', 'No readable text found');
      if (skipUnreadable) return UNREADABLE;
      await finish('completed', null, envelope(job.caseRevision, [notice('warning', 'I couldn’t read this document', 'The photo may be blurry or cut off. Retake it in good light with the whole page in view, upload a PDF, or type the details instead.')]), null);
      return null;
    }
    await report('reading_input', 'completed', `Read ${lines.length} lines of text`);
    return text;
  }

  async function assess(input: DentalCaseInput, afterDescription: boolean, extraLead: UiBlock[] = []) {
    const estimate = estimateCase(input);
    const lead: UiBlock[] = [
      ...extraLead,
      ...(afterDescription
        ? [notice('info', 'Nothing to confirm from what you shared', 'I could not find plan or treatment details stated there. Answer the questions below or enter the details yourself.')]
        : []),
    ];

    if (estimate.status === 'needs_information') {
      const state = { skipped: job.skippedFieldPaths ?? [], expanded: job.expandedGroups ?? [] };
      const step = planStep(estimate.missing, input, state, job.caseRevision);
      const extra = step.unanswerable.length > 0 ? [notice('info', 'Also needed in your case details', step.unanswerable.map((m) => m.message).join(' ').slice(0, 500))] : [];
      if (step.blocks.length > 0) {
        await report('checking_missing_facts', 'completed', step.message);
        const header = notice('info', step.message, 'Each answer goes straight into the calculator. Choose “I don’t know” for anything you don’t have — I won’t ask again.');
        await finish('needs_information', envelope(job.caseRevision, [...lead, header, ...step.blocks, ...extra].slice(0, 10)), null, null);
        return;
      }
      // Everything left is something the user doesn't have: no more questions, a clear next step instead.
      const items = nextStepItems([...step.skippedFacts, ...step.unanswerable], input);
      await report('checking_missing_facts', 'completed', 'Some details are still needed from your dentist or insurer');
      const blocks: UiBlock[] = [
        ...lead,
        notice('warning', 'I can’t calculate an exact estimate yet', 'A few details are still unknown. Ask for these, then add them to your case and I’ll finish the calculation.'),
      ];
      if (items.length > 0) {
        blocks.push({ id: 'next-step', type: 'next_step', title: 'Questions to ask', items: items.map((item, i) => ({ id: `ask-${i + 1}`, audience: item.audience, text: item.text.slice(0, 200), issueId: null })) });
      }
      await finish('completed', null, envelope(job.caseRevision, blocks.slice(0, 10)), null);
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

  async function finish(
    status: JobRecord['status'],
    questions: UiBlockEnvelope | null,
    resultBlocks: UiBlockEnvelope | null,
    error: JobRecord['error'],
    proposals: FactGroup[] = [],
    transcript?: string,
  ) {
    const ok = await deps.jobs.put(
      { ...job, status, questions, resultBlocks, error, proposals, ...(transcript !== undefined ? { transcript } : {}), leaseToken: null, leaseUntil: null, updatedAt: deps.now().toISOString() },
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
  restrictions: 'Is this right? Limits in your plan',
  procedure: 'Is this right? A recommended procedure',
};

/** First bytes → real file type. File names and declared types are not trusted. */
export type FileType = 'm4a' | 'webm' | 'ogg' | 'pdf' | 'jpeg' | 'png';

export function fileTypeOf(bytes: Uint8Array): FileType | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 8 && ascii(4, 8) === 'ftyp') return 'm4a';
  // Matroska/WebM (EBML header) and Ogg: what browsers record (Opus audio).
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'webm';
  if (ascii(0, 4) === 'OggS') return 'ogg';
  if (ascii(0, 4) === '%PDF') return 'pdf';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes[0] === 0x89 && ascii(1, 4) === 'PNG') return 'png';
  return null;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** A page with no readable text, which a multi-document job skips with a notice. */
const UNREADABLE = Symbol('unreadable');

/** One "Is this right?" confirmation per group of proposed facts (`confirm-N` ↔ proposals[N-1]). */
export function confirmationBlocks(groups: FactGroup[], caseRevision: number, source: 'description' | 'document' = 'description'): MissingFieldBlock[] {
  return groups.slice(0, 9).map((group, index) => ({
    id: `confirm-${index + 1}`,
    type: 'missing_field',
    questionId: `confirm-${index + 1}`,
    fieldPath: group.fieldPath,
    inputType: 'fact_review',
    label: GROUP_LABEL[group.kind],
    reason: `From your ${group.source ?? source}: “${group.quote}”`.slice(0, 300),
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
