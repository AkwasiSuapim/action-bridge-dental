import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { caseRoutes } from '../features/cases/api/case-routes.js';
import { CaseService } from '../features/cases/application/case-service.js';
import { InMemoryCaseRepository } from '../features/cases/infrastructure/in-memory-case-repository.js';
import { estimateRoutes } from '../features/estimates/estimate-routes.js';
import { healthRoutes } from '../features/health/health-routes.js';
import { scheduleRoutes } from '../features/schedules/schedule-routes.js';
import { createRouter, type HttpEvent } from '../shared/http.js';

/**
 * Local development API: the same routes as the Lambdas, backed by an in-memory store that is
 * lost on restart. Demo auth only (x-demo-user-id). Synthetic data only.
 */
const port = Number(process.env.PORT ?? 3000);
const cases = new CaseService({ repository: new InMemoryCaseRepository(), now: () => new Date(), newId: randomUUID, retentionDays: null });
const deps = { cases, authMode: 'demo' as const };
const routes = { ...healthRoutes('local'), ...caseRoutes(deps), ...estimateRoutes(deps), ...scheduleRoutes(deps) };
const router = createRouter(routes);

const templates = Object.keys(routes).map((routeKey) => {
  const [method, path] = routeKey.split(' ') as [string, string];
  const names: string[] = [];
  const pattern = path.replace(/\{(\w+)\}/g, (_, name: string) => {
    names.push(name);
    return '([^/]+)';
  });
  return { routeKey, method, regex: new RegExp(`^${pattern}$`), names };
});

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);

  let routeKey = `${req.method} ${url.pathname}`;
  const pathParameters: Record<string, string> = {};
  for (const t of templates) {
    const match = t.method === req.method ? t.regex.exec(url.pathname) : null;
    if (match) {
      routeKey = t.routeKey;
      t.names.forEach((name, i) => (pathParameters[name] = decodeURIComponent(match[i + 1] as string)));
      break;
    }
  }

  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(req.headers)) if (typeof value === 'string') headers[name] = value;

  const event: HttpEvent = {
    routeKey,
    pathParameters,
    headers,
    body: Buffer.concat(chunks).toString('utf8'),
    requestContext: { requestId: randomUUID() },
  };
  const result = await router(event);
  res.writeHead(result.statusCode, result.headers).end(result.body);
}).listen(port, () => {
  console.log(`ActionBridge Dental local API on http://localhost:${port} (in-memory, demo auth, synthetic data only)`);
});
