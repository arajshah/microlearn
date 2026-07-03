import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import {
  DEFAULT_PREFS,
  disableReminders,
  enableDailyReminder,
  formatTime,
  loadReminderPrefs,
  ReminderPrefs,
} from '@/notifications/reminders';
import { colors, font, radius, spacing } from '@/theme/theme';

const PRESETS: { label: string; hour: number; minute: number }[] = [
  { label: 'Morning', hour: 8, minute: 0 },
  { label: 'Noon', hour: 12, minute: 0 },
  { label: 'Evening', hour: 17, minute: 0 },
  { label: 'Night', hour: 21, minute: 0 },
];

export function ReminderSettings() {
  const [prefs, setPrefs] = useState<ReminderPrefs>(DEFAULT_PREFS);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadReminderPrefs().then(setPrefs);
  }, []);

  const toggle = async (value: boolean) => {
    setBusy(true);
    try {
      if (value) {
        const res = await enableDailyReminder(prefs.hour, prefs.minute);
        if (!res) {
          Alert.alert(
            'Notifications are off',
            'Enable notifications for Microlearn in your device Settings to get daily reminders.',
          );
          return;
        }
        setPrefs(res);
      } else {
        setPrefs(await disableReminders());
      }
    } finally {
      setBusy(false);
    }
  };

  const choose = async (hour: number, minute: number) => {
    setBusy(true);
    try {
      if (prefs.enabled) {
        const res = await enableDailyReminder(hour, minute);
        if (res) setPrefs(res);
      } else {
        setPrefs({ ...prefs, hour, minute });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.iconWrap}>
          <Ionicons name="notifications" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Daily reminder</Text>
          <Text style={styles.sub}>
            {prefs.enabled
              ? `On · ${formatTime(prefs.hour, prefs.minute)}`
              : 'A gentle nudge to keep your streak'}
          </Text>
        </View>
        <Switch
          value={prefs.enabled}
          onValueChange={toggle}
          disabled={busy}
          trackColor={{ true: colors.primary, false: colors.surfaceAlt }}
          thumbColor={colors.white}
        />
      </View>

      <View style={styles.presets}>
        {PRESETS.map((p) => {
          const selected = prefs.hour === p.hour && prefs.minute === p.minute;
          return (
            <Pressable
              key={p.label}
              onPress={() => choose(p.hour, p.minute)}
              style={[styles.preset, selected && styles.presetSelected]}
            >
              <Text style={[styles.presetText, selected && { color: colors.bg }]}>
                {p.label}
              </Text>
              <Text style={[styles.presetTime, selected && { color: colors.bg }]}>
                {formatTime(p.hour, p.minute)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.lg,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: colors.text, fontSize: font.size.md, fontWeight: font.weight.bold as '700' },
  sub: { color: colors.textMuted, fontSize: font.size.xs, marginTop: 2 },
  presets: { flexDirection: 'row', gap: spacing.sm },
  preset: {
    flex: 1,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingVertical: spacing.md,
    alignItems: 'center',
    gap: 2,
  },
  presetSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  presetText: { color: colors.text, fontSize: font.size.sm, fontWeight: font.weight.bold as '700' },
  presetTime: { color: colors.textMuted, fontSize: 10 },
});
