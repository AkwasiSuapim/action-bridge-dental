import type { DentalCase } from '@actionbridge/contracts';
import { buildFactGroups, isSampleCase, orderedPlanYears } from '../case/facts';
import { planYearLabel } from '../options/options-model';

/**
 * "Where these numbers come from": what the user told us, what is sample data, and what is
 * assumed. Never an invented citation; document excerpts appear only once documents exist.
 */
export interface Sources {
  answers: { label: string; value: string }[];
  documents: { label: string; value: string }[];
  sample: boolean;
  assumed: string[];
}

export function buildSources(record: DentalCase): Sources {
  const groups = buildFactGroups(record);
  const rows = groups.flatMap((group) => group.rows.map((row) => ({ ...row, group: group.title })));
  const named = (row: (typeof rows)[number]) => (row.group.startsWith('Your coverage') || row.group.includes('benefit year') ? row.label : `${row.group}: ${row.label.toLowerCase()}`);

  const years = orderedPlanYears(record);
  const first = years[0]?.[1];
  const assumed = [
    ...rows.filter((row) => row.source === 'assumed' && row.label === 'Assumed').map((row) => `${row.value}.`),
    ...years
      .filter(([, year]) => year.sourceStatus === 'explicit_unchanged_plan_assumption')
      .map(([, year]) => `${planYearLabel(year)} coverage matches ${first ? planYearLabel(first) : 'this year'}: same maximum, deductible and percentages, with nothing paid yet.`),
    'No other dental claims use your benefits before this treatment.',
  ];

  return {
    answers: rows.filter((row) => row.source === 'user').map((row) => ({ label: named(row), value: row.value })),
    documents: rows.filter((row) => row.source === 'document').map((row) => ({ label: named(row), value: row.value })),
    sample: isSampleCase(record),
    assumed,
  };
}
