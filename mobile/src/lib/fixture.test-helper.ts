import { readFileSync } from 'node:fs';
import { DentalCaseSchema, type DentalCase } from '@actionbridge/contracts';

/** The shared regression fixture as a stored case (test-only helper; uses node:fs). */
export function fixtureCase(overrides: Partial<DentalCase> = {}): DentalCase {
  const fixture = JSON.parse(readFileSync(new URL('../../../docs/fixtures/dental-regression.json', import.meta.url), 'utf8'));
  return DentalCaseSchema.parse({
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
    ...overrides,
  });
}
