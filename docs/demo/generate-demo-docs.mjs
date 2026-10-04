// Generates the fictional demo documents (no libraries): a dentist's treatment estimate and a
// plan benefits summary that together contain every value ActionBridge uses. Each fact sits on one
// line so the text reader returns it whole and the assistant can quote it exactly.
//
//   node docs/demo/generate-demo-docs.mjs
//
// Everything here is SAMPLE data: fictional office, plan and patient. Never use real details.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** One page: [style, text] lines, top to bottom. Styles: title, heading, text, small, gap. */
function pdf(lines) {
  const escape = (s) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const style = { title: ['F2', 17, 30], heading: ['F2', 12, 24], text: ['F1', 11, 18], line: ['F1', 9.5, 18], small: ['F1', 9, 15], gap: ['F1', 11, 10] };
  let y = 750;
  const ops = [];
  for (const [kind, text] of lines) {
    const [font, size, lead] = style[kind];
    y -= lead;
    if (kind !== 'gap') ops.push(`BT /${font} ${size} Tf 56 ${y} Td (${escape(text)}) Tj ET`);
    if (kind === 'heading') ops.push(`56 ${y - 6} m 556 ${y - 6} l 0.8 G S`);
  }
  const content = ops.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out);
}

const estimate = pdf([
  ['small', 'SAMPLE DOCUMENT - FICTIONAL OFFICE AND PATIENT - FOR DEMONSTRATION ONLY'],
  ['title', 'Bright Harbor Dental (fictional) - Treatment Estimate'],
  ['text', 'Estimate date: 2026-10-01    Patient: SAMPLE PATIENT    Estimate number: DEMO-1042'],
  ['text', 'Bright Harbor Dental is in network with Harbor Mutual Dental PPO.'],
  ['gap', ''],
  ['heading', 'Recommended treatment'],
  ['line', 'Filling, tooth 14 (D2391): fee $250.00, allowed $250.00, write-off $0.00, cash price $200.00, planned 2026-11-10'],
  ['line', 'Filling, tooth 15 (D2391): fee $250.00, allowed $250.00, write-off $0.00, cash price $200.00, planned 2026-11-11'],
  ['line', 'Crown, tooth 30 (D2740): fee $1,000.00, allowed $1,000.00, write-off $0.00, cash price $900.00, planned 2026-11-12'],
  ['text', 'Total quoted treatment: $1,500.00'],
  ['gap', ''],
  ['heading', 'Timing from your dentist'],
  ['text', 'The fillings should be done in November 2026 as planned.'],
  ['text', 'Crown, tooth 30 (D2740) timing: your dentist says it can safely be done any time from 2026-11-12 to 2027-01-15.'],
  ['gap', ''],
  ['small', 'Cash price: what you pay without insurance, for the same service.'],
  ['gap', ''],
  ['small', 'This estimate is not a guarantee of payment. Your insurer decides final benefits.'],
  ['small', 'SAMPLE DOCUMENT - no real person, office or plan.'],
]);

const benefits = pdf([
  ['small', 'SAMPLE DOCUMENT - FICTIONAL PLAN AND MEMBER - FOR DEMONSTRATION ONLY'],
  ['title', 'Harbor Mutual Dental PPO (fictional) - Summary of Benefits'],
  ['text', 'Member: SAMPLE MEMBER    Plan: Individual PPO    Statement date: 2026-10-01'],
  ['gap', ''],
  ['heading', 'Your benefit year'],
  ['text', 'Benefit year: 2026-01-01 to 2026-12-31. Annual maximum: $800.00. Annual deductible: $50.00.'],
  ['text', 'Used so far this benefit year: insurer already paid $500.00. Deductible met so far: $0.00.'],
  ['text', 'Next benefit year: 2027-01-01 to 2027-12-31, with the same annual maximum and deductible.'],
  ['gap', ''],
  ['heading', 'What the plan pays (in network)'],
  ['text', 'Preventive services such as cleanings: plan pays 100%, deductible does not apply.'],
  ['text', 'Basic services such as fillings: plan pays 80% after the deductible.'],
  ['text', 'Major services such as crowns: plan pays 50% after the deductible.'],
  ['text', 'The annual maximum applies to basic and major services.'],
  ['gap', ''],
  ['small', 'This summary is not a contract. Benefits are subject to plan terms.'],
  ['small', 'SAMPLE DOCUMENT - no real person, office or plan.'],
]);

writeFileSync(join(here, 'sample-treatment-estimate.pdf'), estimate);
writeFileSync(join(here, 'sample-benefits-summary.pdf'), benefits);
console.log('Wrote docs/demo/sample-treatment-estimate.pdf and docs/demo/sample-benefits-summary.pdf');
