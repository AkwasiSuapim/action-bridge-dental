import { describe, expect, it } from 'vitest';
import { fixtureCase } from '../../lib/fixture.test-helper';
import { buildSources } from './sources';

describe('sources', () => {
  it('marks the fixture as sample data and states the next-year assumption', () => {
    const sources = buildSources(fixtureCase());
    expect(sources.sample).toBe(true);
    expect(sources.answers).toEqual([]);
    expect(sources.assumed).toContain('2027 coverage matches 2026: same maximum, deductible and percentages, with nothing paid yet.');
  });

  it('lists values the user provided, named by procedure', () => {
    const base = fixtureCase();
    const record = {
      ...base,
      sourceFacts: [
        {
          id: 'f1',
          fieldPath: 'procedures.crown-1.allowedCents',
          value: 90000,
          sourceId: null,
          location: null,
          origin: 'user_entered' as const,
          extractionStatus: 'not_applicable' as const,
          userConfirmed: true,
          insurerVerification: { status: 'not_verified' as const },
          conflict: false,
          recordedAt: '2026-10-03T16:00:00.000Z',
        },
      ],
    };
    expect(buildSources(record).answers).toEqual([{ label: 'Crown: plan’s allowed amount', value: '$1,000.00' }]);
  });
});
