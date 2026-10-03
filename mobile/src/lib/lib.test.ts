import { readFileSync } from 'node:fs';
import { DentalCaseSchema, PatchCaseRequestSchema, type DentalCase } from '@actionbridge/contracts';
import { describe, expect, it } from 'vitest';
import { readConfig } from './config';
import { centsToInput, formatBps, formatCents, formatDate, isIsoDate, parseDollarsToCents, parsePercentToBps } from './format';
import { changesForAnswer, questionFor } from './questions';

describe('format', () => {
  it('formats integer cents exactly', () => {
    expect(formatCents(120000)).toBe('$1,200.00');
    expect(formatCents(72500)).toBe('$725.00');
    expect(formatCents(5)).toBe('$0.05');
    expect(formatCents(-12500)).toBe('-$125.00');
    expect(formatCents(123456789)).toBe('$1,234,567.89');
  });

  it('parses dollars to exact cents and rejects anything ambiguous', () => {
    expect(parseDollarsToCents('1,200.50')).toBe(120050);
    expect(parseDollarsToCents('$1200.5')).toBe(120050);
    expect(parseDollarsToCents('0')).toBe(0);
    expect(parseDollarsToCents('0.07')).toBe(7);
    for (const bad of ['', '-5', '12.345', 'abc', '1e3', '1.2.3']) expect(parseDollarsToCents(bad)).toBeNull();
  });

  it('round-trips cents through the input text', () => {
    for (const cents of [0, 5, 120050, 80000]) expect(parseDollarsToCents(centsToInput(cents))).toBe(cents);
    expect(centsToInput(null)).toBe('');
  });

  it('parses percentages to exact basis points', () => {
    expect(parsePercentToBps('80')).toBe(8000);
    expect(parsePercentToBps('80%')).toBe(8000);
    expect(parsePercentToBps('62.5')).toBe(6250);
    expect(parsePercentToBps('100')).toBe(10000);
    expect(parsePercentToBps('0')).toBe(0);
    for (const bad of ['', '100.01', '101', '-5', '12.345', 'abc']) expect(parsePercentToBps(bad)).toBeNull();
  });

  it('formats rates and date-only values without time-zone shifts', () => {
    expect(formatBps(8000)).toBe('80%');
    expect(formatBps(6250)).toBe('62.5%');
    expect(formatDate('2027-01-01')).toBe('Jan 1, 2027');
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
  });
});

describe('config fails visibly instead of falling back to mocks', () => {
  const good = { apiBaseUrl: 'https://abc.execute-api.us-east-2.amazonaws.com/dev/', cognitoClientId: 'kcpgj90ruhsav9tin680padr4', cognitoRegion: 'us-east-2' };

  it('accepts the deployed values and strips a trailing slash', () => {
    expect(readConfig(good)).toEqual({ ok: true, config: { ...good, apiBaseUrl: 'https://abc.execute-api.us-east-2.amazonaws.com/dev' } });
  });

  it('reports each missing or malformed value', () => {
    const result = readConfig({ apiBaseUrl: 'http://localhost:3000/v1', cognitoClientId: undefined, cognitoRegion: 'ohio' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems).toHaveLength(3);
  });
});

describe('adaptive questions (typed path)', () => {
  const fixture = JSON.parse(readFileSync(new URL('../../../docs/fixtures/dental-regression.json', import.meta.url), 'utf8'));
  const record: DentalCase = DentalCaseSchema.parse({
    caseRevision: 1,
    currency: fixture.currency,
    coverageMode: fixture.coverageMode,
    policy: fixture.policy,
    planYears: fixture.planYears,
    procedures: fixture.procedures,
    caseId: 'case-1',
    ownerId: 'user:a',
    status: 'ready',
    sourceFacts: [],
    createdAt: '2026-10-03T15:00:00.000Z',
    updatedAt: '2026-10-03T15:00:00.000Z',
  });
  const fact = (fieldPath: string) => ({ fieldPath, code: 'VALUE_UNKNOWN' as const, message: 'Needed.' });

  it('maps engine-reported missing facts to the smallest suitable control, with a reason', () => {
    expect(questionFor(fact('planYears.py-2026.insurerAlreadyPaidCents'), record)).toMatchObject({ kind: 'currency', reason: expect.stringContaining('annual maximum') });
    expect(questionFor(fact('procedures.crown-1.network'), record)).toMatchObject({ kind: 'choice', label: expect.stringContaining('Crown') });
    expect(questionFor(fact('procedures.crown-1.proposedDate'), record)).toMatchObject({ kind: 'date' });
    expect(questionFor(fact('coverageMode'), record)).toMatchObject({ kind: 'choice' });
    expect(questionFor(fact('policy.deductibleAppliesByCategory.major'), record)).toMatchObject({ kind: 'choice' });
    expect(questionFor(fact('planYears'), record)).toMatchObject({ kind: 'edit_case' });
  });

  it('turns an answer into a valid patch that replaces only the affected section', () => {
    const changes = changesForAnswer(record, 'planYears.py-2026.insurerAlreadyPaidCents', 20000);
    expect(PatchCaseRequestSchema.parse({ expectedRevision: 1, changes })).toBeTruthy();
    expect(changes.planYears?.['py-2026']?.insurerAlreadyPaidCents).toBe(20000);
    expect(changes.planYears?.['py-2027']).toEqual(record.planYears['py-2027']);
    expect(changes.procedures).toBeUndefined();

    const network = changesForAnswer(record, 'procedures.crown-1.network', 'out');
    expect(network.procedures?.find((p) => p.id === 'crown-1')?.network).toBe('out');
    expect(network.procedures?.find((p) => p.id === 'filling-1')).toEqual(record.procedures[0]);

    expect(() => changesForAnswer(record, 'procedures.ghost.network', 'in')).toThrow();
  });
});
