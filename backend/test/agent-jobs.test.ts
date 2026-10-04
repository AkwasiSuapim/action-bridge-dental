import { AgentJobViewSchema, type AgentJobView } from '@actionbridge/contracts';
import { describe, expect, it } from 'vitest';
import { runJob } from '../src/features/agent-jobs/application/job-runner.js';
import { groupsFromExtraction, type Extraction } from '../src/features/agent-jobs/domain/extraction.js';
import { createAgentHarness, ScriptedModel, textTurn, throttled, toolTurn } from './agent-harness.js';
import { OTHER } from './helpers.js';

const DESCRIPTION = `I have dental insurance. My benefit year runs 2026-01-01 to 2026-12-31. The annual maximum is $800 and insurance already paid $500 this year. My deductible is $50 and I haven't met it yet.
The plan pays 80% for basic services and the deductible applies. It pays 50% for major services and the deductible applies.
My dentist recommends two fillings at $250 each and a crown at $1,000. The office is in network. Billed equals allowed: allowed amount $250 per filling and $1,000 for the crown.
The fillings are planned for 2026-11-10 and 2026-11-11 and the crown for 2026-11-12.`;

const EXTRACTION: Extraction = {
  coverageMode: { value: 'insured', quote: 'I have dental insurance.' },
  benefitYear: {
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    annualMaximumCents: 80000,
    insurerAlreadyPaidCents: 50000,
    annualDeductibleCents: 5000,
    deductibleAlreadyMetCents: 0,
    quote: "The annual maximum is $800 and insurance already paid $500 this year. My deductible is $50 and I haven't met it yet.",
  },
  coverageRules: [
    { category: 'basic', insurerPaysPercent: 80, deductibleApplies: true, quote: 'The plan pays 80% for basic services and the deductible applies.' },
    { category: 'major', insurerPaysPercent: 50, deductibleApplies: true, quote: 'It pays 50% for major services and the deductible applies.' },
  ],
  procedures: [
    { label: 'Filling one', category: 'basic', providerChargeCents: 25000, allowedCents: 25000, network: 'in', proposedDate: '2026-11-10', quote: 'two fillings at $250 each' },
    { label: 'Filling two', category: 'basic', providerChargeCents: 25000, allowedCents: 25000, network: 'in', proposedDate: '2026-11-11', quote: 'two fillings at $250 each' },
    { label: 'Crown', category: 'major', providerChargeCents: 100000, allowedCents: 100000, network: 'in', proposedDate: '2026-11-12', quote: 'a crown at $1,000' },
  ],
};

const EMPTY_CASE = { currency: 'USD', coverageMode: 'unknown', policy: null, planYears: {}, procedures: [] };

async function newCase(h: ReturnType<typeof createAgentHarness>) {
  const created = await h.call('POST /v1/cases', {}, EMPTY_CASE);
  expect(created.status).toBe(201);
  return created.body.caseId as string;
}

async function getJob(h: ReturnType<typeof createAgentHarness>, jobId: string): Promise<AgentJobView> {
  const response = await h.call('GET /v1/jobs/{jobId}', { jobId });
  expect(response.status).toBe(200);
  return AgentJobViewSchema.parse(response.body);
}

describe('T5 adaptive agent loop, end to end with a scripted model', () => {
  it('description → confirmations → engine questions → calculator result, with nothing applied before confirmation', async () => {
    const model = new ScriptedModel([
      toolTurn('record_case_facts', EXTRACTION),
      toolTurn('check_missing_facts'),
      textTurn('I found your plan, your benefit year and three procedures. A few plan details are still needed.'),
      // Follow-up jobs: only the explanation step calls the model.
      textTurn('Doing everything this benefit year, you would pay an estimated $1,200.00 and your plan $300.00.'),
    ]);
    const h = createAgentHarness(model);
    const caseId = await newCase(h);

    const created = await h.call('POST /v1/cases/{caseId}/jobs', { caseId }, { expectedRevision: 1, operation: 'interpret', input: { text: DESCRIPTION } });
    expect(created.status).toBe(202);
    expect((await getJob(h, created.body.jobId)).status).toBe('queued');
    await h.drain();

    const first = await getJob(h, created.body.jobId);
    expect(first.status).toBe('needs_information');
    expect(first.events.map((e) => [e.stage, e.status])).toEqual([
      ['reading_input', 'started'],
      ['reading_input', 'completed'],
      ['checking_missing_facts', 'completed'],
      ['preparing_explanation', 'completed'],
    ]);
    expect(first.events.map((e) => e.sequence)).toEqual([1, 2, 3, 4]);
    const confirmations = first.questions!.blocks.filter((b) => b.type === 'missing_field');
    expect(confirmations).toHaveLength(6);
    expect(confirmations.every((b) => b.type === 'missing_field' && b.inputType === 'fact_review')).toBe(true);
    expect(JSON.stringify(first.questions)).toContain('Crown (major service) · charge $1,000.00');
    // The agent tools never changed stored data.
    expect((await h.call('GET /v1/cases/{caseId}', { caseId })).body.caseRevision).toBe(1);
    // The model received the real tool list and the description only as delimited data.
    expect(model.requests[0]?.tools.map((t) => t.name)).toEqual(['record_case_facts', 'check_missing_facts', 'calculate_estimate']);
    expect(JSON.stringify(model.requests[0]?.messages)).toContain('<description>');

    const confirmAll = confirmations.map((b) => ({ questionId: b.type === 'missing_field' ? b.questionId : '', value: true, unknown: false, responseMode: 'tap', attachmentId: null }));
    const answered = await h.call('POST /v1/jobs/{jobId}/answers', { jobId: first.jobId }, { expectedRevision: 1, answers: confirmAll });
    expect(answered.status).toBe(202);
    expect((await getJob(h, first.jobId)).status).toBe('completed');

    const confirmed = (await h.call('GET /v1/cases/{caseId}', { caseId })).body;
    expect(confirmed.caseRevision).toBe(2);
    expect(confirmed.procedures.map((p: { id: string; label: string }) => [p.id, p.label])).toEqual([
      ['proc-1', 'Filling one'],
      ['proc-2', 'Filling two'],
      ['proc-3', 'Crown'],
    ]);
    const extracted = confirmed.sourceFacts.find((f: { fieldPath: string }) => f.fieldPath === 'planYears.py-2026.annualMaximumCents');
    expect(extracted).toMatchObject({ origin: 'agent_proposed', userConfirmed: true, insurerVerification: { status: 'not_verified' }, location: { snippet: expect.stringContaining('$800') } });
    expect(confirmed.sourceFacts.filter((f: { origin: string }) => f.origin === 'assumption')).toHaveLength(2);

    await h.drain();
    const second = await getJob(h, answered.body.jobId);
    expect(second.status).toBe('needs_information');
    const questions = second.questions!.blocks.flatMap((b) => (b.type === 'missing_field' ? [b] : []));
    expect(questions.map((q) => [q.fieldPath, q.inputType])).toEqual([
      ['procedures.proc-1.contractualWriteoffCents', 'currency'],
      ['policy.annualMaximumAppliesByCategory.basic', 'single_select'],
      ['procedures.proc-2.contractualWriteoffCents', 'currency'],
      ['procedures.proc-3.contractualWriteoffCents', 'currency'],
      ['policy.annualMaximumAppliesByCategory.major', 'single_select'],
    ]);

    const answers = questions.map((q) => ({ questionId: q.questionId, value: q.inputType === 'currency' ? 0 : 'yes', unknown: false, responseMode: 'tap', attachmentId: null }));
    const final = await h.call('POST /v1/jobs/{jobId}/answers', { jobId: second.jobId }, { expectedRevision: 2, answers });
    expect(final.status).toBe(202);
    await h.drain();

    const third = await getJob(h, final.body.jobId);
    expect(third.status).toBe('completed');
    expect(third.resultBlocks!.blocks.map((b) => b.type)).toEqual(['cost_summary', 'cost_comparison', 'notice']);
    expect(JSON.stringify(third.resultBlocks)).toContain('AI explanation');
    const estimate = await h.call('POST /v1/cases/{caseId}/estimates', { caseId }, { expectedRevision: 3 });
    expect(estimate.body.totals.patientPaysCents).toBe(120000);
  });

  it('Q-15: a fabricated quote or an amount the quote does not state is never proposed', async () => {
    const text = 'My dentist recommends a crown. I think it costs a lot.';
    const fabricated: Extraction = {
      procedures: [
        { label: 'Crown', category: 'major', providerChargeCents: 120000, quote: 'a crown at $1,200' },
        { label: 'Crown', category: 'major', providerChargeCents: 120000, quote: 'My dentist recommends a crown.' },
      ],
    };
    const { groups, dropped } = groupsFromExtraction(fabricated, text, { caseRevision: 1, currency: 'USD', coverageMode: 'unknown', policy: null, planYears: {}, procedures: [] }, '2026-10-03');
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ kind: 'procedure', procedure: { providerChargeCents: null, network: 'unknown', timingSource: 'unknown' } });
    expect(dropped.map((d) => d.reason).sort()).toEqual(['amount_not_in_quote', 'quote_not_in_description']);
  });

  it('Q-07: a stated waiting period is recorded, and after confirmation the case is unsupported — never falsely covered', async () => {
    const { applyGroups } = await import('../src/features/agent-jobs/domain/extraction.js');
    const { estimateCase } = await import('@actionbridge/benefits-engine');
    const text = 'Crown $1,000, in network, planned 2026-11-12. My plan pays 50% for major services. There is a 12-month waiting period for crowns.';
    const extraction: Extraction = {
      coverageRules: [{ category: 'major', insurerPaysPercent: 50, deductibleApplies: true, quote: 'My plan pays 50% for major services.' }],
      planRestrictions: [{ kind: 'waiting_period', description: '12-month waiting period for crowns', quote: 'There is a 12-month waiting period for crowns.' }],
      procedures: [{ label: 'Crown', category: 'major', providerChargeCents: 100000, network: 'in', proposedDate: '2026-11-12', quote: 'Crown $1,000, in network, planned 2026-11-12.' }],
    };
    const empty = { caseRevision: 1, currency: 'USD' as const, coverageMode: 'insured' as const, policy: null, planYears: {}, procedures: [] };
    const { groups } = groupsFromExtraction(extraction, text, empty, '2026-10-03');
    expect(groups.map((g) => g.kind)).toEqual(['coverageRules', 'restrictions', 'procedure']);

    let n = 0;
    const { input, facts } = applyGroups(empty, groups, (fieldPath, value, quote, origin) => ({
      id: `f-${++n}`, fieldPath, value, sourceId: null, location: quote ? { page: null, section: null, snippet: quote } : null, origin,
      extractionStatus: 'extracted', userConfirmed: true, insurerVerification: { status: 'not_verified' }, conflict: false, recordedAt: '2026-10-03T00:00:00.000Z',
    }));
    expect(input.policy).toMatchObject({ allServicesCovered: false, waitingPeriods: [{ description: '12-month waiting period for crowns' }] });
    expect(facts.some((f) => f.fieldPath === 'policy.allServicesCovered')).toBe(false);
    expect(estimateCase(input)).toMatchObject({
      status: 'unsupported',
      limitations: expect.arrayContaining([expect.objectContaining({ code: 'WAITING_PERIOD_UNSUPPORTED' })]),
    });
  });

  it('a quote may join exact fragments with "…", but every fragment must be in the description', async () => {
    const { quoteAppears } = await import('../src/features/agent-jobs/domain/extraction.js');
    const text = 'Two fillings at $250 each. The office is in network. The dentist does not write off anything.';
    expect(quoteAppears('Two fillings at $250 each … the dentist does not write off anything', text)).toBe(true);
    expect(quoteAppears('Two fillings at $250 each ... The office is in network.', text)).toBe(true);
    expect(quoteAppears('Two fillings at $250 each … the dentist writes off $50', text)).toBe(false);
    expect(quoteAppears(' … … ', text)).toBe(false);
  });

  it('keeps verified fragments of a partly paraphrased quote, but only amounts stated in them', () => {
    const text = 'My dentist recommends a crown at $1,000. The allowed amount is $250 for each filling and $900 for the crown.';
    const empty = { caseRevision: 1, currency: 'USD' as const, coverageMode: 'unknown' as const, policy: null, planYears: {}, procedures: [] };
    const { groups, dropped } = groupsFromExtraction(
      { procedures: [{ label: 'Crown', category: 'major', providerChargeCents: 100000, allowedCents: 90000, quote: 'a crown at $1,000 … The allowed amount is $900 for the crown' }] },
      text,
      empty,
      '2026-10-03',
    );
    expect(groups[0]).toMatchObject({ quote: 'a crown at $1,000', procedure: { providerChargeCents: 100000, allowedCents: null } });
    expect(dropped).toEqual([{ group: 'procedure', field: 'Crown.allowedCents', reason: 'amount_not_in_quote' }]);
  });

  it('timing heard from the user never unlocks the optimizer; only a dentist window does', () => {
    const text = 'The crown at $1,000. The dentist said the crown can be done any time until 2027-01-15. I would rather wait until January.';
    const base = { label: 'Crown', category: 'major' as const, providerChargeCents: 100000, proposedDate: '2026-11-12', dentistEarliestDate: '2026-11-12', dentistLatestDate: '2027-01-15' };
    const empty = { caseRevision: 1, currency: 'USD' as const, coverageMode: 'unknown' as const, policy: null, planYears: {}, procedures: [] };
    const dentist = groupsFromExtraction({ procedures: [{ ...base, timingStatedBy: 'dentist', quote: 'The crown at $1,000.' }] }, text, empty, '2026-10-03');
    const user = groupsFromExtraction({ procedures: [{ ...base, timingStatedBy: 'user', quote: 'The crown at $1,000.' }] }, text, empty, '2026-10-03');
    expect(dentist.groups[0]).toMatchObject({ procedure: { timingSource: 'dentist_supplied' } });
    expect(user.groups[0]).toMatchObject({ procedure: { timingSource: 'user_reported' } });
  });

  it('when nothing in the description can be quoted, the engine asks its own questions instead', async () => {
    const model = new ScriptedModel([toolTurn('record_case_facts', { procedures: [{ label: 'Crown', category: 'major', quote: 'not in the text at all' }] }), textTurn('Done.')]);
    const h = createAgentHarness(model);
    const caseId = await newCase(h);
    const { body } = await h.call('POST /v1/cases/{caseId}/jobs', { caseId }, { expectedRevision: 1, operation: 'interpret', input: { text: 'Help me please.' } });
    await h.drain();
    const job = await getJob(h, body.jobId);
    expect(job.status).toBe('needs_information');
    expect(job.questions!.blocks[0]).toMatchObject({ type: 'notice', title: 'Nothing to confirm from your description' });
    expect(job.questions!.blocks.some((b) => b.type === 'missing_field' && b.fieldPath === 'coverageMode')).toBe(true);
  });
});

describe('T5-04 job reliability', () => {
  async function queuedJob(model: ScriptedModel) {
    const h = createAgentHarness(model);
    const caseId = await newCase(h);
    const { body } = await h.call('POST /v1/cases/{caseId}/jobs', { caseId }, { expectedRevision: 1, operation: 'interpret', input: { text: DESCRIPTION } });
    return { h, caseId, jobId: body.jobId as string };
  }

  it('a duplicate queue delivery cannot produce a second result', async () => {
    const { h, jobId } = await queuedJob(new ScriptedModel([toolTurn('record_case_facts', EXTRACTION), textTurn('Found it.')]));
    const message = h.queue.messages.shift()!;
    expect(await runJob(h.runner, message)).toBe('completed');
    const before = await getJob(h, jobId);
    expect(await runJob(h.runner, message)).toBe('skipped');
    expect(await getJob(h, jobId)).toEqual(before);
  });

  it('a job cancelled while running keeps its cancelled state', async () => {
    const model = new ScriptedModel([toolTurn('record_case_facts', EXTRACTION), textTurn('Found it.')]);
    const { h, jobId } = await queuedJob(model);
    const original = model.converse.bind(model);
    model.converse = async (request) => {
      await h.call('POST /v1/jobs/{jobId}/cancel', { jobId }, {});
      return original(request);
    };
    await h.drain();
    const job = await getJob(h, jobId);
    expect(job.status).toBe('cancelled');
    expect(job.questions).toBeNull();
  });

  it('an edit made while the job waits makes it fail clearly instead of answering for an old revision', async () => {
    const { h, caseId, jobId } = await queuedJob(new ScriptedModel([]));
    await h.call('PATCH /v1/cases/{caseId}', { caseId }, { expectedRevision: 1, changes: { coverageMode: 'insured' } });
    await h.drain();
    expect(await getJob(h, jobId)).toMatchObject({ status: 'failed', error: { code: 'REVISION_CONFLICT', retryable: false } });
  });

  it('a temporary model failure is recorded as retryable and a retry succeeds', async () => {
    const { h, jobId } = await queuedJob(new ScriptedModel([throttled(), toolTurn('record_case_facts', EXTRACTION), textTurn('Found it.')]));
    await h.drain();
    expect(await getJob(h, jobId)).toMatchObject({ status: 'failed', error: { code: 'UPSTREAM_UNAVAILABLE', retryable: true } });

    const retried = await h.call('POST /v1/jobs/{jobId}/retry', { jobId }, {});
    expect(retried).toEqual({ status: 202, body: { jobId } });
    await h.drain();
    expect(await getJob(h, jobId)).toMatchObject({ status: 'needs_information', attempt: 2 });
  });

  it('a model that keeps calling tools is stopped by the turn and tool limits', async () => {
    const loops = Array.from({ length: 20 }, (_, n) => toolTurn('check_missing_facts', {}, `loop-${n}`));
    const model = new ScriptedModel(loops);
    const { h, jobId } = await queuedJob(model);
    await h.drain();
    expect(model.requests.length).toBeLessThanOrEqual(5);
    expect((await getJob(h, jobId)).status).toMatch(/needs_information|completed/);
  });

  it('an explanation with an amount the calculator did not produce is discarded', async () => {
    const { explainComparison } = await import('../src/features/agent-jobs/application/explain.js');
    const { compareSchedules } = await import('@actionbridge/benefits-engine');
    const { readFileSync } = await import('node:fs');
    const fixture = JSON.parse(readFileSync(new URL('../../docs/fixtures/dental-regression.json', import.meta.url), 'utf8'));
    const comparison = compareSchedules({ caseRevision: 1, currency: 'USD', coverageMode: 'insured', policy: fixture.policy, planYears: fixture.planYears, procedures: fixture.procedures });
    if (comparison.status !== 'estimated') throw new Error('fixture should estimate');
    await expect(explainComparison(new ScriptedModel([textTurn('You save $999.00 by waiting.')]), comparison)).resolves.toBeNull();
    await expect(explainComparison(new ScriptedModel([textTurn('Moving the crown is estimated at $725.00, a $475.00 difference.')]), comparison)).resolves.toContain('$725.00');
  });
});

describe('answers and access', () => {
  async function waitingJob() {
    const h = createAgentHarness(new ScriptedModel([toolTurn('record_case_facts', EXTRACTION), textTurn('Found it.')]));
    const caseId = await newCase(h);
    const { body } = await h.call('POST /v1/cases/{caseId}/jobs', { caseId }, { expectedRevision: 1, operation: 'interpret', input: { text: DESCRIPTION } });
    await h.drain();
    return { h, caseId, jobId: body.jobId as string };
  }
  const answer = (questionId: string, value: unknown) => ({ questionId, value, unknown: false, responseMode: 'tap', attachmentId: null });

  it('rejects unknown questions, stale revisions and a second submission', async () => {
    const { h, jobId } = await waitingJob();
    expect((await h.call('POST /v1/jobs/{jobId}/answers', { jobId }, { expectedRevision: 1, answers: [answer('ghost', true)] })).status).toBe(400);
    expect((await h.call('POST /v1/jobs/{jobId}/answers', { jobId }, { expectedRevision: 2, answers: [answer('confirm-1', true)] })).status).toBe(409);
    expect((await h.call('POST /v1/jobs/{jobId}/answers', { jobId }, { expectedRevision: 1, answers: [answer('confirm-1', true)] })).status).toBe(202);
    expect((await h.call('POST /v1/jobs/{jobId}/answers', { jobId }, { expectedRevision: 1, answers: [answer('confirm-1', true)] })).status).toBe(409);
  });

  it('declined proposals change nothing', async () => {
    const { h, caseId, jobId } = await waitingJob();
    const declined = await h.call('POST /v1/jobs/{jobId}/answers', { jobId }, { expectedRevision: 1, answers: [answer('confirm-1', false), { ...answer('confirm-2', null), unknown: true }] });
    expect(declined.status).toBe(202);
    expect((await h.call('GET /v1/cases/{caseId}', { caseId })).body.caseRevision).toBe(1);
  });

  it('another user cannot see, answer or cancel a job', async () => {
    const { h, jobId } = await waitingJob();
    expect((await h.call('GET /v1/jobs/{jobId}', { jobId }, undefined, OTHER)).status).toBe(404);
    expect((await h.call('POST /v1/jobs/{jobId}/answers', { jobId }, { expectedRevision: 1, answers: [answer('confirm-1', true)] }, OTHER)).status).toBe(404);
    expect((await h.call('POST /v1/jobs/{jobId}/cancel', { jobId }, {}, OTHER)).status).toBe(404);
  });

  it('only the interpret operation is available', async () => {
    const h = createAgentHarness(new ScriptedModel([]));
    const caseId = await newCase(h);
    const response = await h.call('POST /v1/cases/{caseId}/jobs', { caseId }, { expectedRevision: 1, operation: 'transcribe_audio', input: {} });
    expect(response.status).toBe(400);
  });
});
