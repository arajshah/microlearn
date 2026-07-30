import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ServerDailyActivity } from '@/services/microlearnServer';
import { colors, font, radius, spacing } from '@/theme/theme';

const LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function intensity(day: ServerDailyActivity): number {
  return (
    day.lessonsCompleted * 3 +
    day.retrievalItemsReviewed * 2 +
    day.xpEarned / 10 +
    day.roadmapProgressEvents
  );
}

function tintForIntensity(n: number): string {
  if (n <= 0) return colors.surfaceAlt;
  if (n < 3) return `${colors.primary}44`;
  if (n < 8) return `${colors.primary}88`;
  return colors.primary;
}

export function WeeklyActivityStrip({ days }: { days: ServerDailyActivity[] }) {
  const slice = days.slice(-7);
  while (slice.length < 7) {
    slice.unshift({
      day: '',
      lessonsCompleted: 0,
      retrievalItemsReviewed: 0,
      retrievalRemembered: 0,
      retrievalPartial: 0,
      retrievalForgot: 0,
      xpEarned: 0,
      activeMinutes: 0,
      roadmapProgressEvents: 0,
    });
  }

  return (
    <View style={styles.row}>
      {slice.map((day, i) => {
        const n = intensity(day);
        return (
          <View key={`${day.day}-${i}`} style={styles.cell}>
            <View style={[styles.dot, { backgroundColor: tintForIntensity(n) }]} />
            <Text style={styles.label}>{LABELS[i]}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cell: { flex: 1, alignItems: 'center', gap: spacing.xs },
  dot: {
    width: '100%',
    maxWidth: 36,
    height: 36,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  label: {
    color: colors.textMuted,
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold as '600',
  },
});
