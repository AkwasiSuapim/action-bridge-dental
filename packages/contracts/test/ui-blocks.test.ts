import {
  InsurerVerificationSchema,
  JobAnswersRequestSchema,
  ProcedureSchema,
  SourceFactSchema,
  UiBlockEnvelopeSchema,
} from '@actionbridge/contracts';
import { describe, expect, it } from 'vitest';

const moneyQuestion = {
  id: 'q-benefits-paid',
  type: 'missing_field',
  questionId: 'insurer-paid-2026',
  fieldPath: 'planYears.py-2026.insurerAlreadyPaidCents',
  inputType: 'currency',
  label: 'How much has your insurer paid this benefit year?',
  reason: 'This determines how much of your annual maximum remains.',
  options: [],
  allowedResponseModes: ['type', 'voice', 'photo'],
  required: true,
  allowUnknown: true,
  sourceRefs: [],
  expectedRevision: 3,
  currency: 'USD',
  minimumCents: 0,
  maximumCents: 80000,
};

const envelope = (...blocks: unknown[]) => ({ schemaVersion: 1, caseRevision: 3, blocks });

describe('missing_field questions (D-13, doc 05 adaptive loop)', () => {
  it('accepts a currency question with voice and photo as optional answer modes', () => {
    expect(UiBlockEnvelopeSchema.parse(envelope(moneyQuestion))).toEqual(envelope(moneyQuestion));
  });

  it('accepts a network choice with an unknown route', () => {
    const choice = {
      ...moneyQuestion,
      id: 'q-network',
      questionId: 'network-crown',
      fieldPath: 'procedures.crown-1.network',
      inputType: 'single_select',
      label: 'Is this dentist in your plan’s network?',
      reason: 'In-network dentists accept the plan’s allowed amount.',
      options: [
        { id: 'in', label: 'In network' },
        { id: 'out', label: 'Out of network' },
      ],
      allowedResponseModes: ['tap', 'voice'],
      currency: undefined,
      minimumCents: undefined,
      maximumCents: undefined,
    };
    expect(UiBlockEnvelopeSchema.safeParse(envelope(JSON.parse(JSON.stringify(choice)))).success).toBe(true);
  });

  it.each<[string, (b: Record<string, unknown>) => void]>([
    ['a currency question without bounds', (b) => delete b.maximumCents],
    ['minimum above maximum', (b) => (b.minimumCents = 90000)],
    ['options on a non-choice question', (b) => (b.options = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }])],
    ['a choice with one option', (b) => Object.assign(b, { inputType: 'single_select', options: [{ id: 'a', label: 'A' }] })],
    ['no response mode', (b) => (b.allowedResponseModes = [])],
    ['an unregistered response mode', (b) => (b.allowedResponseModes = ['telepathy'])],
    ['a missing reason', (b) => delete b.reason],
    ['an inverted date window', (b) => Object.assign(b, { inputType: 'date', currency: undefined, minimumCents: undefined, maximumCents: undefined, earliestDate: '2027-02-01', latestDate: '2027-01-01' })],
    ['a fact review without a candidate value', (b) => Object.assign(b, { inputType: 'fact_review', currency: undefined, minimumCents: undefined, maximumCents: undefined })],
    ['an injected action prop', (b) => (b.onSubmit = 'sendToDentist()')],
    ['raw HTML', (b) => (b.html = '<script>alert(1)</script>')],
    ['a field path with injection characters', (b) => (b.fieldPath = 'planYears["x"];drop')],
  ])('rejects %s', (_name, mutate) => {
    const block = structuredClone(moneyQuestion) as Record<string, unknown>;
    mutate(block);
    expect(UiBlockEnvelopeSchema.safeParse(envelope(JSON.parse(JSON.stringify(block)))).success).toBe(false);
  });
});

describe('result and review blocks', () => {
  it('accepts comparison, issue, evidence, next-step and notice blocks', () => {
    const blocks = [
      {
        id: 'cmp',
        type: 'cost_comparison',
        options: [
          { kind: 'insured', scenarioId: 'baseline', available: true },
          { kind: 'self_pay', scenarioId: null, available: false },
          { kind: 'alternative_timing', scenarioId: 'alt-1', available: true },
        ],
      },
      {
        id: 'issue-1',
        type: 'coverage_issue',
        issue: {
          id: 'paid-unknown',
          code: 'MISSING_REQUIRED_FACT',
          severity: 'blocking',
          fieldPaths: ['planYears.py-2026.insurerAlreadyPaidCents'],
          message: 'The plan summary gives the annual maximum. We still need benefits already paid this year.',
          resolution: 'answer_question',
          sourceFactIds: [],
        },
      },
      { id: 'ev', type: 'source_evidence', sourceFactIds: ['fact-1'] },
      {
        id: 'next',
        type: 'next_step',
        title: 'Questions for my dentist',
        items: [{ id: 'n1', audience: 'dentist', text: 'Can the crown be scheduled after January 1?', issueId: null }],
      },
      { id: 'n', type: 'notice', severity: 'info', title: 'Estimate only', body: 'Not a guarantee of payment.' },
    ];
    expect(UiBlockEnvelopeSchema.parse(envelope(...blocks)).blocks).toHaveLength(5);
  });

  it('rejects removed legacy block types and unknown types', () => {
    for (const type of ['money_input', 'evidence_list', 'web_view']) {
      expect(UiBlockEnvelopeSchema.safeParse(envelope({ id: 'x', type })).success).toBe(false);
    }
  });

  it('rejects an unsupported schema version and too many blocks', () => {
    expect(UiBlockEnvelopeSchema.safeParse({ ...envelope(moneyQuestion), schemaVersion: 2 }).success).toBe(false);
    const many = Array.from({ length: 11 }, (_, n) => ({ ...moneyQuestion, id: `q-${n}` }));
    expect(UiBlockEnvelopeSchema.safeParse(envelope(...many)).success).toBe(false);
  });
});

describe('U-01 evidence, verification and self-pay quotes', () => {
  it('a "verified" insurer status without a reference and time fails validation', () => {
    expect(InsurerVerificationSchema.safeParse({ status: 'verified' }).success).toBe(false);
    expect(InsurerVerificationSchema.safeParse({ status: 'verified', reference: 'PD-1', verifiedAt: '2026-10-03T15:00:00.000Z' }).success).toBe(true);
    expect(InsurerVerificationSchema.safeParse({ status: 'not_verified' }).success).toBe(true);
  });

  it('keeps origin, user confirmation and insurer verification as separate facts', () => {
    const fact = {
      id: 'fact-1',
      fieldPath: 'planYears.py-2026.annualMaximumCents',
      value: 80000,
      sourceId: 'plan-summary',
      location: { page: 2, section: 'Annual maximum', snippet: 'Annual maximum $800', transcriptSpan: null },
      documentDate: '2026-01-01',
      origin: 'document_extracted',
      extractionStatus: 'extracted',
      userConfirmed: true,
      insurerVerification: { status: 'not_verified' },
      conflict: false,
      recordedAt: '2026-10-03T15:00:00.000Z',
    };
    expect(SourceFactSchema.parse(fact)).toEqual(fact);
    expect(SourceFactSchema.safeParse({ ...fact, insurerConfirmed: true }).success).toBe(false);
  });

  it('a self-pay quote can be zero but never negative, and unknown is null', () => {
    const base = {
      id: 'crown-1',
      label: 'Crown',
      category: 'major',
      network: 'in',
      providerChargeCents: 150000,
      allowedCents: 100000,
      contractualWriteoffCents: 50000,
      proposedDate: '2026-11-12',
      dentistEarliestDate: null,
      dentistLatestDate: null,
      timingSource: 'dentist_supplied',
      prerequisiteIds: [],
    };
    const quote = (amountCents: number) => ({ amountCents, quotedOn: '2026-10-01', source: 'dentist_quote', includedScope: 'Crown' });
    expect(ProcedureSchema.safeParse({ ...base, selfPayQuote: quote(0) }).success).toBe(true);
    expect(ProcedureSchema.safeParse({ ...base, selfPayQuote: null }).success).toBe(true);
    expect(ProcedureSchema.safeParse({ ...base, selfPayQuote: quote(-1) }).success).toBe(false);
  });

  it('answers record how they were given and cannot be both unknown and valued', () => {
    const answer = { questionId: 'q1', value: 50000, unknown: false, responseMode: 'voice', attachmentId: 'audio-1' };
    expect(JobAnswersRequestSchema.safeParse({ expectedRevision: 3, answers: [answer] }).success).toBe(true);
    expect(JobAnswersRequestSchema.safeParse({ expectedRevision: 3, answers: [{ ...answer, unknown: true }] }).success).toBe(false);
  });
});
