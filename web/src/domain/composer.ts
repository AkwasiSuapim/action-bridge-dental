import { UPLOAD_LIMITS } from '@actionbridge/contracts';

/**
 * The composer collects everything first (words, voice transcript, up to three pages) and starts
 * one analysis only when the user chooses Analyse. Pages upload in the background as they are
 * added; no job starts until then. Same rules as the mobile composer.
 */
export const MAX_ATTACHMENTS = 3;
export const MAX_TEXT_LENGTH = 8000;
export const MIN_TEXT_LENGTH = 10;
export const MAX_UPLOAD_BYTES = UPLOAD_LIMITS.document.maxBytes;

export type AttachmentState = 'uploading' | 'ready' | 'failed';

export interface Attachment {
  localId: string;
  name: string;
  kind: 'document' | 'photo';
  file: Blob;
  mimeType: string;
  sizeBytes: number;
  state: AttachmentState;
  uploadId: string | null;
  problem: string | null;
}

const DOCUMENT_TYPES = UPLOAD_LIMITS.document.mimeTypes as readonly string[];

/** The upload type for a picked file, from its reported type or, failing that, its extension. */
export function documentTypeOf(name: string, reported: string): string | null {
  const type = reported.toLowerCase().split(';')[0]!.trim();
  if (DOCUMENT_TYPES.includes(type)) return type;
  const ext = name.toLowerCase().split('.').pop();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  return null;
}

export function addAttachment(
  list: Attachment[],
  file: Omit<Attachment, 'state' | 'uploadId' | 'problem'>,
): { ok: true; list: Attachment[] } | { ok: false; problem: string } {
  if (list.length >= MAX_ATTACHMENTS)
    return {
      ok: false,
      problem: `You can add up to ${MAX_ATTACHMENTS} pages. Remove one to add another.`,
    };
  if (file.sizeBytes > MAX_UPLOAD_BYTES)
    return {
      ok: false,
      problem:
        'That file is larger than 5 MB. Try a one-page PDF, or a smaller photo.',
    };
  if (file.sizeBytes === 0)
    return { ok: false, problem: 'That file is empty.' };
  return {
    ok: true,
    list: [
      ...list,
      { ...file, state: 'uploading', uploadId: null, problem: null },
    ],
  };
}

export const markUploaded = (
  list: Attachment[],
  localId: string,
  uploadId: string,
): Attachment[] =>
  list.map((a) =>
    a.localId === localId
      ? { ...a, state: 'ready', uploadId, problem: null }
      : a,
  );
export const markFailed = (
  list: Attachment[],
  localId: string,
  problem: string,
): Attachment[] =>
  list.map((a) =>
    a.localId === localId
      ? { ...a, state: 'failed', uploadId: null, problem }
      : a,
  );
export const markRetrying = (
  list: Attachment[],
  localId: string,
): Attachment[] =>
  list.map((a) =>
    a.localId === localId ? { ...a, state: 'uploading', problem: null } : a,
  );
export const removeAttachment = (
  list: Attachment[],
  localId: string,
): Attachment[] => list.filter((a) => a.localId !== localId);

export function attachmentName(
  kind: Attachment['kind'],
  picked: string | null | undefined,
  list: Attachment[],
): string {
  const trimmed = picked?.trim();
  if (kind === 'document' && trimmed)
    return trimmed.length > 48 ? `${trimmed.slice(0, 45)}…` : trimmed;
  const n = list.filter((a) => a.kind === kind).length + 1;
  return kind === 'photo' ? `Photo ${n}` : `Document ${n}`;
}

/** `waiting`: something to analyse but a page is still uploading; `empty`: nothing yet. */
export function analyseState(
  text: string,
  list: Attachment[],
): 'empty' | 'waiting' | 'ready' {
  const hasText = text.trim().length >= MIN_TEXT_LENGTH;
  const ready = list.some((a) => a.state === 'ready');
  const uploading = list.some((a) => a.state === 'uploading');
  if (!hasText && !ready && !uploading) return 'empty';
  if (uploading) return 'waiting';
  return hasText || ready ? 'ready' : 'empty';
}

/** The `interpret` job input: the user's words and every uploaded page, in the order added. */
export function jobInput(
  text: string,
  list: Attachment[],
): { text?: string; documentIds?: string[] } {
  const words = text.trim().slice(0, MAX_TEXT_LENGTH);
  const documentIds = list
    .flatMap((a) => (a.state === 'ready' && a.uploadId ? [a.uploadId] : []))
    .slice(0, MAX_ATTACHMENTS);
  return {
    ...(words ? { text: words } : {}),
    ...(documentIds.length > 0 ? { documentIds } : {}),
  };
}

/** Voice transcripts are appended to what is already written, never replacing it. */
export function appendTranscript(current: string, heard: string): string {
  const next = heard.trim();
  if (!next) return current;
  return (current.trim() ? `${current.trimEnd()}\n${next}` : next).slice(
    0,
    MAX_TEXT_LENGTH,
  );
}

/** The best recording format this browser offers that the backend accepts (WebM/Ogg Opus, or MP4). */
export function recordingType(
  isSupported: (type: string) => boolean,
): { recorder: string; upload: string } | null {
  const candidates: [string, string][] = [
    ['audio/webm;codecs=opus', 'audio/webm'],
    ['audio/webm', 'audio/webm'],
    ['audio/ogg;codecs=opus', 'audio/ogg'],
    ['audio/mp4', 'audio/mp4'],
  ];
  const found = candidates.find(([type]) => isSupported(type));
  return found ? { recorder: found[0], upload: found[1] } : null;
}
