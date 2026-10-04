// Live check of the demo documents: upload both PDFs, analyse once, confirm everything, print
// what the assistant asks next and what the calculator returns.
//
//   API_BASE_URL=... SMOKE_BEARER_TOKEN=... node docs/demo/check-demo-docs.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const base = process.env.API_BASE_URL?.replace(/\/+$/, '');
const token = process.env.SMOKE_BEARER_TOKEN;
if (!base || !token) {
  console.error('Set API_BASE_URL and SMOKE_BEARER_TOKEN.');
  process.exit(2);
}
const call = async (method, path, body) => {
  const r = await fetch(`${base}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const wait = async (jobId) => {
  const started = Date.now();
  for (;;) {
    const job = (await call('GET', `/v1/jobs/${jobId}`)).body;
    if (!['queued', 'running'].includes(job?.status) || Date.now() - started > 120_000) return { job, ms: Date.now() - started };
    await new Promise((r) => setTimeout(r, 1500));
  }
};

const created = (await call('POST', '/v1/cases', { currency: 'USD', coverageMode: 'unknown', policy: null, planYears: {}, procedures: [] })).body;
const ids = [];
for (const name of ['sample-treatment-estimate.pdf', 'sample-benefits-summary.pdf']) {
  const bytes = readFileSync(join(here, name));
  const slot = (await call('POST', `/v1/cases/${created.caseId}/uploads`, { kind: 'document', mimeType: 'application/pdf', sizeBytes: bytes.length })).body;
  const form = new FormData();
  for (const [k, v] of Object.entries(slot.fields)) form.append(k, v);
  form.append('file', new Blob([bytes], { type: 'application/pdf' }), name);
  const up = await fetch(slot.url, { method: 'POST', body: form });
  console.log(`upload ${name}: ${up.status}`);
  ids.push(slot.uploadId);
}

let { body: start } = await call('POST', `/v1/cases/${created.caseId}/jobs`, { expectedRevision: 1, operation: 'interpret', input: { documentIds: ids } });
let jobId = start.jobId;
for (let round = 1; round <= 6; round++) {
  const { job, ms } = await wait(jobId);
  console.log(`\n== round ${round}: ${job.status} (${ms} ms)`);
  for (const e of job.events) console.log(`   · ${e.summary}`);
  if (job.status !== 'needs_information') {
    for (const b of job.resultBlocks?.blocks ?? []) console.log(`   [${b.type}] ${b.title ?? ''} ${b.body ?? ''} ${b.items ? b.items.map((i) => i.text).join(' | ') : ''}`);
    if (job.error) console.log(`   error: ${job.error.message}`);
    break;
  }
  const answers = [];
  for (const b of job.questions.blocks) {
    if (b.type === 'notice') console.log(`   note: ${b.title} — ${b.body}`);
    if (b.type !== 'missing_field') continue;
    if (b.inputType === 'fact_review') {
      console.log(`   confirm: ${b.candidateValue}\n            ${b.reason}`);
      answers.push({ questionId: b.questionId, value: true, unknown: false, responseMode: 'tap', attachmentId: null });
    } else {
      console.log(`   ask (${b.inputType}): ${b.label} [${b.fieldPath}] options: ${b.options.map((o) => o.label).join(' / ')}`);
      // Answer as a demo presenter would: the first option ("In network", "Yes"); unknown for amounts.
      // Money: the value printed in the demo documents (deductible met $0); otherwise unknown.
      const typed = b.inputType === 'currency' && /deductibleAlreadyMet/.test(b.fieldPath) ? 0 : null;
      answers.push(b.inputType === 'single_select' ? { questionId: b.questionId, value: b.options[0].id, unknown: false, responseMode: 'tap', attachmentId: null } : typed !== null ? { questionId: b.questionId, value: typed, unknown: false, responseMode: 'type', attachmentId: null } : { questionId: b.questionId, value: null, unknown: true, responseMode: 'tap', attachmentId: null });
    }
  }
  const next = await call('POST', `/v1/jobs/${job.jobId}/answers`, { expectedRevision: job.caseRevision, answers });
  if (next.status !== 202) {
    console.log('answer failed', next.status, JSON.stringify(next.body));
    break;
  }
  jobId = next.body.jobId;
}

const record = (await call('GET', `/v1/cases/${created.caseId}`)).body;
console.log(`\ncase revision ${record.caseRevision}; plan years: ${Object.keys(record.planYears).join(', ')}; procedures: ${record.procedures.map((p) => `${p.label} ${p.proposedDate ?? '?'} window ${p.dentistEarliestDate ?? '-'}..${p.dentistLatestDate ?? '-'} cash ${p.selfPayQuote?.amountCents ?? '-'}`).join(' | ')}`);
const estimate = (await call('POST', `/v1/cases/${created.caseId}/estimates`, { expectedRevision: record.caseRevision })).body;
const scenarios = (await call('POST', `/v1/cases/${created.caseId}/scenarios`, { expectedRevision: record.caseRevision })).body;
const coverage = (await call('POST', `/v1/cases/${created.caseId}/coverage-comparison`, { expectedRevision: record.caseRevision })).body;
console.log(`estimate: ${estimate.status} ${estimate.totals ? `you pay $${estimate.totals.patientPaysCents / 100}` : JSON.stringify(estimate.missing?.map((m) => m.fieldPath))}`);
console.log(`scenarios: ${scenarios.status} ${scenarios.outcome ?? ''} alternatives: ${(scenarios.alternatives ?? []).map((a) => `$${a.estimate.totals.patientPaysCents / 100}`).join(', ')} ${JSON.stringify(scenarios.limitations?.map((l) => l.code) ?? [])}`);
console.log(`self-pay: ${coverage.selfPay?.status} ${coverage.selfPay?.totalCents ? `$${coverage.selfPay.totalCents / 100}` : ''}`);
