import type { DentalCase, SourceFact } from '@actionbridge/contracts';

/**
 * Where a displayed value came from, read from the server's source facts. Origin is separate from
 * insurer verification: nothing here is ever "verified".
 */
export type SourceKind =
  | 'sample'
  | 'user'
  | 'document'
  | 'description'
  | 'voice'
  | 'proposed'
  | 'assumed'
  | 'missing';

export const SOURCE_LABEL: Record<SourceKind, string> = {
  sample: 'Sample data',
  user: 'Provided by you',
  document: 'From your document',
  description: 'From your words',
  voice: 'From your voice note',
  proposed: 'Suggested · Not confirmed',
  assumed: 'Assumed for comparison',
  missing: 'Needs an answer',
};

export const SOURCE_TONE: Record<
  SourceKind,
  'green' | 'warning' | 'assumed' | 'neutral'
> = {
  sample: 'neutral',
  user: 'green',
  document: 'green',
  description: 'green',
  voice: 'green',
  proposed: 'warning',
  assumed: 'assumed',
  missing: 'warning',
};

/** True when the case carries the labeled synthetic fixture rather than the user's own data. */
export function isSampleCase(record: DentalCase): boolean {
  return (
    Object.values(record.planYears).some(
      (y) => y.sourceStatus === 'synthetic_confirmed_input',
    ) ||
    record.procedures.some(
      (p) => p.timingSource === 'fictional_dentist_supplied',
    )
  );
}

/** The newest fact for a path, or for its parent (e.g. a procedure confirmed as a whole). */
export function latestFact(
  record: DentalCase,
  path: string,
): SourceFact | undefined {
  const parts = path.split('.');
  for (let n = parts.length; n >= 1; n--) {
    const prefix = parts.slice(0, n).join('.');
    const found = record.sourceFacts
      .filter((f) => f.fieldPath === prefix)
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0];
    if (found) return found;
  }
  return undefined;
}

export function kindOf(fact: SourceFact): SourceKind {
  switch (fact.origin) {
    case 'user_entered':
      return 'user';
    case 'document_extracted':
      return 'document';
    case 'voice_transcribed':
      return 'voice';
    case 'agent_proposed':
      if (!fact.userConfirmed) return 'proposed';
      return fact.sourceId?.startsWith('upload-') ? 'document' : 'description';
    case 'assumption':
      return 'assumed';
    case 'synthetic':
      return 'sample';
  }
}

/** The source for one field shown on screen, with the quote it came from when there is one. */
export function sourceFor(
  record: DentalCase,
  path: string,
  value: unknown,
): { kind: SourceKind; quote: string | null } {
  if (value === null || value === undefined || value === 'unknown')
    return { kind: 'missing', quote: null };
  const fact = latestFact(record, path);
  if (fact)
    return { kind: kindOf(fact), quote: fact.location?.snippet ?? null };
  if (path.startsWith('planYears.')) {
    const year = record.planYears[path.split('.')[1] ?? ''];
    if (year?.sourceStatus === 'explicit_unchanged_plan_assumption')
      return { kind: 'assumed', quote: null };
    if (year?.sourceStatus === 'synthetic_confirmed_input')
      return { kind: 'sample', quote: null };
  }
  return { kind: isSampleCase(record) ? 'sample' : 'user', quote: null };
}

/** Facts grouped for the Sources drawer: quotes from documents and words first. */
export function evidenceGroups(record: DentalCase) {
  const latest = new Map<string, SourceFact>();
  for (const fact of [...record.sourceFacts].sort((a, b) =>
    a.recordedAt.localeCompare(b.recordedAt),
  ))
    latest.set(`${fact.fieldPath}|${fact.location?.snippet ?? ''}`, fact);
  const facts = [...latest.values()];
  const quoted = new Map<
    string,
    { kind: SourceKind; quote: string; paths: string[] }
  >();
  for (const fact of facts) {
    const quote = fact.location?.snippet;
    if (!quote) continue;
    const key = `${kindOf(fact)}|${quote}`;
    const entry = quoted.get(key) ?? { kind: kindOf(fact), quote, paths: [] };
    entry.paths.push(fact.fieldPath);
    quoted.set(key, entry);
  }
  return {
    quoted: [...quoted.values()],
    entered: facts.filter((f) => f.origin === 'user_entered'),
    assumptions: facts.filter((f) => f.origin === 'assumption'),
  };
}
