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
};
export type SavedPlan = {
  scenario: Scenario;
  input: DentalCaseInput;
  savedAt: string;
};
export type DemoState = {
  session: Session | null;
  input: DentalCaseInput | null;
  transcript: string;
  attachments: Attachment[];
  confirmed: boolean;
  comparedRevision: number | null;
  selectedId: string;
  saved: SavedPlan | null;
  events: ActivityEvent[];
  quote: { cents: number; source: 'sample' | 'user' } | null;
  reminder: string | null;
};
export const initialState = (): DemoState => ({
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
export const scenarioTitle = (scenario: Scenario) =>
  scenario.kind === 'baseline'
    ? 'All treatment this year'
    : 'Split across benefit years';
export const procedureLabel = (id: string) =>
  ({
    'filling-1': 'Filling one',
    'filling-2': 'Filling two',
    'crown-1': 'Crown',
  })[id] ?? id;
export const sampleTranscript =
  'I need two fillings and a crown. Can you help me understand what my plan covers?';
export const dentistQuestion =
  'Can you confirm whether scheduling my crown in January is within the treatment window you recommend, and whether the quoted fees would stay the same?';
export function parseMoney(value: string): number | null {
  const clean = value.trim().replace(/[$,]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const [dollars, decimals = ''] = clean.split('.');
  const cents = Number(dollars) * 100 + Number(decimals.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents <= 100000000 ? cents : null;
}
