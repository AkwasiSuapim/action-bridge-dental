import { CreateJobRequestSchema, CreateUploadRequestSchema, EmptyRequestSchema, IdSchema, JobAnswersRequestSchema } from '@actionbridge/contracts';
import { resolveOwnerId, type AuthMode } from '../../../shared/auth.js';
import { HttpError, jsonResult, parseBody, type HttpEvent, type RouteHandler } from '../../../shared/http.js';
import { caseIdFrom } from '../../cases/api/case-routes.js';
import type { JobService } from '../application/job-service.js';
import type { UploadService } from '../application/upload-service.js';

export interface JobRouteDeps {
  jobs: JobService;
  uploads?: UploadService;
  authMode: AuthMode;
}

function jobIdFrom(event: HttpEvent): string {
  const parsed = IdSchema.safeParse(event.pathParameters?.jobId);
  if (!parsed.success) throw new HttpError('NOT_FOUND', 'Analysis not found.');
  return parsed.data;
}

/** Agent jobs (system design §6). Results are polled; the backend owns completion. */
export function jobRoutes({ jobs, uploads, authMode }: JobRouteDeps): Record<string, RouteHandler> {
  return {
    'POST /v1/cases/{caseId}/uploads': async (event) => {
      const ownerId = resolveOwnerId(event, authMode);
      if (!uploads) throw new HttpError('BAD_REQUEST', 'Uploads are not available in this environment.');
      const slot = await uploads.create(ownerId, caseIdFrom(event), parseBody(event, CreateUploadRequestSchema));
      return jsonResult(201, slot, event.requestContext.requestId);
    },
    'POST /v1/cases/{caseId}/jobs': async (event) => {
      const ownerId = resolveOwnerId(event, authMode);
      const created = await jobs.create(ownerId, caseIdFrom(event), parseBody(event, CreateJobRequestSchema));
      return jsonResult(202, created, event.requestContext.requestId);
    },
    'GET /v1/jobs/{jobId}': async (event) => {
      const ownerId = resolveOwnerId(event, authMode);
      return jsonResult(200, await jobs.view(ownerId, jobIdFrom(event)), event.requestContext.requestId);
    },
    'POST /v1/jobs/{jobId}/answers': async (event) => {
      const ownerId = resolveOwnerId(event, authMode);
      const next = await jobs.answer(ownerId, jobIdFrom(event), parseBody(event, JobAnswersRequestSchema));
      return jsonResult(202, next, event.requestContext.requestId);
    },
    'POST /v1/jobs/{jobId}/retry': async (event) => {
      const ownerId = resolveOwnerId(event, authMode);
      const jobId = jobIdFrom(event);
      parseBody(event, EmptyRequestSchema);
      return jsonResult(202, await jobs.retry(ownerId, jobId), event.requestContext.requestId);
    },
    'POST /v1/jobs/{jobId}/cancel': async (event) => {
      const ownerId = resolveOwnerId(event, authMode);
      const jobId = jobIdFrom(event);
      parseBody(event, EmptyRequestSchema);
      return jsonResult(200, await jobs.cancel(ownerId, jobId), event.requestContext.requestId);
    },
  };
}
