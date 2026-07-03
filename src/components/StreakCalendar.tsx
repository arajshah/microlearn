import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, spacing } from '@/theme/theme';
import { addDays, dayKey } from '@/utils/date';

const DAYS = 14;
const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const MILESTONES = [3, 7, 14, 30, 50, 100, 365];

function nextMilestone(streak: number): number {
  return MILESTONES.find((m) => m > streak) ?? streak + 100;
}

export function StreakCalendar({
  streak,
  longestStreak,
  streakFreezes,
  xpByDay,
}: {
  streak: number;
  longestStreak: number;
  streakFreezes: number;
  xpByDay: Record<string, number>;
}) {
  const today = new Date();
  const todayKey = dayKey(today);
  const days = Array.from({ length: DAYS }, (_, i) => {
    const d = addDays(today, -(DAYS - 1 - i));
    const key = dayKey(d);
    return {
      key,
      label: WEEKDAY[d.getDay()],
      date: d.getDate(),
      active: (xpByDay[key] ?? 0) > 0,
      isToday: key === todayKey,
    };
  });

  const target = nextMilestone(streak);
  const milestonePct = Math.min(1, streak / target);

  return (
    <View style={styles.card}>
      <View style={styles.headRow}>
        <View style={styles.flameWrap}>
          <Ionicons name="flame" size={22} color={colors.streak} />
          <Text style={styles.flameCount}>{streak}</Text>
          <Text style={styles.flameLabel}>day streak</Text>
        </View>
        <View style={styles.freezeChip}>
          <Ionicons name="snow" size={15} color={colors.primary} />
          <Text style={styles.freezeText}>{streakFreezes}</Text>
        </View>
      </View>

      <View style={styles.grid}>
        {days.map((d, i) => (
          <View key={i} style={styles.cell}>
            <Text style={styles.cellLabel}>{d.label}</Text>
            <View
              style={[
                styles.dot,
                d.active && { backgroundColor: colors.streak, borderColor: colors.streak },
                d.isToday && !d.active && { borderColor: colors.streak },
              ]}
            >
              <Text style={[styles.dotText, d.active && { color: colors.bg }]}>
                {d.date}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.milestone}>
        <View style={styles.milestoneTrack}>
          <View style={[styles.milestoneFill, { width: `${milestonePct * 100}%` }]} />
        </View>
        <Text style={styles.milestoneText}>
          {target - streak} day{target - streak > 1 ? 's' : ''} to your {target}-day
          milestone · best {longestStreak}
        </Text>
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
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  flameWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  flameCount: {
    color: colors.text,
    fontSize: font.size.xxl,
    fontWeight: font.weight.heavy as '800',
  },
  flameLabel: { color: colors.textMuted, fontSize: font.size.sm },
  freezeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  freezeText: {
    color: colors.text,
    fontSize: font.size.sm,
    fontWeight: font.weight.bold as '700',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.md },
  cell: { width: `${100 / 7}%`, alignItems: 'center', gap: 5 },
  cellLabel: { color: colors.textFaint, fontSize: 10, fontWeight: font.weight.semibold as '600' },
  dot: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.borderSoft,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotText: { color: colors.textMuted, fontSize: 11, fontWeight: font.weight.semibold as '600' },
  milestone: { gap: 6 },
  milestoneTrack: {
    height: 6,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  milestoneFill: { height: '100%', backgroundColor: colors.streak, borderRadius: radius.pill },
  milestoneText: { color: colors.textMuted, fontSize: font.size.xs },
});
