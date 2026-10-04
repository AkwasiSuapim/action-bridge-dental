import { plainDate, plainMoney } from '@actionbridge/contracts';

/**
 * A calendar reminder about unused benefits, as an .ics file the user's own calendar delivers
 * (with an alert). Opt-in and cancelable: the user adds it, and deletes the event to cancel.
 * Reminds 30 days before the benefit year ends, or tomorrow if that date has passed.
 */
export function reminderDate(yearEnd: string, today: string): string {
  const [y, m, d] = yearEnd.split('-').map(Number) as [number, number, number];
  const thirtyBefore = new Date(Date.UTC(y, m - 1, d - 30))
    .toISOString()
    .slice(0, 10);
  if (thirtyBefore > today) return thirtyBefore;
  const [ty, tm, td] = today.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(ty, tm - 1, td + 1)).toISOString().slice(0, 10);
}

export function reminderIcs({
  leftCents,
  yearEnd,
  today,
  uid,
}: {
  leftCents: number;
  yearEnd: string;
  today: string;
  uid: string;
}): string {
  const on = reminderDate(yearEnd, today).replace(/-/g, '');
  const summary = `Use your dental benefits: ${plainMoney(leftCents)} left until ${plainDate(yearEnd)}`;
  const description = `Your dental plan has about ${plainMoney(leftCents)} of its yearly maximum left. Unused benefits don't carry over after ${plainDate(yearEnd)}. Ask your dentist whether planned treatment can be scheduled before then. (Reminder from ActionBridge Dental; estimates only.)`;
  const escape = (s: string) => s.replace(/[\\,;]/g, (c) => `\\${c}`);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ActionBridge Dental//Benefit reminder//EN',
    'BEGIN:VEVENT',
    `UID:${uid}@actionbridge-dental`,
    `DTSTAMP:${today.replace(/-/g, '')}T000000Z`,
    `DTSTART:${on}T090000`,
    `DTEND:${on}T091500`,
    `SUMMARY:${escape(summary)}`,
    `DESCRIPTION:${escape(description)}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escape(summary)}`,
    'TRIGGER:-PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}
