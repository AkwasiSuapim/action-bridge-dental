/**
 * Structured request log. Contains IDs, timing, status and error codes only — never request
 * bodies, plan values, documents, tokens or owner identifiers.
 */
export interface RequestLog {
  requestId: string;
  routeKey: string;
  statusCode: number;
  durationMs: number;
  errorCode?: string;
}

export function logRequest(entry: RequestLog): void {
  const level = entry.statusCode >= 500 ? 'error' : entry.statusCode >= 400 ? 'warn' : 'info';
  console.log(JSON.stringify({ level, message: 'request', ...entry }));
}

export function logEvent(level: 'info' | 'warn' | 'error', message: string, fields: Record<string, string | number | boolean> = {}): void {
  console.log(JSON.stringify({ level, message, ...fields }));
}
