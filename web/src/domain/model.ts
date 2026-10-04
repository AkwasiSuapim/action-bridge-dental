import type { DentalCaseInput, Scenario } from '@actionbridge/contracts';

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
/** Plain names for the choices: "Everything as planned" or "Crown in January 2027". */
export const scenarioTitle = (
  scenario: Scenario,
  input?: DentalCaseInput | null,
) => {
  if (scenario.kind === 'baseline') return 'Everything as planned';
  const moved = scenario.schedule.filter((s) =>
    scenario.movedProcedureIds.includes(s.procedureId),
  );
  const first = moved[0];
  if (!first) return 'A different permitted schedule';
  const month = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${first.date}T12:00:00Z`));
  const names = moved.map((s) => procedureLabel(s.procedureId, input));
  return `${names.join(' and ')} in ${month}`;
};
export const procedureLabel = (id: string, input?: DentalCaseInput | null) =>
  input?.procedures.find((p) => p.id === id)?.label ??
  {
    'filling-1': 'Filling one',
    'filling-2': 'Filling two',
    'crown-1': 'Crown',
  }[id] ??
  id;
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
