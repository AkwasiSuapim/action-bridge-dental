import type {
  DentalCase,
  DentalCaseInput,
  PatchCaseRequest,
  SourceFact,
} from '@actionbridge/contracts';
import { fieldLabel, inputFacts } from './case-fields';

/**
 * Turns an edited copy of the case into a PATCH: only the sections that changed, plus a
 * "provided by you" source fact for every field whose displayed value changed. The server
 * recalculates; the browser never computes amounts.
 */
export function changesFrom(
  record: DentalCase,
  draft: DentalCaseInput,
  now: Date,
  newId: () => string = () => crypto.randomUUID(),
): PatchCaseRequest['changes'] | null {
  const changes: PatchCaseRequest['changes'] = {};
  const same = (a: unknown, b: unknown) =>
    JSON.stringify(a) === JSON.stringify(b);
  if (draft.coverageMode !== record.coverageMode)
    changes.coverageMode = draft.coverageMode;
  if (!same(draft.policy, record.policy)) changes.policy = draft.policy;
  if (!same(draft.planYears, record.planYears)) {
    // An edited benefit year is now the user's own entry, not a sample or an assumption.
    const before = inputFacts(record);
    const after = inputFacts(draft);
    changes.planYears = Object.fromEntries(
      Object.entries(draft.planYears).map(([id, year]) => {
        const touched = Object.keys(after).some(
          (path) =>
            path.startsWith(`planYears.${id}.`) && before[path] !== after[path],
        );
        return [
          id,
          touched ? { ...year, sourceStatus: 'user_entered' as const } : year,
        ];
      }),
    );
  }
  if (!same(draft.procedures, record.procedures))
    changes.procedures = draft.procedures;
  if (Object.keys(changes).length === 0) return null;

  const before = inputFacts(record);
  const after = inputFacts(draft);
  const recordedAt = now.toISOString();
  const changed = Object.keys(after).filter(
    (path) => before[path] !== after[path] && after[path] !== 'Not answered',
  );
  if (changed.length > 0) {
    const facts: SourceFact[] = changed.map((path) => ({
      id: `fact-${newId()}`,
      fieldPath: path,
      value: after[path]!.slice(0, 500),
      sourceId: null,
      location: {
        page: null,
        section: fieldLabel(draft, path).slice(0, 200),
        snippet: null,
      },
      origin: 'user_entered',
      extractionStatus: 'not_applicable',
      userConfirmed: true,
      insurerVerification: { status: 'not_verified' },
      conflict: false,
      recordedAt,
    }));
    const kept = record.sourceFacts.filter(
      (f) => !changed.includes(f.fieldPath),
    );
    changes.sourceFacts = [...kept, ...facts].slice(-200);
  }
  return changes;
}
