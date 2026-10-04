// Live document smoke test (U-06): synthetic one-page PDF estimate → presigned S3 POST →
// analyze_document job (Textract + the verified assistant) → "Is this right?" confirmations.
//
//   API_BASE_URL=... SMOKE_BEARER_TOKEN=... node backend/scripts/smoke-inputs.mjs
const base = process.env.API_BASE_URL?.replace(/\/+$/, '');
const token = process.env.SMOKE_BEARER_TOKEN;
if (!base || !token) {
  console.error('Set API_BASE_URL and SMOKE_BEARER_TOKEN.');
  process.exit(2);
}

/** A minimal, valid single-page PDF with real text (no libraries). Fictional content only. */
function samplePdf(lines) {
  return multiPagePdf([lines]);
}

/** A minimal, valid PDF with one text page per entry (no libraries). Fictional content only. */
function multiPagePdf(pages) {
  const escape = (s) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  // Objects: 1 catalog, 2 pages, 3 font, then a page object and a content stream per page.
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', null, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const kids = [];
  for (const lines of pages) {
    const content = `BT /F1 14 Tf 72 740 Td ${lines.map((l, i) => `${i ? '0 -26 Td ' : ''}(${escape(l)}) Tj`).join(' ')} ET`;
    const pageId = objects.length + 1;
    kids.push(`${pageId} 0 R`);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId + 1} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

const PDF = samplePdf([
  'SAMPLE - Fictional Dental Office - Treatment Estimate',
  'Crown (D2740) fee $1,000.00',
  'Filling (D2391) fee $250.00',
  'Office is in network for your plan.',
  'Planned date for crown: 2026-11-12',
]);

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

const created = await call('POST', '/v1/cases', { currency: 'USD', coverageMode: 'unknown', policy: null, planYears: {}, procedures: [] });
const caseId = created.body?.caseId;
check('create empty case', created.status === 201, `status ${created.status}`);

const tooBig = await call('POST', `/v1/cases/${caseId}/uploads`, { kind: 'document', mimeType: 'application/pdf', sizeBytes: 6 * 1024 * 1024 });
check('oversized upload refused before upload', tooBig.status === 400, `status ${tooBig.status}`);

const slot = await call('POST', `/v1/cases/${caseId}/uploads`, { kind: 'document', mimeType: 'application/pdf', sizeBytes: PDF.length });
check('upload slot issued', slot.status === 201 && slot.body?.url?.startsWith('https://'), `status ${slot.status}`);

const form = new FormData();
for (const [k, v] of Object.entries(slot.body.fields)) form.append(k, v);
form.append('file', new Blob([PDF], { type: 'application/pdf' }), 'estimate.pdf');
const put = await fetch(slot.body.url, { method: 'POST', body: form });
check('PDF uploaded to private S3 slot', put.status >= 200 && put.status < 300, `status ${put.status}`);

const wrongType = new FormData();
for (const [k, v] of Object.entries(slot.body.fields)) wrongType.append(k, k === 'Content-Type' ? 'text/html' : v);
wrongType.append('file', new Blob(['<html>'], { type: 'text/html' }), 'x.html');
const refused = await fetch(slot.body.url, { method: 'POST', body: wrongType });
check('S3 refuses a different content type on the same slot', refused.status === 403, `status ${refused.status}`);

const job = await call('POST', `/v1/cases/${caseId}/jobs`, { expectedRevision: 1, operation: 'analyze_document', input: { documentId: slot.body.uploadId } });
check('start analyze_document job', job.status === 202, `status ${job.status}`);

const started = Date.now();
let view;
for (;;) {
  view = (await call('GET', `/v1/jobs/${job.body.jobId}`)).body;
  if (!['queued', 'running'].includes(view?.status) || Date.now() - started > 90_000) break;
  await new Promise((r) => setTimeout(r, 1500));
}
const confirmations = view?.questions?.blocks?.filter((b) => b.inputType === 'fact_review') ?? [];
check('document read and facts proposed for confirmation', view?.status === 'needs_information' && confirmations.length > 0, `${view?.status}, ${confirmations.length} confirmations, ${Date.now() - started} ms`);
for (const e of view?.events ?? []) console.log(`      event ${e.sequence}: ${e.stage} ${e.status} — ${e.summary}`);
for (const b of confirmations) console.log(`      confirm: ${b.candidateValue}\n               ${b.reason}`);
if (view?.status === 'failed') console.log(`      error: ${view.error?.message}`);

// Composer: the user's words plus two pages, analysed once (interpret with documentIds).
const PLAN_PDF = samplePdf([
  'SAMPLE - Fictional Dental Plan - Benefits Summary',
  'Major services covered at 50%',
  'Annual maximum $1,500.00',
]);
async function uploadPdf(targetCaseId, bytes, name) {
  const s = await call('POST', `/v1/cases/${targetCaseId}/uploads`, { kind: 'document', mimeType: 'application/pdf', sizeBytes: bytes.length });
  if (s.status !== 201) return null;
  const f = new FormData();
  for (const [k, v] of Object.entries(s.body.fields)) f.append(k, v);
  f.append('file', new Blob([bytes], { type: 'application/pdf' }), name);
  const r = await fetch(s.body.url, { method: 'POST', body: f });
  return r.status >= 200 && r.status < 300 ? s.body.uploadId : null;
}
const composerCase = await call('POST', '/v1/cases', { currency: 'USD', coverageMode: 'unknown', policy: null, planYears: {}, procedures: [] });
const composerCaseId = composerCase.body?.caseId;
const uploadIds = [await uploadPdf(composerCaseId, PDF, 'estimate.pdf'), await uploadPdf(composerCaseId, PLAN_PDF, 'plan.pdf')].filter(Boolean);
check('composer: two PDFs uploaded as draft attachments', uploadIds.length === 2, `${uploadIds.length} uploaded`);
const composer = await call('POST', `/v1/cases/${composerCaseId}/jobs`, {
  expectedRevision: 1,
  operation: 'interpret',
  input: { text: 'I have dental insurance through work. My dentist says the crown can wait until early next year.', documentIds: uploadIds },
});
check('composer: one interpret job for text + 2 PDFs', composer.status === 202, `status ${composer.status}`);
const composerStarted = Date.now();
let composerView;
for (;;) {
  composerView = (await call('GET', `/v1/jobs/${composer.body.jobId}`)).body;
  if (!['queued', 'running'].includes(composerView?.status) || Date.now() - composerStarted > 90_000) break;
  await new Promise((r) => setTimeout(r, 1500));
}
const composerConfirms = composerView?.questions?.blocks?.filter((b) => b.inputType === 'fact_review') ?? [];
const fromWords = composerConfirms.filter((b) => b.reason.startsWith('From your description')).length;
const fromDocs = composerConfirms.filter((b) => b.reason.startsWith('From your document')).length;
check(
  'composer: confirmations cite both the words and the documents',
  composerView?.status === 'needs_information' && fromWords > 0 && fromDocs > 0,
  `${composerView?.status}, ${fromWords} from words, ${fromDocs} from documents, ${Date.now() - composerStarted} ms`,
);
for (const e of composerView?.events ?? []) console.log(`      event ${e.sequence}: ${e.stage} ${e.status} — ${e.summary}`);
for (const b of composerConfirms) console.log(`      confirm: ${b.candidateValue}\n               ${b.reason}`);
if (composerView?.status === 'failed') console.log(`      error: ${composerView.error?.message}`);

// A three-page PDF: the instant Textract API rejects it, so the worker reads it asynchronously.
const LONG_PDF = multiPagePdf([
  ['SAMPLE - Fictional Dental Office - Treatment Plan', 'Prepared for a fictional patient', 'Page 1 of 3'],
  ['Crown (D2740) fee $1,000.00', 'Office is in network for your plan.', 'Page 2 of 3'],
  ['Payment terms and office policies (fictional)', 'Page 3 of 3'],
]);
const longCase = await call('POST', '/v1/cases', { currency: 'USD', coverageMode: 'unknown', policy: null, planYears: {}, procedures: [] });
const longId = await uploadPdf(longCase.body?.caseId, LONG_PDF, 'treatment-plan.pdf');
const longJob = await call('POST', `/v1/cases/${longCase.body?.caseId}/jobs`, { expectedRevision: 1, operation: 'interpret', input: { documentIds: longId ? [longId] : [] } });
const longStarted = Date.now();
let longView;
for (;;) {
  longView = (await call('GET', `/v1/jobs/${longJob.body?.jobId}`)).body;
  if (!['queued', 'running'].includes(longView?.status) || Date.now() - longStarted > 120_000) break;
  await new Promise((r) => setTimeout(r, 1500));
}
const longConfirms = longView?.questions?.blocks?.filter((b) => b.inputType === 'fact_review') ?? [];
check(
  'multi-page PDF read (costs found on page 2)',
  longView?.status === 'needs_information' && longConfirms.some((b) => /1,000/.test(String(b.candidateValue))),
  `${longView?.status}, ${longConfirms.length} confirmations, ${Date.now() - longStarted} ms`,
);
for (const b of longConfirms) console.log(`      confirm: ${b.candidateValue}\n               ${b.reason}`);
if (longView?.status === 'failed') console.log(`      error: ${longView.error?.message}`);

console.log(failures === 0 ? '\nAll input smoke checks passed.' : `\n${failures} input smoke check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
