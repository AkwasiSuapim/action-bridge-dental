import type { DentalCase, PatchCaseRequest, SourceFact } from '@actionbridge/contracts';
import { changesForAnswer } from './questions';

export type FactValue = string | number | boolean | null;

/**
 * Builds the PATCH for one value the user entered or confirmed, and records its provenance:
 * a `user_entered` SourceFact replaces any earlier fact for the same field, and an edited plan
 * year becomes `user_entered` so it is no longer labeled as sample or assumed data.
 * Origin is not insurer verification: the fact is always `not_verified`.
 */
export function userEditChanges(
  record: DentalCase,
  fieldPath: string,
  value: FactValue,
  { now, newId }: { now: () => Date; newId: () => string },
): PatchCaseRequest['changes'] {
  const changes = changesForAnswer(record, fieldPath, value);

  const [root, id] = fieldPath.split('.');
  if (root === 'planYears' && id && changes.planYears?.[id]) {
    changes.planYears = { ...changes.planYears, [id]: { ...changes.planYears[id], sourceStatus: 'user_entered' } };
  }

  const fact: SourceFact = {
    id: `fact-${newId()}`,
    fieldPath,
    value,
    sourceId: null,
    location: null,
    origin: 'user_entered',
    extractionStatus: 'not_applicable',
    userConfirmed: true,
    insurerVerification: { status: 'not_verified' },
    conflict: false,
    recordedAt: now().toISOString(),
  };
  changes.sourceFacts = [...record.sourceFacts.filter((existing) => existing.fieldPath !== fieldPath), fact];
  return changes;
}

/** Reads the current value at a field path, in the same addressing `changesForAnswer` writes. */
export function valueAt(record: DentalCase, fieldPath: string): unknown {
  const [root, id, field] = fieldPath.split('.');
  if (fieldPath === 'coverageMode') return record.coverageMode;
  if (root === 'planYears' && id && field) return (record.planYears[id] as Record<string, unknown> | undefined)?.[field];
  if (root === 'procedures' && id && field) return (record.procedures.find((p) => p.id === id) as Record<string, unknown> | undefined)?.[field];
  if (root === 'policy' && id && field) return (record.policy?.[id as 'deductibleAppliesByCategory'] as Record<string, unknown> | undefined)?.[field];
  return undefined;
}

/**
 * Like `userEditChanges`, plus one forced consequence: when the allowed amount equals the charge,
 * there is nothing left to write off, so an unknown write-off becomes 0. Arithmetic, not a default.
 */
export function answerChanges(
  record: DentalCase,
  fieldPath: string,
  value: FactValue,
  deps: { now: () => Date; newId: () => string },
): PatchCaseRequest['changes'] {
  const changes = userEditChanges(record, fieldPath, value, deps);
  const [root, id, field] = fieldPath.split('.');
  if (root !== 'procedures' || field !== 'allowedCents' || !id) return changes;
  const procedure = record.procedures.find((p) => p.id === id);
  if (!procedure || procedure.contractualWriteoffCents !== null || value === null || value !== procedure.providerChargeCents) return changes;
  const next: DentalCase = { ...record, procedures: changes.procedures ?? record.procedures, sourceFacts: changes.sourceFacts ?? record.sourceFacts };
  return { ...changes, ...userEditChanges(next, `procedures.${id}.contractualWriteoffCents`, 0, deps) };
}
