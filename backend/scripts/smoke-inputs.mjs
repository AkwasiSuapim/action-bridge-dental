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
  const escape = (s) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const content = `BT /F1 14 Tf 72 740 Td ${lines.map((l, i) => `${i ? '0 -26 Td ' : ''}(${escape(l)}) Tj`).join(' ')} ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
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

console.log(failures === 0 ? '\nAll input smoke checks passed.' : `\n${failures} input smoke check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
