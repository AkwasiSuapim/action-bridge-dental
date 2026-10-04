import { describe, expect, it } from 'vitest';
import { GLOSSARY, jobSteps, termFor, type JobStageEvent } from '../src/index.js';

describe('plain-language terms', () => {
  it('explains the fields people ask about, from field paths and grouped questions', () => {
    expect(termFor('planYears.py-2026.annualMaximumCents')?.term).toBe('Annual maximum');
    expect(termFor('planYears.py-2026.insurerAlreadyPaidCents')?.term).toBe('Insurer already paid this year');
    expect(termFor('planYears.py-2026.annualDeductibleCents')?.term).toBe('Deductible');
    expect(termFor('planYears.py-2026')?.term).toBe('Benefit year');
    expect(termFor('procedures.all.network')?.term).toBe('In network');
    expect(termFor('procedures.crown-1.allowedCents')?.term).toBe('Allowed amount');
    expect(termFor('procedures.crown-1')?.term).toBe('Recommended treatment');
    expect(termFor('policy.insurerRateBpsByCategory.major')?.term).toBe('Plan pays %');
    expect(termFor('policy.annualMaximumAppliesByCategory.all')?.term).toBe('Counts toward the maximum');
    expect(termFor('coverageMode')?.term).toBe('Dental insurance');
    expect(termFor('somethingElse')).toBeNull();
  });

  it('keeps every definition to one short sentence', () => {
    for (const { definition } of Object.values(GLOSSARY)) {
      expect(definition.length).toBeLessThanOrEqual(130);
      expect(definition.split('. ').length).toBeLessThanOrEqual(2);
    }
  });
});

describe('job progress steps', () => {
  const event = (sequence: number, stage: JobStageEvent['stage'], status: JobStageEvent['status'], summary: string): JobStageEvent => ({
    jobId: 'job-1',
    caseRevision: 1,
    sequence,
    stage,
    status,
    summary,
    at: `2026-10-04T10:00:${String(sequence).padStart(2, '0')}.000Z`,
  });

  it('turns real events into a checklist with honest hints for slow steps', () => {
    const steps = jobSteps([
      event(1, 'reading_input', 'started', 'Reading document 1'),
      event(2, 'reading_input', 'completed', 'Read 42 lines of text'),
      event(3, 'reading_input', 'started', 'Understanding your document'),
      event(4, 'reading_input', 'completed', 'Found 3 groups of details'),
      event(5, 'checking_missing_facts', 'completed', 'Nothing else is needed'),
      event(6, 'preparing_explanation', 'started', 'Preparing a short explanation'),
    ]);
    expect(steps.map((s) => [s.label, s.status, s.result])).toEqual([
      ['Reading document 1', 'done', 'Read 42 lines of text'],
      ['Understanding your document', 'done', 'Found 3 groups of details'],
      ['Nothing else is needed', 'done', null],
      ['Preparing a short explanation', 'active', null],
    ]);
    expect(steps[0]?.hint).toBe('Long PDFs can take 20–30 seconds.');
    expect(steps[1]?.hint).toBe('Usually 5–10 seconds.');
  });
});
