import { compareSchedules } from '@actionbridge/benefits-engine';
import { describe, expect, it } from 'vitest';
import { fixtureCase } from '../../lib/fixture.test-helper';
import { nextStepFor } from './saved-model';

describe('next step after saving', () => {
  const record = fixtureCase();
  const comparison = compareSchedules({ caseRevision: 1, currency: 'USD', coverageMode: record.coverageMode, policy: record.policy, planYears: record.planYears, procedures: record.procedures });
  if (comparison.status !== 'estimated') throw new Error('expected estimated');

  it('asks the dentist to confirm a moved date, otherwise the fees', () => {
    expect(nextStepFor(record, comparison.alternatives[0]!)).toEqual({
      title: 'Confirm the timing with your dentist',
      question: 'Can my crown be done on Jan 1, 2027 instead? Is that timing right for me?',
    });
    expect(nextStepFor(record, comparison.baseline).title).toBe('Confirm your costs with your dentist');
  });
});
