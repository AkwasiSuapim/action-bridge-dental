import { readFileSync } from 'node:fs';
import { DentalCaseInputSchema, type DentalCaseInput, type MissingFieldBlock } from '@actionbridge/contracts';
import { compareSchedules, estimateCase } from '@actionbridge/benefits-engine';
import { describe, expect, it } from 'vitest';
import { applyAnswer, missingFor, nextStepItems, planStep, skipMarker } from '../src/features/agent-jobs/domain/adaptive.js';
import { createAgentHarness, ScriptedModel } from './agent-harness.js';

function fixture(): DentalCaseInput {
  const raw = JSON.parse(readFileSync(new URL('../../docs/fixtures/dental-regression.json', import.meta.url), 'utf8'));
  return DentalCaseInputSchema.parse({
    caseRevision: 1,
    currency: raw.currency,
    coverageMode: raw.coverageMode,
    policy: raw.policy,
    planYears: raw.planYears,
    procedures: raw.procedures,
  });
}
const none = { skipped: [], expanded: [] };

describe('adaptive question planning', () => {
  it('asks the same detail for several procedures once, offering the in-network default first', () => {
    const input = fixture();
    input.procedures.forEach((p) => (p.contractualWriteoffCents = null));
    const step = planStep(missingFor(input), input, none, 1);
    expect(step.blocks).toHaveLength(1);
    expect(step.blocks[0]).toMatchObject({ fieldPath: 'procedures.all.contractualWriteoffCents', inputType: 'single_select' });
    expect(step.blocks[0]?.options.map((o) => o.id)).toEqual(['difference', 'none', 'each']);
    expect(step.message).toBe('One quick question and I can calculate your estimate.');
  });

  it('a grouped answer fills every still-missing field, and the case then estimates', () => {
    const input = fixture();
    input.procedures.forEach((p) => {
      p.network = 'unknown';
      p.contractualWriteoffCents = null;
    });
    const step = planStep(missingFor(input), input, none, 1);
    let next = input;
    for (const block of step.blocks) {
      const applied = applyAnswer(next, block, block.fieldPath.endsWith('network') ? 'in' : 'none');
      if ('error' in applied) throw new Error(applied.error);
      next = applied.input;
    }
    expect(next.procedures.every((p) => p.network === 'in' && p.contractualWriteoffCents === 0)).toBe(true);
    expect(estimateCase(next)).toMatchObject({ status: 'estimated', totals: { patientPaysCents: 120000 } });
  });

  it('asks the most decisive questions first, at most four per step', () => {
    const input = fixture();
    input.coverageMode = 'unknown';
    input.procedures = input.procedures.map((p, i) => ({ ...p, network: 'unknown', providerChargeCents: i === 0 ? null : p.providerChargeCents, proposedDate: i === 2 ? null : p.proposedDate, dentistEarliestDate: i === 2 ? null : p.dentistEarliestDate }));
    const step = planStep(missingFor(input), input, none, 1);
    expect(step.blocks.map((b) => b.fieldPath)).toEqual(['coverageMode', 'procedures.all.network', 'procedures.filling-1.providerChargeCents', 'procedures.crown-1.proposedDate']);
    expect(step.blocks.map((b) => b.questionId)).toEqual(['q-1', 'q-2', 'q-3', 'q-4']);
  });

  it('shows what a single blocking balance is worth', () => {
    const input = fixture();
    input.planYears['py-2026']!.insurerAlreadyPaidCents = null;
    const step = planStep(missingFor(input), input, none, 1);
    expect(step.blocks[0]).toMatchObject({ fieldPath: 'planYears.py-2026.insurerAlreadyPaidCents', inputType: 'currency' });
    // Paid $0: fillings $90 + $50, crown capped at the $440 left → $700.00. Paid the full $800: nothing left → $1,500.00.
    expect(step.blocks[0]?.reason).toContain('Depending on your answer, your estimate ranges from $700.00 to $1,500.00.');
  });

  it('never asks a skipped detail again; it becomes a question for the dentist or insurer', () => {
    const input = fixture();
    input.procedures.forEach((p) => (p.allowedCents = null));
    const first = planStep(missingFor(input), input, none, 1);
    const marker = skipMarker(first.blocks[0] as MissingFieldBlock);
    expect(marker).toBe('group:allowedCents');

    const second = planStep(missingFor(input), input, { skipped: [marker], expanded: [] }, 1);
    expect(second.blocks).toEqual([]);
    expect(second.skippedFacts).toHaveLength(3);
    expect(nextStepItems(second.skippedFacts, input)).toEqual([
      { audience: 'dentist', text: 'What is my plan’s allowed amount for Filling one?' },
      { audience: 'dentist', text: 'What is my plan’s allowed amount for Filling two?' },
      { audience: 'dentist', text: 'What is my plan’s allowed amount for Crown?' },
    ]);
  });

  it('"I’ll enter each" switches that group to one question per procedure', () => {
    const input = fixture();
    input.procedures.forEach((p) => (p.allowedCents = null));
    const first = planStep(missingFor(input), input, none, 1);
    const applied = applyAnswer(input, first.blocks[0] as MissingFieldBlock, 'each');
    expect(applied).toMatchObject({ expand: 'allowedCents', changed: [] });
    const second = planStep(missingFor(input), input, { skipped: [], expanded: ['allowedCents'] }, 1);
    expect(second.blocks.map((b) => [b.fieldPath, b.inputType])).toEqual([
      ['procedures.filling-1.allowedCents', 'currency'],
      ['procedures.filling-2.allowedCents', 'currency'],
      ['procedures.crown-1.allowedCents', 'currency'],
    ]);
  });

  it('rejects an option the question did not offer', () => {
    const input = fixture();
    input.procedures.forEach((p) => (p.network = 'unknown'));
    const block = planStep(missingFor(input), input, none, 1).blocks[0] as MissingFieldBlock;
    expect(applyAnswer(input, block, 'maybe')).toMatchObject({ error: expect.any(String) });
  });
});

describe('adaptive loop through the jobs API', () => {
  it('"I don’t know" ends with questions to ask instead of asking again', async () => {
    const h = createAgentHarness(new ScriptedModel([]));
    const base = fixture();
    const body = { currency: 'USD', coverageMode: 'insured', policy: base.policy, planYears: base.planYears, procedures: base.procedures.map((p) => ({ ...p, allowedCents: null })) };
    const created = await h.call('POST /v1/cases', {}, body);
    const caseId = created.body.caseId;
    const job = await h.call('POST /v1/cases/{caseId}/jobs', { caseId }, { expectedRevision: 1, operation: 'interpret', input: {} });
    await h.drain();
    const asked = (await h.call('GET /v1/jobs/{jobId}', { jobId: job.body.jobId })).body;
    const question = asked.questions.blocks.find((b: { type: string }) => b.type === 'missing_field');
    expect(question.fieldPath).toBe('procedures.all.allowedCents');

    const next = await h.call('POST /v1/jobs/{jobId}/answers', { jobId: job.body.jobId }, {
      expectedRevision: 1,
      answers: [{ questionId: question.questionId, value: null, unknown: true, responseMode: 'tap', attachmentId: null }],
    });
    expect(next.status).toBe(202);
    await h.drain();
    const done = (await h.call('GET /v1/jobs/{jobId}', { jobId: next.body.jobId })).body;
    expect(done.status).toBe('completed');
    expect(done.resultBlocks.blocks.map((b: { type: string }) => b.type)).toEqual(['notice', 'next_step']);
    expect(done.resultBlocks.blocks[1].items[0]).toMatchObject({ audience: 'dentist', text: 'What is my plan’s allowed amount for Filling one?' });
  });
});

describe('answers that would contradict the case', () => {
  it('money questions carry the largest value that fits the case', () => {
    const input = fixture();
    input.planYears['py-2026']!.deductibleAlreadyMetCents = null;
    input.planYears['py-2026']!.insurerAlreadyPaidCents = null;
    const step = planStep(missingFor(input), input, none, 1);
    const byPath = Object.fromEntries(step.blocks.map((b) => [b.fieldPath, b]));
    expect(byPath['planYears.py-2026.deductibleAlreadyMetCents']).toMatchObject({ inputType: 'currency', maximumCents: 5000 });
    expect(byPath['planYears.py-2026.insurerAlreadyPaidCents']).toMatchObject({ inputType: 'currency', maximumCents: 80000 });
  });

  it('the server refuses "deductible met $60" on a $50 deductible and keeps the case unchanged', async () => {
    const h = createAgentHarness(new ScriptedModel([]));
    const base = fixture();
    const planYears = { ...base.planYears, 'py-2026': { ...base.planYears['py-2026']!, deductibleAlreadyMetCents: null } };
    const created = await h.call('POST /v1/cases', {}, { currency: 'USD', coverageMode: 'insured', policy: base.policy, planYears, procedures: base.procedures });
    const caseId = created.body.caseId;
    const job = await h.call('POST /v1/cases/{caseId}/jobs', { caseId }, { expectedRevision: 1, operation: 'interpret', input: {} });
    await h.drain();
    const asked = (await h.call('GET /v1/jobs/{jobId}', { jobId: job.body.jobId })).body;
    const question = asked.questions.blocks.find((b: MissingFieldBlock) => b.fieldPath === 'planYears.py-2026.deductibleAlreadyMetCents');
    expect(question).toMatchObject({ maximumCents: 5000 });

    const refused = await h.call('POST /v1/jobs/{jobId}/answers', { jobId: job.body.jobId }, {
      expectedRevision: 1,
      answers: [{ questionId: question.questionId, value: 6000, unknown: false, responseMode: 'type', attachmentId: null }],
    });
    expect(refused.status).toBe(400);
    expect((await h.call('GET /v1/cases/{caseId}', { caseId })).body.caseRevision).toBe(1);

    const accepted = await h.call('POST /v1/jobs/{jobId}/answers', { jobId: job.body.jobId }, {
      expectedRevision: 1,
      answers: [{ questionId: question.questionId, value: 5000, unknown: false, responseMode: 'type', attachmentId: null }],
    });
    expect(accepted.status).toBe(202);
  });
});

describe('next benefit year (cross-year timing from the user’s own details)', () => {
  async function caseWithoutNextYear() {
    const h = createAgentHarness(new ScriptedModel([]));
    const base = fixture();
    const { 'py-2027': _next, ...planYears } = base.planYears;
    const created = await h.call('POST /v1/cases', {}, { currency: 'USD', coverageMode: 'insured', policy: base.policy, planYears, procedures: base.procedures });
    const caseId = created.body.caseId;
    const job = await h.call('POST /v1/cases/{caseId}/jobs', { caseId }, { expectedRevision: 1, operation: 'interpret', input: {} });
    await h.drain();
    const asked = (await h.call('GET /v1/jobs/{jobId}', { jobId: job.body.jobId })).body;
    return { h, caseId, asked };
  }

  it('asks once whether the plan renews the same way, and "Yes" unlocks the $725 option', async () => {
    const { h, caseId, asked } = await caseWithoutNextYear();
    const question = asked.questions.blocks.find((b: MissingFieldBlock) => b.fieldPath === 'planYears.next.sameTerms');
    expect(question.label).toBe('Will your plan renew on January 1, 2027 with the same yearly maximum ($800) and deductible ($50)?');

    const next = await h.call('POST /v1/jobs/{jobId}/answers', { jobId: asked.jobId }, {
      expectedRevision: 1,
      answers: [{ questionId: question.questionId, value: 'same', unknown: false, responseMode: 'tap', attachmentId: null }],
    });
    expect(next.status).toBe(202);
    await h.drain();
    const record = (await h.call('GET /v1/cases/{caseId}', { caseId })).body;
    expect(record.planYears['py-2027']).toMatchObject({ startDate: '2027-01-01', endDate: '2027-12-31', annualMaximumCents: 80000, sourceStatus: 'explicit_unchanged_plan_assumption' });
    const scenarios = compareSchedules(DentalCaseInputSchema.parse({ caseRevision: record.caseRevision, currency: record.currency, coverageMode: record.coverageMode, policy: record.policy, planYears: record.planYears, procedures: record.procedures }));
    if (scenarios.status !== 'estimated') throw new Error(scenarios.status);
    expect(scenarios.alternatives[0]?.estimate.totals.patientPaysCents).toBe(72500);
  });

  it('"No, it changes" is not asked again and the estimate still completes', async () => {
    const { h, asked } = await caseWithoutNextYear();
    const question = asked.questions.blocks.find((b: MissingFieldBlock) => b.fieldPath === 'planYears.next.sameTerms');
    const next = await h.call('POST /v1/jobs/{jobId}/answers', { jobId: asked.jobId }, {
      expectedRevision: 1,
      answers: [{ questionId: question.questionId, value: 'different', unknown: false, responseMode: 'tap', attachmentId: null }],
    });
    await h.drain();
    const done = (await h.call('GET /v1/jobs/{jobId}', { jobId: next.body.jobId })).body;
    expect(done.status).toBe('completed');
    expect(done.resultBlocks.blocks[0]).toMatchObject({ type: 'cost_summary' });
  });
});
