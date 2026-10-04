import { describe, expect, it } from 'vitest';
import { MAX_PDF_PAGES, TextractReader } from '../src/features/agent-jobs/infrastructure/aws-inputs.js';

type Sent = { name: string; input: Record<string, unknown> };

/** A fake Textract client that answers by command name; records what was sent. */
function fakeClient(answer: (sent: Sent) => unknown) {
  const sent: Sent[] = [];
  return {
    sent,
    client: {
      send: async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
        const call = { name: command.constructor.name, input: command.input };
        sent.push(call);
        const result = answer(call);
        if (result instanceof Error) throw result;
        return result;
      },
    } as never,
  };
}

const unsupported = Object.assign(new Error('Request has unsupported document format'), { name: 'UnsupportedDocumentException' });
const line = (text: string, page = 1) => ({ BlockType: 'LINE', Text: text, Page: page });
const noWait = { sleep: async () => undefined };

describe('TextractReader', () => {
  it('reads images and one-page PDFs with the instant API', async () => {
    const { client, sent } = fakeClient(() => ({ Blocks: [line('Crown fee $1,000.00'), { BlockType: 'WORD', Text: 'Crown' }] }));
    expect(await new TextractReader(client, noWait).readLines('b', 'k')).toEqual(['Crown fee $1,000.00']);
    expect(sent.map((s) => s.name)).toEqual(['DetectDocumentTextCommand']);
  });

  it('falls back to the asynchronous API for a multi-page PDF and keeps only the first pages', async () => {
    let polls = 0;
    const { client, sent } = fakeClient(({ name, input }) => {
      if (name === 'DetectDocumentTextCommand') return unsupported;
      if (name === 'StartDocumentTextDetectionCommand') return { JobId: 'job-1' };
      if (!input.NextToken) {
        polls++;
        if (polls === 1) return { JobStatus: 'IN_PROGRESS' };
        return { JobStatus: 'SUCCEEDED', Blocks: [line('Page one: crown $1,000.00', 1), line('Page two: plan pays 50%', 2)], NextToken: 'more' };
      }
      return { JobStatus: 'SUCCEEDED', Blocks: [line('Page six: appendix', MAX_PDF_PAGES + 1)] };
    });
    const lines = await new TextractReader(client, noWait).readLines('b', 'k');
    expect(lines).toEqual(['Page one: crown $1,000.00', 'Page two: plan pays 50%']);
    expect(sent.map((s) => s.name)).toEqual([
      'DetectDocumentTextCommand',
      'StartDocumentTextDetectionCommand',
      'GetDocumentTextDetectionCommand',
      'GetDocumentTextDetectionCommand',
      'GetDocumentTextDetectionCommand',
    ]);
  });

  it('gives up within its time budget instead of running past the worker timeout', async () => {
    let clock = 0;
    const { client } = fakeClient(({ name }) =>
      name === 'DetectDocumentTextCommand' ? unsupported : name === 'StartDocumentTextDetectionCommand' ? { JobId: 'j' } : { JobStatus: 'IN_PROGRESS' },
    );
    const reader = new TextractReader(client, { sleep: async () => void (clock += 1500), now: () => clock, maxWaitMs: 5000 });
    await expect(reader.readLines('b', 'k')).rejects.toMatchObject({ name: 'TextractTimeout' });
  });

  it('passes through errors other than an unsupported format', async () => {
    const throttled = Object.assign(new Error('slow down'), { name: 'ThrottlingException' });
    const { client } = fakeClient(() => throttled);
    await expect(new TextractReader(client, noWait).readLines('b', 'k')).rejects.toMatchObject({ name: 'ThrottlingException' });
  });
});
