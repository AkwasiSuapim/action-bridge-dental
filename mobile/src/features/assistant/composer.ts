import { MAX_UPLOAD_BYTES } from './file-types';

/**
 * The composer collects everything first (words, voice transcript, up to three pages) and starts
 * one analysis only when the user taps Analyse. Pages upload in the background as soon as they are
 * picked, but no job starts until then.
 */
export const MAX_ATTACHMENTS = 3;
export const MAX_TEXT_LENGTH = 8000;
/** Fewer characters than this is not a description yet ("hi", "crown"). */
export const MIN_TEXT_LENGTH = 10;

export type AttachmentState = 'uploading' | 'ready' | 'failed';

export interface Attachment {
  /** Local key for the list; the server's upload ID arrives once the file is uploaded. */
  localId: string;
  name: string;
  kind: 'document' | 'photo';
  uri: string;
  mimeType: string;
  sizeBytes: number;
  state: AttachmentState;
  uploadId: string | null;
  problem: string | null;
}

/** Adds a picked file, or explains why it can't be added. Never more than three, never over 5 MB. */
export function addAttachment(
  list: Attachment[],
  file: Omit<Attachment, 'state' | 'uploadId' | 'problem'>,
): { ok: true; list: Attachment[] } | { ok: false; problem: string } {
  if (list.length >= MAX_ATTACHMENTS) return { ok: false, problem: `You can add up to ${MAX_ATTACHMENTS} pages. Remove one to add another.` };
  if (file.sizeBytes > MAX_UPLOAD_BYTES) return { ok: false, problem: 'That file is larger than 5 MB. Try a one-page PDF, or take a photo instead.' };
  return { ok: true, list: [...list, { ...file, state: 'uploading', uploadId: null, problem: null }] };
}

export function markUploaded(list: Attachment[], localId: string, uploadId: string): Attachment[] {
  return list.map((a) => (a.localId === localId ? { ...a, state: 'ready', uploadId, problem: null } : a));
}

export function markFailed(list: Attachment[], localId: string, problem: string): Attachment[] {
  return list.map((a) => (a.localId === localId ? { ...a, state: 'failed', uploadId: null, problem } : a));
}

export function markRetrying(list: Attachment[], localId: string): Attachment[] {
  return list.map((a) => (a.localId === localId ? { ...a, state: 'uploading', problem: null } : a));
}

export function removeAttachment(list: Attachment[], localId: string): Attachment[] {
  return list.filter((a) => a.localId !== localId);
}

/** A readable default name: the picked file's own name, or "Photo 2". */
export function attachmentName(kind: Attachment['kind'], pickedName: string | null | undefined, list: Attachment[]): string {
  const trimmed = pickedName?.trim();
  if (kind === 'document' && trimmed) return trimmed.length > 40 ? `${trimmed.slice(0, 37)}…` : trimmed;
  const n = list.filter((a) => a.kind === kind).length + 1;
  return kind === 'photo' ? `Photo ${n}` : `Document ${n}`;
}

/**
 * Whether Analyse can run now. `waiting` means there is something to analyse but a page is still
 * uploading; `empty` means there is nothing yet.
 */
export function analyseState(text: string, list: Attachment[]): 'empty' | 'waiting' | 'ready' {
  const hasText = text.trim().length >= MIN_TEXT_LENGTH;
  const ready = list.some((a) => a.state === 'ready');
  const uploading = list.some((a) => a.state === 'uploading');
  if (!hasText && !ready && !uploading) return 'empty';
  if (uploading) return 'waiting';
  return hasText || ready ? 'ready' : 'empty';
}

/** The `interpret` job input: the user's words and every uploaded page, in the order added. */
export function jobInput(text: string, list: Attachment[]): { text?: string; documentIds?: string[] } {
  const words = text.trim().slice(0, MAX_TEXT_LENGTH);
  const documentIds = list.flatMap((a) => (a.state === 'ready' && a.uploadId ? [a.uploadId] : [])).slice(0, MAX_ATTACHMENTS);
  return { ...(words ? { text: words } : {}), ...(documentIds.length > 0 ? { documentIds } : {}) };
}

/** Voice transcripts are appended to what is already written, never replacing it. */
export function appendTranscript(current: string, heard: string): string {
  const next = heard.trim();
  if (!next) return current;
  return (current.trim() ? `${current.trimEnd()}\n${next}` : next).slice(0, MAX_TEXT_LENGTH);
}
