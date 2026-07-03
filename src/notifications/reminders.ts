import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const PREFS_KEY = 'microlearn.reminders.v1';

export interface ReminderPrefs {
  enabled: boolean;
  hour: number; // 0-23
  minute: number; // 0-59
}

export const DEFAULT_PREFS: ReminderPrefs = { enabled: false, hour: 19, minute: 0 };

const MESSAGES = [
  "Time for today's lesson — keep your streak alive!",
  'A few minutes now keeps your brain sharp. Ready?',
  'Your daily dose of smart is waiting.',
  "Don't break the chain — one quick lesson today?",
  'Curiosity called. Got 3 minutes to learn something new?',
];

// Show banners while the app is foregrounded too.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function loadReminderPrefs(): Promise<ReminderPrefs> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return DEFAULT_PREFS;
}

async function savePrefs(prefs: ReminderPrefs): Promise<void> {
  await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs)).catch(() => {});
}

export async function ensurePermissions(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('reminders', {
    name: 'Daily reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

function pickMessage(): string {
  return MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
}

/** Schedule a repeating daily reminder; returns the saved prefs. */
export async function enableDailyReminder(
  hour: number,
  minute: number,
): Promise<ReminderPrefs | null> {
  const ok = await ensurePermissions();
  if (!ok) return null;
  await ensureAndroidChannel();
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Microlearn',
      body: pickMessage(),
      ...(Platform.OS === 'android' ? { channelId: 'reminders' } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
  const prefs: ReminderPrefs = { enabled: true, hour, minute };
  await savePrefs(prefs);
  return prefs;
}

export async function disableReminders(): Promise<ReminderPrefs> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  const prefs = { ...(await loadReminderPrefs()), enabled: false };
  await savePrefs(prefs);
  return prefs;
}

export function formatTime(hour: number, minute: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour < 12 ? 'AM' : 'PM';
  return `${h12}:${String(minute).padStart(2, '0')} ${ampm}`;
}
