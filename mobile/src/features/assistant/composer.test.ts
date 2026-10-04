import { CreateJobRequestSchema } from '@actionbridge/contracts';
import { describe, expect, it } from 'vitest';
import {
  addAttachment,
  analyseState,
  appendTranscript,
  attachmentName,
  jobInput,
  markFailed,
  markRetrying,
  markUploaded,
  removeAttachment,
  type Attachment,
} from './composer';

const file = (localId: string, kind: Attachment['kind'] = 'document') => ({ localId, name: `${localId}.pdf`, kind, uri: `file:///${localId}`, mimeType: 'application/pdf', sizeBytes: 1000 });

function withOne(): Attachment[] {
  const added = addAttachment([], file('a'));
  if (!added.ok) throw new Error(added.problem);
  return added.list;
}

describe('composer drafts', () => {
  it('adds pages as uploading, then ready or failed, and can retry or remove them', () => {
    let list = withOne();
    expect(list[0]).toMatchObject({ state: 'uploading', uploadId: null });
    list = markFailed(list, 'a', 'Upload failed (500).');
    expect(list[0]).toMatchObject({ state: 'failed', problem: 'Upload failed (500).' });
    list = markRetrying(list, 'a');
    expect(list[0]).toMatchObject({ state: 'uploading', problem: null });
    list = markUploaded(list, 'a', 'up-1');
    expect(list[0]).toMatchObject({ state: 'ready', uploadId: 'up-1' });
    expect(removeAttachment(list, 'a')).toEqual([]);
  });

  it('refuses a fourth page and files over 5 MB, with a reason', () => {
    let list: Attachment[] = [];
    for (const id of ['a', 'b', 'c']) {
      const added = addAttachment(list, file(id));
      if (!added.ok) throw new Error(added.problem);
      list = added.list;
    }
    expect(addAttachment(list, file('d'))).toMatchObject({ ok: false, problem: expect.stringContaining('up to 3') });
    expect(addAttachment([], { ...file('big'), sizeBytes: 6 * 1024 * 1024 })).toMatchObject({ ok: false, problem: expect.stringContaining('5 MB') });
  });

  it('Analyse needs words or a ready page, and waits while a page uploads', () => {
    expect(analyseState('', [])).toBe('empty');
    expect(analyseState('crown', [])).toBe('empty');
    expect(analyseState('My dentist recommends a crown.', [])).toBe('ready');
    const uploading = withOne();
    expect(analyseState('My dentist recommends a crown.', uploading)).toBe('waiting');
    expect(analyseState('', markUploaded(uploading, 'a', 'up-1'))).toBe('ready');
    expect(analyseState('', markFailed(uploading, 'a', 'x'))).toBe('empty');
  });

  it('builds one contract-valid interpret input from words and ready pages only', () => {
    let list = withOne();
    const second = addAttachment(list, file('b', 'photo'));
    if (!second.ok) throw new Error(second.problem);
    list = markFailed(markUploaded(second.list, 'a', 'up-1'), 'b', 'x');
    const input = jobInput('  A crown at $1,000.  ', list);
    expect(input).toEqual({ text: 'A crown at $1,000.', documentIds: ['up-1'] });
    expect(CreateJobRequestSchema.parse({ expectedRevision: 1, operation: 'interpret', input }).input).toEqual(input);
    expect(jobInput('', [])).toEqual({});
  });

  it('names pages readably and appends transcripts without replacing typed words', () => {
    expect(attachmentName('document', 'estimate.pdf', [])).toBe('estimate.pdf');
    expect(attachmentName('photo', null, withOne().map((a) => ({ ...a, kind: 'photo' as const })))).toBe('Photo 2');
    expect(appendTranscript('I have insurance.', ' My dentist wants a crown. ')).toBe('I have insurance.\nMy dentist wants a crown.');
    expect(appendTranscript('', 'Hello there')).toBe('Hello there');
    expect(appendTranscript('Kept', '   ')).toBe('Kept');
  });
});
