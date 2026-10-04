import { CalendarPlus, Download } from 'lucide-react';
import { plainDate } from '@actionbridge/contracts';
import { useState } from 'react';
import { Button } from '../../components/ui';
import {
  googleCalendarUrl,
  reminderDate,
  reminderIcs,
} from '../../domain/reminder';

const today = () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/**
 * "Remind me before my benefits reset": opens Google Calendar with the event filled in (the user
 * saves it there), or downloads a calendar file for Apple Calendar or Outlook. Their calendar
 * delivers the alert; deleting the event cancels it. Nothing is sent by ActionBridge.
 */
export function ReminderActions({
  leftCents,
  yearEnd,
}: {
  leftCents: number;
  yearEnd: string;
}) {
  const [added, setAdded] = useState<'google' | 'file' | null>(null);
  if (leftCents <= 0) return null;
  const on = reminderDate(yearEnd, today());
  const downloadFile = () => {
    const ics = reminderIcs({
      leftCents,
      yearEnd,
      today: today(),
      uid: crypto.randomUUID(),
    });
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'dental-benefits-reminder.ics';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setAdded('file');
  };
  return (
    <div className="reminder-actions">
      <a
        className="button primary"
        href={googleCalendarUrl({ leftCents, yearEnd, today: today() })}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => setAdded('google')}
      >
        <CalendarPlus size={18} aria-hidden="true" />
        Add to Google Calendar
      </a>
      <Button variant="ghost" icon={Download} onClick={downloadFile}>
        Apple or Outlook calendar
      </Button>
      <span className="small muted" role={added ? 'status' : undefined}>
        {added === 'google'
          ? `Press Save in Google Calendar. It will remind you on ${plainDate(on)}; delete the event to cancel.`
          : added === 'file'
            ? `Open the downloaded file to add it. Your calendar will alert you on ${plainDate(on)}.`
            : `A reminder on ${plainDate(on)}, before your benefits reset.`}
      </span>
    </div>
  );
}
