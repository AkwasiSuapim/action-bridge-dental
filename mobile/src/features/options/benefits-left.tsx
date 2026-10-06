import { plainDate, plainMoney, type DentalCase, type Scenario } from '@actionbridge/contracts';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import type * as NotificationsModule from 'expo-notifications';
import { useEffect, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { AppText, Button, Card, Notice } from '../../components/ui';
import { space } from '../../theme/tokens';

const REMINDER_ID = 'actionbridge-benefits-reminder';

/**
 * expo-notifications throws on import in Expo Go on Android (SDK 53+), which would take the whole
 * Options screen down. Load it only where it works; elsewhere the calendar link still offers a reminder.
 */
const Notifications: typeof NotificationsModule | null = (() => {
  if (Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require('expo-notifications') as typeof NotificationsModule;
    // Show reminders even while the app is open.
    module.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
    });
    return module;
  } catch {
    return null;
  }
})();

/** A Google Calendar event on the reminder day, 9:00–9:15. Opens in the browser or the Calendar app. */
function googleCalendarUrl(leftCents: number, yearEnd: string, when: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${when.getFullYear()}${pad(when.getMonth() + 1)}${pad(when.getDate())}`;
  const params = [
    ['action', 'TEMPLATE'],
    ['text', `Use your dental benefits: ${plainMoney(leftCents)} left until ${plainDate(yearEnd)}`],
    ['dates', `${day}T090000/${day}T091500`],
    ['details', `Unused benefits don't carry over after ${plainDate(yearEnd)}. Ask your dentist whether planned treatment can happen before then. (Reminder from ActionBridge Dental; estimates only.)`],
  ];
  return `https://calendar.google.com/calendar/render?${params.map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join('&')}`;
}

/** 30 days before the benefit year ends at 9:00, or tomorrow at 9:00 if that has passed. */
export function reminderMoment(yearEnd: string, now: Date): Date {
  const [y, m, d] = yearEnd.split('-').map(Number) as [number, number, number];
  const thirtyBefore = new Date(y, m - 1, d - 30, 9, 0, 0);
  if (thirtyBefore.getTime() > now.getTime()) return thirtyBefore;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0);
}

function nextDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

async function allowed(): Promise<boolean> {
  if (!Notifications) return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reminders', { name: 'Benefit reminders', importance: Notifications.AndroidImportance.HIGH });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/**
 * "You have $300 left this year": unused benefits don't carry over, so the user can opt in to a
 * phone reminder before they reset. The reminder is a real notification delivered by the phone;
 * "Send a test reminder" proves delivery, and Cancel removes it.
 */
export function BenefitsLeft({ scenario, record }: { scenario: Scenario; record: DentalCase }) {
  const [scheduledFor, setScheduledFor] = useState<Date | null>(null);
  const [message, setMessage] = useState<{ tone: 'info' | 'warning'; title: string } | null>(null);
  const year = Object.values(scenario.estimate.yearProjections)[0];
  const terms = year ? record.planYears[year.planYearId] : undefined;

  useEffect(() => {
    void Notifications?.getAllScheduledNotificationsAsync().then((all) => {
      const existing = all.find((n) => n.identifier === REMINDER_ID);
      const trigger = existing?.trigger as { value?: number; date?: number } | undefined;
      const when = trigger?.value ?? trigger?.date;
      if (existing) setScheduledFor(when ? new Date(when) : new Date());
    });
  }, []);

  if (!year || !terms) return null;
  const left = Math.max(0, year.annualMaximumCents - year.reportedInsurerPaidCents);
  const content = {
    title: `Use your dental benefits: ${plainMoney(left)} left`,
    body: `Unused benefits don't carry over after ${plainDate(terms.endDate)}. Ask your dentist whether planned treatment can happen before then.`,
    ...(Platform.OS === 'android' ? { channelId: 'reminders' } : {}),
  };

  const schedule = async () => {
    if (!Notifications || !(await allowed())) {
      setMessage({ tone: 'warning', title: 'Notifications are off for this app. Turn them on in Settings to get a reminder.' });
      return;
    }
    const when = reminderMoment(terms.endDate, new Date());
    await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => undefined);
    await Notifications.scheduleNotificationAsync({ identifier: REMINDER_ID, content, trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when } });
    setScheduledFor(when);
    setMessage({ tone: 'info', title: `Reminder set for ${when.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.` });
  };

  const test = async () => {
    if (!Notifications || !(await allowed())) {
      setMessage({ tone: 'warning', title: 'Notifications are off for this app. Turn them on in Settings to get a reminder.' });
      return;
    }
    await Notifications.scheduleNotificationAsync({ content, trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5 } });
    setMessage({ tone: 'info', title: 'A test reminder will arrive in about 5 seconds.' });
  };

  const cancel = async () => {
    await Notifications?.cancelScheduledNotificationAsync(REMINDER_ID);
    setScheduledFor(null);
    setMessage({ tone: 'info', title: 'Reminder canceled.' });
  };

  return (
    <Card>
      <AppText variant="caption" muted>
        Benefits left this year
      </AppText>
      <AppText variant="title">
        {plainMoney(left)}{' '}
        <AppText variant="body" muted>
          of {plainMoney(year.annualMaximumCents)}
        </AppText>
      </AppText>
      <AppText variant="caption" muted>
        Unused benefits don’t carry over. They reset on {plainDate(nextDay(terms.endDate))}.
      </AppText>
      {left > 0 ? (
        <View style={{ gap: space(2) }}>
          {Notifications ? (
            scheduledFor ? (
              <>
                <AppText variant="caption">
                  Reminder set for {scheduledFor.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.
                </AppText>
                <Button label="Cancel reminder" variant="ghost" onPress={() => void cancel()} />
              </>
            ) : (
              <Button label="Remind me before they reset" variant="secondary" onPress={() => void schedule()} />
            )
          ) : null}
          <Button
            label="Add to Google Calendar"
            variant={Notifications ? 'ghost' : 'secondary'}
            onPress={() => void Linking.openURL(googleCalendarUrl(left, terms.endDate, reminderMoment(terms.endDate, new Date())))}
          />
          {Notifications ? <Button label="Send a test reminder" variant="ghost" onPress={() => void test()} /> : null}
        </View>
      ) : null}
      {message ? <Notice tone={message.tone} title={message.title} /> : null}
    </Card>
  );
}
