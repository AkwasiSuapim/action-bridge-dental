import { UPLOAD_LIMITS, type CreateUploadRequest, type CreateUploadResponse } from '@actionbridge/contracts';
import type { CaseService } from '../../cases/application/case-service.js';
import { uploadKey, type UploadStore } from '../ports.js';

const SLOT_SECONDS = 300;

/**
 * Issues a short-lived, private upload slot for a voice note or a document; multi-page PDFs are read up to the first 5 pages (doc 03 §7).
 * The key is derived from the authenticated owner, so an upload ID alone can reach nothing.
 */
export class UploadService {
  constructor(
    private readonly deps: { cases: CaseService; uploads: UploadStore; newId: () => string; now: () => Date },
  ) {}

  async create(ownerId: string, caseId: string, request: CreateUploadRequest): Promise<CreateUploadResponse> {
    await this.deps.cases.get(ownerId, caseId); // 404 for an unknown or another user's case
    const uploadId = this.deps.newId();
    const maxBytes = UPLOAD_LIMITS[request.kind].maxBytes;
    const { url, fields } = await this.deps.uploads.presignPost(uploadKey(ownerId, caseId, uploadId), request.mimeType, maxBytes, SLOT_SECONDS);
    return { uploadId, url, fields, expiresAt: new Date(this.deps.now().getTime() + SLOT_SECONDS * 1000).toISOString(), maxBytes };
  }
}
