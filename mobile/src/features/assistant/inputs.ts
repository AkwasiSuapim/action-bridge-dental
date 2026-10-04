import type { AgentJobView, CreateUploadResponse } from '@actionbridge/contracts';
import { File, UploadType } from 'expo-file-system';
import type { ApiClient } from '../../services/api';
import { isTerminal, pollDelayMs } from './answers';

/** A recording or document on the device, ready to upload. */
export interface LocalFile {
  uri: string;
  mimeType: string;
  sizeBytes: number;
}

export { MAX_UPLOAD_BYTES, mimeTypeFor } from './file-types';

/** Sends the file to the presigned POST slot. S3 enforces size and type; any non-2xx is an error. */
export async function uploadToSlot(slot: CreateUploadResponse, file: LocalFile): Promise<void> {
  const result = await new File(file.uri).upload(slot.url, {
    httpMethod: 'POST',
    uploadType: UploadType.MULTIPART,
    fieldName: 'file',
    parameters: slot.fields,
  });
  if (result.status < 200 || result.status >= 300) {
    throw new Error(result.status === 400 || result.status === 403 ? 'The upload was refused — the file may be too large or the wrong type.' : `Upload failed (${result.status}).`);
  }
}

/** Upload, then start the job that reads it. Returns the job ID. */
export async function uploadAndStart(
  api: ApiClient,
  caseId: string,
  caseRevision: number,
  kind: 'audio' | 'document',
  file: LocalFile,
): Promise<string> {
  const slot = await api.createUpload(caseId, { kind, mimeType: file.mimeType, sizeBytes: file.sizeBytes });
  await uploadToSlot(slot, file);
  const { jobId } = await api.createJob(caseId, {
    expectedRevision: caseRevision,
    operation: kind === 'audio' ? 'transcribe_audio' : 'analyze_document',
    input: { documentId: slot.uploadId },
  });
  return jobId;
}

/** Polls a job until it needs the user or ends; bounded so the screen never spins forever. */
export async function waitForJob(api: ApiClient, jobId: string, isCancelled: () => boolean, maxMs = 90_000): Promise<AgentJobView | null> {
  const started = Date.now();
  for (let attempt = 0; !isCancelled(); attempt++) {
    const job = await api.getJob(jobId);
    if (isTerminal(job.status)) return job;
    if (Date.now() - started > maxMs) return null;
    await new Promise((resolve) => setTimeout(resolve, pollDelayMs(attempt)));
  }
  return null;
}
