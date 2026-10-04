import type { DentalCaseInput, Scenario } from '@actionbridge/contracts';

export type Session = { name: string; email: string };
export type Attachment = {
  name: string;
  kind: 'sample' | 'file' | 'photo';
  preview?: string;
};
export type ActivityEvent = {
  id: string;
  title: string;
  detail: string;
  timestamp: string;
  caseId?: string;
  routine?: boolean;
};
export type Provenance = Record<
  string,
  { label: string; value: string; recordedAt: string }
>;
export type SavedPlan = {
  scenario: Scenario;
  input: DentalCaseInput;
  savedAt: string;
  provenance?: Provenance;
};
export type CaseSnapshot = Pick<
  DemoState,
  | 'caseId'
  | 'input'
  | 'confirmed'
  | 'comparedRevision'
  | 'selectedId'
  | 'saved'
  | 'quote'
  | 'reminder'
  | 'provenance'
  | 'origin'
  | 'documentNeeded'
  | 'documentDeclined'
  | 'deductibleConflict'
> & { updatedAt: string };
export type DemoState = {
  caseId: string | null;
  origin: 'sample' | 'manual';
  provenance: Provenance;
  cases: CaseSnapshot[];
  documentNeeded: boolean;
  documentDeclined: boolean;
  deductibleConflict: boolean;
  session: Session | null;
  input: DentalCaseInput | null;
  transcript: string;
  attachments: Attachment[];
  confirmed: boolean;
  comparedRevision: number | null;
  selectedId: string;
  saved: SavedPlan | null;
  events: ActivityEvent[];
  quote: {
    cents: number;
    source: 'sample' | 'user';
    perProcedure?: Record<string, number>;
    scopeConfirmed?: boolean;
  } | null;
  reminder: string | null;
};
export const initialState = (): DemoState => ({
  caseId: null,
  origin: 'sample',
  provenance: {},
  cases: [],
  documentNeeded: false,
  documentDeclined: false,
  deductibleConflict: false,
  session: null,
  input: null,
  transcript: '',
  attachments: [],
  confirmed: false,
  comparedRevision: null,
  selectedId: 'baseline',
  saved: null,
  events: [],
  quote: null,
  reminder: null,
});
export const money = (cents: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
export const dateLabel = (date: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
export const scenarioTitle = (scenario: Scenario) => {
  const split =
    new Set(scenario.estimate.lines.map((l) => l.planYearId)).size > 1;
  const sample = scenario.schedule.some((s) => s.procedureId === 'crown-1');
  return scenario.kind === 'baseline'
    ? sample && !split
      ? 'All treatment this year'
      : 'Original treatment schedule'
    : split
      ? 'Split across benefit years'
      : 'Alternative treatment schedule';
};
export const procedureLabel = (id: string, input?: DentalCaseInput | null) =>
  input?.procedures.find((p) => p.id === id)?.label ??
  {
    'filling-1': 'Filling one',
    'filling-2': 'Filling two',
    'crown-1': 'Crown',
  }[id] ??
  id;
export const sampleTranscript =
  'I need two fillings and a crown. Can you help me understand what my plan covers?';
export function dentistQuestion(
  input: DentalCaseInput,
  scenario: Scenario,
): string {
  const moved = scenario.schedule.filter(
    (s) =>
      s.date !==
      (input.procedures.find((p) => p.id === s.procedureId)?.proposedDate ??
        input.procedures.find((p) => p.id === s.procedureId)
          ?.dentistEarliestDate),
  );
  if (!moved.length)
    return 'Can you confirm the quoted fee and my plan’s allowed amount for each procedure, and the estimated cost for the dates we discussed?';
  return `Would scheduling ${moved.map((s) => `${input.procedures.find((p) => p.id === s.procedureId)?.label ?? 'this treatment'} on ${dateLabel(s.date)}`).join(' and ')} be appropriate within the treatment window you recommend? Would the quoted fees stay the same?`;
}
export function treatmentTitle(input: DentalCaseInput | null) {
  if (!input) return 'Your treatment';
  if (
    input.procedures
      .map((p) => p.id)
      .sort()
      .join(',') === 'crown-1,filling-1,filling-2' &&
    input.procedures.every((p) => p.label === procedureLabel(p.id))
  )
    return 'Two fillings and a crown';
  return input.procedures.map((p) => p.label).join(', ') || 'Your treatment';
}
export const amountLabel = (value: number | null | undefined) =>
  value == null ? 'Not answered' : money(value);
export const currentYear = (input: DentalCaseInput) =>
  Object.entries(input.planYears).sort((a, b) =>
    a[1].startDate.localeCompare(b[1].startDate),
  )[0];
export function parseMoney(value: string): number | null {
  const clean = value.trim().replace(/[$,]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const [dollars, decimals = ''] = clean.split('.');
  const cents = Number(dollars) * 100 + Number(decimals.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents <= 100000000 ? cents : null;
}
