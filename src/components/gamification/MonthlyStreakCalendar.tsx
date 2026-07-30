import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { dayKey } from '@/utils/date';
import { colors, font, radius, spacing } from '@/theme/theme';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

type CellKind = 'blank' | 'future' | 'past-missed' | 'past-active' | 'today-inactive' | 'today-active';

interface CalendarCell {
  kind: CellKind;
  day?: number;
  key?: string;
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function buildMonthGrid(monthDate: Date): CalendarCell[] {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const first = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0).getDate();
  const leading = first.getDay();
  const todayKey = dayKey(new Date());

  const cells: CalendarCell[] = [];

  for (let i = 0; i < leading; i++) {
    cells.push({ kind: 'blank' });
  }

  for (let day = 1; day <= lastDay; day++) {
    const key = dayKey(new Date(year, month, day));
    const isToday = key === todayKey;
    const isFuture = key > todayKey;
    cells.push({
      kind: isToday ? 'today-inactive' : isFuture ? 'future' : 'past-missed',
      day,
      key,
    });
  }

  return cells;
}

function applyActiveDays(cells: CalendarCell[], activeDays: Set<string>): CalendarCell[] {
  return cells.map((cell) => {
    if (!cell.key || cell.kind === 'blank') return cell;
    const active = activeDays.has(cell.key);
    if (cell.kind === 'today-inactive' || cell.kind === 'today-active') {
      return { ...cell, kind: active ? 'today-active' : 'today-inactive' };
    }
    if (cell.kind === 'past-missed' && active) {
      return { ...cell, kind: 'past-active' };
    }
    return cell;
  });
}

export interface MonthlyStreakCalendarProps {
  monthDate?: Date;
  activeDays: Set<string> | string[];
  challengeDone?: boolean;
  onChallengePress: () => void;
  accent?: string;
}

export function MonthlyStreakCalendar({
  monthDate = new Date(),
  activeDays,
  challengeDone = false,
  onChallengePress,
  accent = colors.today,
}: MonthlyStreakCalendarProps) {
  const activeSet = useMemo(
    () => (activeDays instanceof Set ? activeDays : new Set(activeDays)),
    [activeDays],
  );

  const cells = useMemo(() => {
    const grid = buildMonthGrid(monthDate);
    return applyActiveDays(grid, activeSet);
  }, [monthDate, activeSet]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.monthTitle}>{monthLabel(monthDate)}</Text>

      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label, i) => (
          <Text key={`${label}-${i}`} style={styles.weekday}>
            {label}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((cell, i) => {
          if (cell.kind === 'blank') {
            return <View key={`blank-${i}`} style={styles.cell} />;
          }

          const isToday = cell.kind === 'today-active' || cell.kind === 'today-inactive';
          const isActive = cell.kind === 'past-active' || cell.kind === 'today-active';

          return (
            <View key={cell.key} style={styles.cell}>
              <View
                style={[
                  styles.dayBox,
                  isActive && { backgroundColor: `${colors.streak}28`, borderColor: colors.streak },
                  isToday && styles.dayBoxToday,
                  isToday && { borderColor: accent },
                  cell.kind === 'future' && styles.dayBoxFuture,
                  cell.kind === 'past-missed' && styles.dayBoxMuted,
                ]}
              >
                <Text
                  style={[
                    styles.dayNum,
                    isActive && { color: colors.streak, fontWeight: font.weight.bold as '700' },
                    cell.kind === 'future' && styles.dayNumFuture,
                    cell.kind === 'past-missed' && styles.dayNumMuted,
                    isToday && { color: accent },
                  ]}
                >
                  {cell.day}
                </Text>
                {isActive ? (
                  <View style={[styles.activeDot, { backgroundColor: colors.streak }]} />
                ) : null}
              </View>

              {isToday ? (
                <Pressable
                  onPress={onChallengePress}
                  style={({ pressed }) => [
                    styles.challengePill,
                    challengeDone && styles.challengePillDone,
                    pressed && { opacity: 0.85 },
                  ]}
                  hitSlop={4}
                >
                  {challengeDone ? (
                    <>
                      <Ionicons name="checkmark" size={9} color={colors.success} />
                      <Text style={styles.challengeDoneText}>Done</Text>
                    </>
                  ) : (
                    <Text style={styles.challengeText}>Challenge</Text>
                  )}
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  monthTitle: {
    color: colors.text,
    fontSize: font.size.md,
    fontWeight: font.weight.bold as '700',
    textAlign: 'center',
  },
  weekdayRow: {
    flexDirection: 'row',
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    color: colors.textFaint,
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold as '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    paddingVertical: 3,
    minHeight: 52,
  },
  dayBox: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBoxToday: {
    borderWidth: 2,
    backgroundColor: colors.surface,
  },
  dayBoxFuture: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
    opacity: 0.55,
  },
  dayBoxMuted: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
    opacity: 0.75,
  },
  dayNum: {
    color: colors.textMuted,
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold as '600',
  },
  dayNumFuture: {
    color: colors.textFaint,
  },
  dayNumMuted: {
    color: colors.textFaint,
  },
  activeDot: {
    position: 'absolute',
    bottom: 3,
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  challengePill: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: `${colors.warning}22`,
    borderWidth: 1,
    borderColor: `${colors.warning}55`,
    maxWidth: '100%',
  },
  challengePillDone: {
    backgroundColor: `${colors.success}18`,
    borderColor: `${colors.success}44`,
  },
  challengeText: {
    color: colors.warning,
    fontSize: 8,
    fontWeight: font.weight.bold as '700',
  },
  challengeDoneText: {
    color: colors.success,
    fontSize: 8,
    fontWeight: font.weight.bold as '700',
  },
});
