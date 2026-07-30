import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { dayKey } from '@/utils/date';
import { colors, font, radius, spacing } from '@/theme/theme';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

type CalendarCell =
  | { type: 'blank'; id: string }
  | { type: 'day'; key: string; day: number; isToday: boolean; isPast: boolean };

function monthLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function buildMonthCells(monthDate: Date): CalendarCell[] {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0).getDate();
  const today = dayKey();
  const cells: CalendarCell[] = [];

  for (let i = 0; i < firstDay.getDay(); i++) {
    cells.push({ type: 'blank', id: `blank-${i}` });
  }

  for (let day = 1; day <= lastDay; day++) {
    const key = dayKey(new Date(year, month, day));
    cells.push({
      type: 'day',
      key,
      day,
      isToday: key === today,
      isPast: key < today,
    });
  }

  return cells;
}

export type MonthlyReviewCalendarProps = {
  monthDate: Date;
  selectedDateKey: string;
  dueCountsByDate: Record<string, number>;
  completedDates?: Set<string>;
  onSelectDate: (dateKey: string) => void;
  accent?: string;
};

export function MonthlyReviewCalendar({
  monthDate,
  selectedDateKey,
  dueCountsByDate,
  completedDates,
  onSelectDate,
  accent = colors.retrieve,
}: MonthlyReviewCalendarProps) {
  const cells = useMemo(() => buildMonthCells(monthDate), [monthDate]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.monthTitle}>{monthLabel(monthDate)}</Text>

      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label, index) => (
          <Text key={`${label}-${index}`} style={styles.weekday}>
            {label}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((cell) => {
          if (cell.type === 'blank') {
            return <View key={cell.id} style={styles.cell} />;
          }

          const count = dueCountsByDate[cell.key] ?? 0;
          const selected = selectedDateKey === cell.key;
          const completed = completedDates?.has(cell.key) ?? false;
          const hasReviews = count > 0;

          return (
            <Pressable
              key={cell.key}
              onPress={() => onSelectDate(cell.key)}
              style={styles.cell}
              hitSlop={3}
            >
              <View
                style={[
                  styles.dayBox,
                  cell.isPast && !completed && !hasReviews && styles.dayMuted,
                  hasReviews && !cell.isPast && { borderColor: `${accent}77` },
                  cell.isToday && { borderColor: accent, borderWidth: 2 },
                  selected && { backgroundColor: accent, borderColor: accent },
                  completed && !selected && styles.dayCompleted,
                ]}
              >
                <Text
                  style={[
                    styles.dayText,
                    cell.isPast && !completed && !hasReviews && styles.dayTextMuted,
                    cell.isToday && { color: accent, fontWeight: font.weight.heavy as '800' },
                    selected && styles.dayTextSelected,
                    completed && !selected && { color: colors.success },
                  ]}
                >
                  {cell.day}
                </Text>

                {completed && count === 0 ? (
                  <Ionicons
                    name="checkmark"
                    size={10}
                    color={selected ? colors.bg : colors.success}
                    style={styles.check}
                  />
                ) : null}

                {count > 0 ? (
                  <View style={[styles.countPill, selected && styles.countPillSelected]}>
                    <Text style={[styles.countText, selected && styles.countTextSelected]}>
                      {count > 9 ? '9+' : count}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
  },
  monthTitle: {
    color: colors.text,
    fontSize: font.size.lg,
    fontWeight: font.weight.heavy as '800',
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
    fontWeight: font.weight.bold as '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 3,
  },
  dayBox: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayMuted: {
    opacity: 0.48,
  },
  dayCompleted: {
    backgroundColor: `${colors.success}18`,
    borderColor: `${colors.success}66`,
  },
  dayText: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    fontWeight: font.weight.bold as '700',
  },
  dayTextMuted: {
    color: colors.textFaint,
  },
  dayTextSelected: {
    color: colors.bg,
    fontWeight: font.weight.heavy as '800',
  },
  check: {
    position: 'absolute',
    bottom: 4,
  },
  countPill: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    minWidth: 17,
    height: 17,
    borderRadius: radius.pill,
    paddingHorizontal: 4,
    backgroundColor: colors.retrieve,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countPillSelected: {
    backgroundColor: colors.white,
  },
  countText: {
    color: colors.bg,
    fontSize: 9,
    fontWeight: font.weight.heavy as '800',
  },
  countTextSelected: {
    color: colors.bg,
  },
});
