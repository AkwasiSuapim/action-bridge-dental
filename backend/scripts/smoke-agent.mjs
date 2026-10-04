// Live agent smoke test (Phase 5): plain-English description → real Bedrock extraction → confirm →
// engine follow-up. Prints real stage events and elapsed times. Synthetic description only.
//
//   API_BASE_URL=... SMOKE_BEARER_TOKEN=... node backend/scripts/smoke-agent.mjs
const base = process.env.API_BASE_URL?.replace(/\/+$/, '');
const token = process.env.SMOKE_BEARER_TOKEN;
if (!base || !token) {
  console.error('Set API_BASE_URL and SMOKE_BEARER_TOKEN.');
  process.exit(2);
}

const DESCRIPTION = `I have dental insurance. My benefit year runs 2026-01-01 to 2026-12-31. The annual maximum is $800 and insurance already paid $500 this year. My deductible is $50 and I haven't met it yet.
The plan pays 80% for basic services and the deductible applies. It pays 50% for major services and the deductible applies.
My dentist recommends two fillings at $250 each and a crown at $1,000. The office is in network.
The fillings are planned for 2026-11-10 and 2026-11-11 and the crown for 2026-11-12.`;

async function call(method, path, body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
};

async function waitForJob(jobId, timeoutMs = 90_000) {
  const started = Date.now();
  for (;;) {
    const { body } = await call('GET', `/v1/jobs/${jobId}`);
    if (body && !['queued', 'running'].includes(body.status)) return { job: body, ms: Date.now() - started };
    if (Date.now() - started > timeoutMs) return { job: body, ms: Date.now() - started };
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

const created = await call('POST', '/v1/cases', { currency: 'USD', coverageMode: 'unknown', policy: null, planYears: {}, procedures: [] });
check('create empty case', created.status === 201, `status ${created.status}`);
const caseId = created.body?.caseId;

const job = await call('POST', `/v1/cases/${caseId}/jobs`, { expectedRevision: 1, operation: 'interpret', input: { text: DESCRIPTION } });
check('start interpret job', job.status === 202, `status ${job.status}`);

const first = await waitForJob(job.body?.jobId);
const confirmations = first.job?.questions?.blocks?.filter((b) => b.inputType === 'fact_review') ?? [];
check('agent proposes facts for confirmation', first.job?.status === 'needs_information' && confirmations.length > 0, `${first.job?.status}, ${confirmations.length} confirmations, ${first.ms} ms`);
for (const event of first.job?.events ?? []) console.log(`      event ${event.sequence}: ${event.stage} ${event.status} — ${event.summary}`);
for (const block of confirmations) console.log(`      confirm: ${block.candidateValue}`);
const caseAfterJob = await call('GET', `/v1/cases/${caseId}`);
check('nothing applied before confirmation', caseAfterJob.body?.caseRevision === 1, `revision ${caseAfterJob.body?.caseRevision}`);

const answers = confirmations.map((b) => ({ questionId: b.questionId, value: true, unknown: false, responseMode: 'tap', attachmentId: null }));
const answered = await call('POST', `/v1/jobs/${first.job?.jobId}/answers`, { expectedRevision: 1, answers });
check('confirm all proposals', answered.status === 202, `status ${answered.status}`);

const second = await waitForJob(answered.body?.jobId);
const questions = second.job?.questions?.blocks?.filter((b) => b.type === 'missing_field') ?? [];
check('engine follow-up asks only what is missing', second.job?.status === 'needs_information' || second.job?.status === 'completed', `${second.job?.status}, ${questions.length} questions, ${second.ms} ms`);
for (const q of questions) console.log(`      ask: ${q.fieldPath} (${q.inputType})`);

console.log(failures === 0 ? '\nAll agent smoke checks passed.' : `\n${failures} agent smoke check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
