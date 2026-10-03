import type { MissingFact } from '@actionbridge/contracts';

/**
 * Order for the adaptive loop: coverage first, then plan rules, benefit-year balances, and
 * per-procedure details. `policy` and `planYears` are answered on the coverage-rules screen.
 */
function rank(fieldPath: string): number {
  if (fieldPath === 'coverageMode') return 0;
  if (fieldPath === 'policy' || fieldPath === 'planYears') return 1;
  if (fieldPath.startsWith('policy.')) return 2;
  if (fieldPath.startsWith('planYears.')) return 3;
  if (fieldPath.startsWith('procedures.')) return 4;
  return 5;
}

export type NextStep =
  | { kind: 'question'; fact: MissingFact; remaining: number }
  | { kind: 'rules'; fact: MissingFact }
  | { kind: 'done' };

/**
 * The next thing to ask. Facts the user already answered "I don't know" to in this session are
 * skipped, so the loop always ends; they stay unknown and are shown as unanswered on review.
 */
export function nextStep(missing: MissingFact[], skipped: ReadonlySet<string>): NextStep {
  const open = missing.filter((fact) => !skipped.has(fact.fieldPath) && fact.fieldPath !== 'procedures').sort((a, b) => rank(a.fieldPath) - rank(b.fieldPath));
  const first = open[0];
  if (!first) return { kind: 'done' };
  if (first.fieldPath === 'policy' || first.fieldPath === 'planYears') return { kind: 'rules', fact: first };
  return { kind: 'question', fact: first, remaining: open.length };
}
