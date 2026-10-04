import { CalendarPlus } from 'lucide-react';
import { plainDate } from '@actionbridge/contracts';
import { useState } from 'react';
import { Button } from '../../components/ui';
import { reminderDate, reminderIcs } from '../../domain/reminder';

const today = () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/**
 * "Remind me before my benefits reset": downloads a calendar event with an alert. The user's
 * calendar delivers it; nothing is sent by us, and deleting the event cancels it.
 */
export function ReminderActions({
  leftCents,
  yearEnd,
}: {
  leftCents: number;
  yearEnd: string;
}) {
  const [added, setAdded] = useState(false);
  if (leftCents <= 0) return null;
  const on = reminderDate(yearEnd, today());
  return (
    <div className="reminder-actions">
      <Button
        variant="secondary"
        icon={CalendarPlus}
        onClick={() => {
          const ics = reminderIcs({
            leftCents,
            yearEnd,
            today: today(),
            uid: crypto.randomUUID(),
          });
          const url = URL.createObjectURL(
            new Blob([ics], { type: 'text/calendar' }),
          );
          const link = document.createElement('a');
          link.href = url;
          link.download = 'dental-benefits-reminder.ics';
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          setAdded(true);
        }}
      >
        Remind me before they reset
      </Button>
      <span className="small muted" role={added ? 'status' : undefined}>
        {added
          ? `Open the downloaded file to add it. Your calendar will alert you on ${plainDate(on)}; delete the event to cancel.`
          : `Adds a calendar alert for ${plainDate(on)}.`}
      </span>
    </div>
  );
}
