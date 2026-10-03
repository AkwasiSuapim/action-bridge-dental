// End-to-end smoke test against a running API (local server or deployed stage), in the order
// from docs/03_STACK_AWS_SETUP.md §3. Uses only the synthetic regression fixture.
//
//   API_BASE_URL=http://localhost:3000 npm run smoke -w backend
//   API_BASE_URL=https://<api-id>.execute-api.<region>.amazonaws.com/demo npm run smoke -w backend
//
// Demo auth by default. For JWT stages set SMOKE_BEARER_TOKEN (and SMOKE_OTHER_BEARER_TOKEN
// for the wrong-owner check).
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const base = process.env.API_BASE_URL?.replace(/\/+$/, '');
if (!base) {
  console.error('Set API_BASE_URL (including the stage, without /v1).');
  process.exit(2);
}

const fixture = JSON.parse(await readFile(new URL('../../docs/fixtures/dental-regression.json', import.meta.url), 'utf8'));
const body = {
  currency: fixture.currency,
  coverageMode: fixture.coverageMode,
  policy: fixture.policy,
  planYears: fixture.planYears,
  procedures: fixture.procedures,
};

const bearer = process.env.SMOKE_BEARER_TOKEN;
const identity = (who) => {
  if (who === 'none') return {};
  if (bearer) {
    const token = who === 'other' ? process.env.SMOKE_OTHER_BEARER_TOKEN : bearer;
    return token ? { authorization: `Bearer ${token}` } : null;
  }
  return { 'x-demo-user-id': who === 'other' ? otherDevice : device };
};
const device = `smoke-${randomUUID()}`;
const otherDevice = `smoke-${randomUUID()}`;

async function call(method, path, payload, who = 'self', extraHeaders = {}) {
  const started = Date.now();
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...identity(who), ...extraHeaders },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: response.status, body: json, ms: Date.now() - started, requestId: response.headers.get('x-request-id') };
}

let failures = 0;
function check(name, condition, detail) {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!condition) failures++;
}

const health = await call('GET', '/health');
check('health', health.status === 200 && health.body.status === 'ok', `engine ${health.body?.engineVersion}, ${health.ms} ms`);

const anonymous = await call('POST', '/v1/cases', body, 'none');
check('unauthenticated request rejected', anonymous.status === 401, `status ${anonymous.status}`);

const created = await call('POST', '/v1/cases', body);
check('create case', created.status === 201 && created.body.caseRevision === 1, `status ${created.status}, request ${created.requestId}`);
const caseId = created.body?.caseId;
const casePath = `/v1/cases/${caseId}`;

const read = await call('GET', casePath);
check('read case', read.status === 200 && read.body.status === 'ready', `status ${read.status}`);

if (identity('other')) {
  const foreign = await call('GET', casePath, undefined, 'other');
  check('wrong owner denied', foreign.status === 404, `status ${foreign.status}`);
} else {
  console.log('SKIP  wrong owner denied (set SMOKE_OTHER_BEARER_TOKEN)');
}

const estimate1 = await call('POST', `${casePath}/estimates`, { expectedRevision: 1 });
check('estimate = $1,200.00', estimate1.body?.totals?.patientPaysCents === 120000, `status ${estimate1.status}, ${estimate1.ms} ms`);

const scenarios = await call('POST', `${casePath}/scenarios`, { expectedRevision: 1 });
const alternative = scenarios.body?.alternatives?.[0];
check(
  'scenarios: $725.00 alternative, $475.00 difference',
  alternative?.estimate?.totals?.patientPaysCents === 72500 && alternative?.differenceFromBaselineCents === 47500,
  `status ${scenarios.status}, ${scenarios.ms} ms`,
);

const planYears = structuredClone(body.planYears);
planYears['py-2026'].insurerAlreadyPaidCents = 20000;
const patched = await call('PATCH', casePath, { expectedRevision: 1, changes: { planYears } });
check('update revision', patched.status === 200 && patched.body.caseRevision === 2, `status ${patched.status}`);

const estimate2 = await call('POST', `${casePath}/estimates`, { expectedRevision: 2 });
check('recalculated estimate = $900.00', estimate2.body?.totals?.patientPaysCents === 90000, `status ${estimate2.status}`);

const stale = await call('POST', `${casePath}/estimates`, { expectedRevision: 1 });
check('stale revision rejected', stale.status === 409 && stale.body?.error?.code === 'REVISION_CONFLICT', `status ${stale.status}`);

const saveKey = { 'idempotency-key': `smoke-${randomUUID()}` };
const saveBody = { scenarioId: 'baseline', expectedRevision: 2, consent: true };
const saved = await call('POST', `${casePath}/strategies`, saveBody, 'self', saveKey);
check('strategy saved', saved.status === 201 && saved.body?.strategy?.scenario?.estimate?.totals?.patientPaysCents === 90000, `status ${saved.status}`);
const replayed = await call('POST', `${casePath}/strategies`, saveBody, 'self', saveKey);
check(
  'repeated save is one logical save',
  replayed.status === 200 && replayed.body?.replayed === true && replayed.body?.strategy?.strategyId === saved.body?.strategy?.strategyId,
  `status ${replayed.status}`,
);

const ledger = await call('GET', `${casePath}/ledger`);
const actions = ledger.body?.events?.map((e) => e.action).join(' < ') ?? '';
check('ledger records real events', actions === 'strategy_saved < case_updated < case_created', actions || `status ${ledger.status}`);

console.log(failures === 0 ? '\nAll smoke checks passed.' : `\n${failures} smoke check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
