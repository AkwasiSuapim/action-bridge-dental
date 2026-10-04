import { describe, expect, it } from 'vitest';
import { fixtureCase } from '../../lib/fixture.test-helper';
import { buildFactGroups, isSampleCase } from './facts';

describe('buildFactGroups', () => {
  const record = fixtureCase();
  const groups = buildFactGroups(record);
  const find = (key: string) => groups.flatMap((g) => g.rows).find((r) => r.key === key);

  it('labels the synthetic fixture as sample data and the next year as an assumption', () => {
    expect(isSampleCase(record)).toBe(true);
    expect(find('procedures.crown-1.providerChargeCents')).toMatchObject({ value: '$1,000.00', source: 'sample' });
    expect(find('planYears.py-2026.insurerAlreadyPaidCents')).toMatchObject({ value: '$500.00', source: 'sample' });
    expect(find('planYears.py-2027.annualMaximumCents')).toMatchObject({ source: 'assumed' });
  });

  it('orders groups treatment, coverage, then benefit years by date', () => {
    expect(groups.map((g) => g.title)).toEqual([
      'Filling one',
      'Filling two',
      'Crown',
      'Your coverage',
      'This benefit year · 2026',
      'Next benefit year · 2027',
    ]);
    expect(find('policy.rate.major')?.value).toBe('Plan pays 50% after deductible');
    expect(groups.find((g) => g.key === 'planYears.py-2027')?.summary).toMatchObject({
      value: 'Same as 2026',
      detail: '$800.00 maximum · $50.00 deductible · nothing paid yet',
      source: 'assumed',
    });
    expect(groups.find((g) => g.title === 'Crown')?.summary).toEqual({
      value: '$1,000.00 · Nov 12, 2026',
      detail: 'In network · allowed $1,000.00 · dentist allows Nov 12, 2026 – Jan 15, 2027',
      needsAnswer: false,
    });
  });

  it('shows dentist windows read-only and fixed dates as fixed', () => {
    expect(find('procedures.crown-1.window')).toMatchObject({ value: 'Nov 12, 2026 – Jan 15, 2027' });
    expect(find('procedures.crown-1.window')?.editPath).toBeUndefined();
    expect(find('procedures.filling-1.window')?.value).toBe('Fixed date: Nov 10, 2026');
  });

  it('never shows unknown as $0 and prefers recorded provenance', () => {
    const edited = fixtureCase({
      planYears: { ...record.planYears, 'py-2026': { ...record.planYears['py-2026']!, insurerAlreadyPaidCents: null } },
      procedures: record.procedures.map((p) => (p.id === 'crown-1' ? { ...p, network: 'unknown' as const, allowedCents: 90000 } : p)),
      sourceFacts: [
        {
          id: 'fact-1',
          fieldPath: 'procedures.crown-1.allowedCents',
          value: 90000,
          sourceId: null,
          location: null,
          origin: 'user_entered',
          extractionStatus: 'not_applicable',
          userConfirmed: true,
          insurerVerification: { status: 'not_verified' },
          conflict: false,
          recordedAt: '2026-10-03T16:00:00.000Z',
        },
      ],
    });
    const rows = buildFactGroups(edited).flatMap((g) => g.rows);
    expect(rows.find((r) => r.key === 'planYears.py-2026.insurerAlreadyPaidCents')).toMatchObject({ value: 'Not answered', source: 'missing' });
    expect(rows.find((r) => r.key === 'procedures.crown-1.network')).toMatchObject({ value: 'Not sure', source: 'missing' });
    expect(rows.find((r) => r.key === 'procedures.crown-1.allowedCents')).toMatchObject({ value: '$900.00', source: 'user' });
  });
});
