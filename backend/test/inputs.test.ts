import { CreateUploadResponseSchema } from '@actionbridge/contracts';
import { describe, expect, it } from 'vitest';
import { fileTypeOf } from '../src/features/agent-jobs/application/job-runner.js';
import { uploadKey, type DocumentReader, type Transcriber, type UploadStore } from '../src/features/agent-jobs/ports.js';
import { createAgentHarness, ScriptedModel, textTurn, toolTurn } from './agent-harness.js';
import { MAYA, OTHER } from './helpers.js';

const M4A = new Uint8Array([0, 0, 0, 0x18, ...Buffer.from('ftypM4A '), 0, 0, 0, 0]);
const PDF = new Uint8Array(Buffer.from('%PDF-1.7\n%âãÏÓ'));

class FakeUploads implements UploadStore {
  readonly bucket = 'uploads-bucket';
  readonly objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  readonly removed: string[] = [];
  readonly presigned: { key: string; contentType: string; maxBytes: number }[] = [];
  async presignPost(key: string, contentType: string, maxBytes: number) {
    this.presigned.push({ key, contentType, maxBytes });
    return { url: 'https://uploads-bucket.s3.us-east-2.amazonaws.com/', fields: { key, 'Content-Type': contentType, Policy: 'p', 'X-Amz-Signature': 's' } };
  }
  async head(key: string) {
    const o = this.objects.get(key);
    return o ? { sizeBytes: o.bytes.length, contentType: o.contentType } : null;
  }
  async firstBytes(key: string, count: number) {
    return (this.objects.get(key)?.bytes ?? new Uint8Array()).slice(0, count);
  }
  async remove(key: string) {
    this.removed.push(key);
    this.objects.delete(key);
  }
}

class FakeTranscriber implements Transcriber {
  readonly started: string[] = [];
  readonly removed: string[] = [];
  constructor(private readonly statuses: ('IN_PROGRESS' | 'COMPLETED' | 'FAILED')[], private readonly text: string) {}
  async start(name: string, s3Uri: string) {
    this.started.push(`${name} ${s3Uri}`);
  }
  async get() {
    const status = this.statuses.shift() ?? 'COMPLETED';
    return status === 'COMPLETED' ? { status, transcriptUri: 'https://transcripts.example/t.json' } : { status };
  }
  async fetchTranscript() {
    return this.text;
  }
  async remove(name: string) {
    this.removed.push(name);
  }
}

const reader = (result: string[] | Error): DocumentReader => ({
  readLines: async () => {
    if (result instanceof Error) throw result;
    return result;
  },
});

async function caseFor(h: ReturnType<typeof createAgentHarness>) {
  const created = await h.call('POST /v1/cases', {}, { currency: 'USD', coverageMode: 'unknown', policy: null, planYears: {}, procedures: [] });
  return created.body.caseId as string;
}

async function uploaded(h: ReturnType<typeof createAgentHarness>, store: FakeUploads, caseId: string, kind: 'audio' | 'document', mimeType: string, bytes?: Uint8Array) {
  const slot = await h.call('POST /v1/cases/{caseId}/uploads', { caseId }, { kind, mimeType, sizeBytes: 1000 });
  expect(slot.status).toBe(201);
  const { uploadId } = CreateUploadResponseSchema.parse(slot.body);
  if (bytes) store.objects.set(uploadKey(`demo:${MAYA}`, caseId, uploadId), { bytes, contentType: mimeType });
  return uploadId;
}

async function startJob(h: ReturnType<typeof createAgentHarness>, caseId: string, operation: string, documentId?: string) {
  const job = await h.call('POST /v1/cases/{caseId}/jobs', { caseId }, { expectedRevision: 1, operation, input: documentId ? { documentId } : {} });
  expect(job.status).toBe(202);
  await h.drain();
  return (await h.call('GET /v1/jobs/{jobId}', { jobId: job.body.jobId })).body;
}

describe('upload slots', () => {
  it('issues a short-lived slot keyed to the owner, with S3-enforced size and type', async () => {
    const store = new FakeUploads();
    const h = createAgentHarness(new ScriptedModel([]), { uploads: store });
    const caseId = await caseFor(h);
    const uploadId = await uploaded(h, store, caseId, 'audio', 'audio/mp4');
    expect(store.presigned[0]).toEqual({ key: uploadKey(`demo:${MAYA}`, caseId, uploadId), contentType: 'audio/mp4', maxBytes: 5 * 1024 * 1024 });
    expect(store.presigned[0]?.key).not.toContain(MAYA);
  });

  it('refuses unsupported types, oversized files and other users’ cases', async () => {
    const store = new FakeUploads();
    const h = createAgentHarness(new ScriptedModel([]), { uploads: store });
    const caseId = await caseFor(h);
    expect((await h.call('POST /v1/cases/{caseId}/uploads', { caseId }, { kind: 'audio', mimeType: 'video/mp4', sizeBytes: 10 })).status).toBe(400);
    expect((await h.call('POST /v1/cases/{caseId}/uploads', { caseId }, { kind: 'document', mimeType: 'application/pdf', sizeBytes: 6 * 1024 * 1024 })).status).toBe(400);
    expect((await h.call('POST /v1/cases/{caseId}/uploads', { caseId }, { kind: 'document', mimeType: 'application/pdf', sizeBytes: 10 }, OTHER)).status).toBe(404);
  });

  it('upload jobs need an uploaded file', async () => {
    const h = createAgentHarness(new ScriptedModel([]), { uploads: new FakeUploads() });
    const caseId = await caseFor(h);
    expect((await h.call('POST /v1/cases/{caseId}/jobs', { caseId }, { expectedRevision: 1, operation: 'transcribe_audio', input: {} })).status).toBe(400);
  });

  it('recognizes files by their first bytes, not their names', () => {
    expect(fileTypeOf(M4A)).toBe('m4a');
    expect(fileTypeOf(PDF)).toBe('pdf');
    expect(fileTypeOf(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(fileTypeOf(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe('png');
    expect(fileTypeOf(new Uint8Array(Buffer.from('<html>')))).toBeNull();
  });
});

describe('U-07 voice: record → transcribe → editable transcript', () => {
  it('returns the transcript for review and deletes the audio and the transcription job', async () => {
    const store = new FakeUploads();
    const transcriber = new FakeTranscriber(['IN_PROGRESS', 'COMPLETED'], 'My dentist recommends a crown at $1,000.');
    const h = createAgentHarness(new ScriptedModel([]), { uploads: store, transcriber });
    const caseId = await caseFor(h);
    const uploadId = await uploaded(h, store, caseId, 'audio', 'audio/mp4', M4A);
    const job = await startJob(h, caseId, 'transcribe_audio', uploadId);

    expect(job).toMatchObject({ status: 'completed', transcript: 'My dentist recommends a crown at $1,000.' });
    expect(job.resultBlocks.blocks[0]).toMatchObject({ type: 'notice', title: 'Here’s what I heard' });
    expect(transcriber.started[0]).toContain(`s3://uploads-bucket/${uploadKey(`demo:${MAYA}`, caseId, uploadId)}`);
    expect(transcriber.removed).toEqual([`actionbridge-${job.jobId}`]);
    expect(store.objects.size).toBe(0);
    // The transcript is not applied to the case: the user edits it, then starts an interpret job.
    expect((await h.call('GET /v1/cases/{caseId}', { caseId })).body.caseRevision).toBe(1);
  });

  it('a file that is not audio is rejected and removed', async () => {
    const store = new FakeUploads();
    const h = createAgentHarness(new ScriptedModel([]), { uploads: store, transcriber: new FakeTranscriber([], 'x') });
    const caseId = await caseFor(h);
    const uploadId = await uploaded(h, store, caseId, 'audio', 'audio/mp4', PDF);
    const job = await startJob(h, caseId, 'transcribe_audio', uploadId);
    expect(job).toMatchObject({ status: 'failed', error: { code: 'BAD_REQUEST', retryable: false } });
    expect(store.objects.size).toBe(0);
  });

  it('a missing upload and a failed transcription are explained, not silent', async () => {
    const store = new FakeUploads();
    const h = createAgentHarness(new ScriptedModel([]), { uploads: store, transcriber: new FakeTranscriber(['FAILED'], '') });
    const caseId = await caseFor(h);
    const missing = await uploaded(h, store, caseId, 'audio', 'audio/mp4');
    expect(await startJob(h, caseId, 'transcribe_audio', missing)).toMatchObject({ status: 'failed', error: { message: expect.stringContaining('not found') } });
    const real = await uploaded(h, store, caseId, 'audio', 'audio/mp4', M4A);
    expect(await startJob(h, caseId, 'transcribe_audio', real)).toMatchObject({ status: 'failed', error: { message: expect.stringContaining('couldn’t process') } });
  });

  it('silence yields an honest "no words recognized" instead of an empty success', async () => {
    const store = new FakeUploads();
    const h = createAgentHarness(new ScriptedModel([]), { uploads: store, transcriber: new FakeTranscriber(['COMPLETED'], '') });
    const caseId = await caseFor(h);
    const uploadId = await uploaded(h, store, caseId, 'audio', 'audio/mp4', M4A);
    const job = await startJob(h, caseId, 'transcribe_audio', uploadId);
    expect(job).toMatchObject({ status: 'completed', transcript: '' });
    expect(job.resultBlocks.blocks[0]).toMatchObject({ severity: 'warning', title: 'No words recognized' });
  });
});

describe('U-06 documents and photos: read → same verified assistant', () => {
  const LINES = ['Treatment estimate', 'Crown (D2740) fee $1,000.00', 'Patient: [synthetic]'];

  it('reads the page, proposes facts quoted from the document, and deletes the file', async () => {
    const store = new FakeUploads();
    const model = new ScriptedModel([
      toolTurn('record_case_facts', { procedures: [{ label: 'Crown', category: 'major', providerChargeCents: 100000, quote: 'Crown (D2740) fee $1,000.00' }] }),
      textTurn('I found one procedure.'),
    ]);
    const h = createAgentHarness(model, { uploads: store, reader: reader(LINES) });
    const caseId = await caseFor(h);
    const uploadId = await uploaded(h, store, caseId, 'document', 'application/pdf', PDF);
    const job = await startJob(h, caseId, 'analyze_document', uploadId);

    expect(job.status).toBe('needs_information');
    const confirm = job.questions.blocks.find((b: { inputType?: string }) => b.inputType === 'fact_review');
    expect(confirm).toMatchObject({ candidateValue: 'Crown (major service) · charge $1,000.00', reason: 'From your document: “Crown (D2740) fee $1,000.00”' });
    expect(job.events.map((e: { summary: string }) => e.summary)).toContain('Read 3 lines of text');
    expect(store.objects.size).toBe(0);

    const answered = await h.call('POST /v1/jobs/{jobId}/answers', { jobId: job.jobId }, {
      expectedRevision: 1,
      answers: [{ questionId: confirm.questionId, value: true, unknown: false, responseMode: 'tap', attachmentId: null }],
    });
    expect(answered.status).toBe(202);
    const record = (await h.call('GET /v1/cases/{caseId}', { caseId })).body;
    expect(record.sourceFacts.find((f: { fieldPath: string }) => f.fieldPath === 'procedures.proc-1')).toMatchObject({ sourceId: `upload-${uploadId}`, origin: 'agent_proposed' });
  });

  it('a multi-page document asks for one page at a time', async () => {
    const store = new FakeUploads();
    const error = Object.assign(new Error('multi-page'), { name: 'UnsupportedDocumentException' });
    const h = createAgentHarness(new ScriptedModel([]), { uploads: store, reader: reader(error) });
    const caseId = await caseFor(h);
    const uploadId = await uploaded(h, store, caseId, 'document', 'application/pdf', PDF);
    expect(await startJob(h, caseId, 'analyze_document', uploadId)).toMatchObject({ status: 'failed', error: { message: expect.stringContaining('one page at a time') } });
    expect(store.objects.size).toBe(0);
  });

  it('a blurry photo with no readable text offers retake, PDF or typing', async () => {
    const store = new FakeUploads();
    const h = createAgentHarness(new ScriptedModel([]), { uploads: store, reader: reader([]) });
    const caseId = await caseFor(h);
    const uploadId = await uploaded(h, store, caseId, 'document', 'image/jpeg', new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]));
    const job = await startJob(h, caseId, 'analyze_document', uploadId);
    expect(job.status).toBe('completed');
    expect(job.resultBlocks.blocks[0]).toMatchObject({ title: 'I couldn’t read this document', body: expect.stringContaining('Retake') });
  });
});

describe('composer: one analysis over the user’s words and several pages', () => {
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  /** Returns different text per uploaded file, keyed by the upload ID at the end of the S3 key. */
  const keyedReader = (pages: Record<string, string[]>): DocumentReader => ({
    readLines: async (_bucket, key) => pages[key.split('/').pop() ?? ''] ?? [],
  });

  async function composerJob(h: ReturnType<typeof createAgentHarness>, caseId: string, text: string, documentIds: string[]) {
    const job = await h.call('POST /v1/cases/{caseId}/jobs', { caseId }, { expectedRevision: 1, operation: 'interpret', input: { text, documentIds } });
    expect(job.status).toBe(202);
    await h.drain();
    return (await h.call('GET /v1/jobs/{jobId}', { jobId: job.body.jobId })).body;
  }

  it('reads every page, runs the agent once, and cites each confirmation from where it was found', async () => {
    const store = new FakeUploads();
    const pages: Record<string, string[]> = {};
    const model = new ScriptedModel([
      toolTurn('record_case_facts', {
        coverageMode: { value: 'insured', quote: 'I have dental insurance' },
        procedures: [{ label: 'Crown', category: 'major', providerChargeCents: 100000, quote: 'Crown (D2740) fee $1,000.00' }],
      }),
      textTurn('I found your coverage and one procedure.'),
    ]);
    const h = createAgentHarness(model, { uploads: store, reader: keyedReader(pages) });
    const caseId = await caseFor(h);
    const first = await uploaded(h, store, caseId, 'document', 'application/pdf', PDF);
    const second = await uploaded(h, store, caseId, 'document', 'image/jpeg', JPEG);
    pages[first] = ['Benefits summary', 'Major services covered at 50 percent'];
    pages[second] = ['Treatment estimate', 'Crown (D2740) fee $1,000.00'];

    const job = await composerJob(h, caseId, 'I have dental insurance and my dentist wants a crown.', [first, second]);

    expect(job.status).toBe('needs_information');
    expect(model.requests[0]?.messages[0]?.content[0]).toMatchObject({ text: expect.stringContaining('Document 2:\nTreatment estimate') });
    const confirms = job.questions.blocks.filter((b: { inputType?: string }) => b.inputType === 'fact_review');
    expect(confirms.map((c: { reason: string }) => c.reason)).toEqual([
      'From your description: “I have dental insurance”',
      'From your document: “Crown (D2740) fee $1,000.00”',
    ]);
    expect(job.events.map((e: { summary: string }) => e.summary)).toEqual(expect.arrayContaining(['Reading document 1', 'Reading document 2']));
    expect(store.objects.size).toBe(0);

    await h.call('POST /v1/jobs/{jobId}/answers', { jobId: job.jobId }, {
      expectedRevision: 1,
      answers: confirms.map((c: { questionId: string }) => ({ questionId: c.questionId, value: true, unknown: false, responseMode: 'tap', attachmentId: null })),
    });
    const facts = (await h.call('GET /v1/cases/{caseId}', { caseId })).body.sourceFacts as { fieldPath: string; sourceId: string | null }[];
    expect(facts.find((f) => f.fieldPath === 'coverageMode')?.sourceId).toBe('user-description');
    expect(facts.find((f) => f.fieldPath === 'procedures.proc-1')?.sourceId).toBe(`upload-${second}`);
  });

  it('skips an unreadable page with a notice and still analyses the rest', async () => {
    const store = new FakeUploads();
    const pages: Record<string, string[]> = {};
    const model = new ScriptedModel([
      toolTurn('record_case_facts', { procedures: [{ label: 'Crown', category: 'major', quote: 'a crown' }] }),
      textTurn('One procedure.'),
    ]);
    const h = createAgentHarness(model, { uploads: store, reader: keyedReader(pages) });
    const caseId = await caseFor(h);
    const blurry = await uploaded(h, store, caseId, 'document', 'image/jpeg', JPEG);
    const job = await composerJob(h, caseId, 'My dentist recommends a crown.', [blurry]);
    expect(job.status).toBe('needs_information');
    expect(job.questions.blocks).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'notice', title: 'I couldn’t read Document 1' })]));
    expect(store.objects.size).toBe(0);
  });

  it('only unreadable pages and no words: an honest notice, no model call', async () => {
    const store = new FakeUploads();
    const model = new ScriptedModel([]);
    const h = createAgentHarness(model, { uploads: store, reader: keyedReader({}) });
    const caseId = await caseFor(h);
    const blurry = await uploaded(h, store, caseId, 'document', 'image/jpeg', JPEG);
    const job = await composerJob(h, caseId, '', [blurry]);
    expect(job).toMatchObject({ status: 'completed', resultBlocks: { blocks: [{ title: 'I couldn’t read your documents' }] } });
    expect(model.requests).toHaveLength(0);
  });

  it('a page that is not a document fails the job and names which one', async () => {
    const store = new FakeUploads();
    const h = createAgentHarness(new ScriptedModel([]), { uploads: store, reader: keyedReader({}) });
    const caseId = await caseFor(h);
    const ok = await uploaded(h, store, caseId, 'document', 'application/pdf', PDF);
    const bad = await uploaded(h, store, caseId, 'document', 'image/png', new Uint8Array(Buffer.from('<html>')));
    const job = await composerJob(h, caseId, 'A crown.', [ok, bad]);
    expect(job).toMatchObject({ status: 'failed', error: { code: 'BAD_REQUEST', message: expect.stringMatching(/^Document 2: /) } });
    expect(store.objects.size).toBe(0);
  });

  it('accepts at most three pages', async () => {
    const h = createAgentHarness(new ScriptedModel([]), { uploads: new FakeUploads() });
    const caseId = await caseFor(h);
    const ids = ['a1', 'a2', 'a3', 'a4'];
    expect((await h.call('POST /v1/cases/{caseId}/jobs', { caseId }, { expectedRevision: 1, operation: 'interpret', input: { text: 'x', documentIds: ids } })).status).toBe(400);
  });
});

describe('web voice: browser recordings', () => {
  const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0, 0, 0, 0, 0, 0, 0]);
  const OGG = new Uint8Array(Buffer.from('OggS\0\x02\0\0\0\0\0\0\0\0\0\0'));

  it('recognizes WebM and Ogg by their first bytes', () => {
    expect(fileTypeOf(WEBM)).toBe('webm');
    expect(fileTypeOf(OGG)).toBe('ogg');
  });

  it('accepts a WebM upload slot and tells Transcribe the real format', async () => {
    const store = new FakeUploads();
    const formats: (string | undefined)[] = [];
    const transcriber = new FakeTranscriber(['COMPLETED'], 'A crown at $1,000.');
    const original = transcriber.start.bind(transcriber);
    transcriber.start = async (name: string, uri: string, format?: string) => {
      formats.push(format);
      return original(name, uri);
    };
    const h = createAgentHarness(new ScriptedModel([]), { uploads: store, transcriber });
    const caseId = await caseFor(h);
    const uploadId = await uploaded(h, store, caseId, 'audio', 'audio/webm', WEBM);
    const job = await startJob(h, caseId, 'transcribe_audio', uploadId);
    expect(job).toMatchObject({ status: 'completed', transcript: 'A crown at $1,000.' });
    expect(formats).toEqual(['webm']);
  });
});
