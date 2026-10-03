import {
  ERROR_HTTP_STATUS,
  FieldPathSchema,
  type ErrorCode,
  type ErrorEnvelope,
  type ErrorIssue,
} from '@actionbridge/contracts';
import type { z } from 'zod';
import { logRequest } from './logger.js';

/** The subset of an API Gateway HTTP API (payload v2) event the handlers use. */
export interface HttpEvent {
  routeKey: string;
  pathParameters?: Record<string, string | undefined>;
  headers?: Record<string, string | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
  requestContext: {
    requestId: string;
    authorizer?: { jwt?: { claims?: Record<string, unknown> } };
  };
}

export interface HttpResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

const MAX_BODY_BYTES = 64 * 1024;
const RETRYABLE_CODES: ReadonlySet<ErrorCode> = new Set(['RATE_LIMITED', 'UPSTREAM_UNAVAILABLE']);

/** An expected failure that maps to the shared error envelope. */
export class HttpError extends Error {
  override readonly name = 'HttpError';
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly issues?: ErrorIssue[],
  ) {
    super(message);
  }
}

export function jsonResult(statusCode: number, body: unknown, requestId: string): HttpResult {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'x-request-id': requestId,
    },
    body: JSON.stringify(body),
  };
}

export function errorResult(code: ErrorCode, message: string, requestId: string, issues?: ErrorIssue[]): HttpResult {
  const envelope: ErrorEnvelope = {
    error: {
      code,
      message,
      retryable: RETRYABLE_CODES.has(code),
      requestId,
      ...(issues && issues.length > 0 ? { issues: issues.slice(0, 50) } : {}),
    },
  };
  return jsonResult(ERROR_HTTP_STATUS[code], envelope, requestId);
}

/** Parses and validates a JSON body. Malformed input is a 400 with field-level issues. */
export function parseBody<S extends z.ZodType>(event: HttpEvent, schema: S): z.infer<S> {
  const raw = event.body === undefined ? '' : event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    throw new HttpError('BAD_REQUEST', 'Request body is too large.');
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new HttpError('BAD_REQUEST', 'Request body must be valid JSON.');
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new HttpError(
      'BAD_REQUEST',
      'Some values are missing or not in the expected format.',
      parsed.error.issues.map((issue) => {
        const path = issue.path.map(String).join('.');
        return {
          fieldPath: FieldPathSchema.safeParse(path).success ? path : null,
          code: issue.code.toUpperCase(),
          message: issue.message.slice(0, 300),
        };
      }),
    );
  }
  return parsed.data;
}

export type RouteHandler = (event: HttpEvent) => Promise<HttpResult>;

/**
 * Dispatches by API Gateway route key and converts failures into the shared error envelope.
 * Unexpected errors are logged by name only and returned as a generic 500.
 */
export function createRouter(routes: Record<string, RouteHandler>): (event: HttpEvent) => Promise<HttpResult> {
  return async (event) => {
    const started = Date.now();
    const requestId = event.requestContext.requestId;
    let result: HttpResult;
    let errorCode: string | undefined;
    try {
      const route = routes[event.routeKey];
      if (route === undefined) throw new HttpError('NOT_FOUND', 'Route not found.');
      result = await route(event);
    } catch (error) {
      if (error instanceof HttpError) {
        errorCode = error.code;
        result = errorResult(error.code, error.message, requestId, error.issues);
      } else {
        errorCode = error instanceof Error ? error.name : 'UnknownError';
        result = errorResult('INTERNAL', 'Something went wrong on our side. Please try again.', requestId);
      }
    }
    logRequest({
      requestId,
      routeKey: event.routeKey,
      statusCode: result.statusCode,
      durationMs: Date.now() - started,
      ...(errorCode !== undefined ? { errorCode } : {}),
    });
    return result;
  };
}
