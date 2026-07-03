import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MasteryLevel } from '@/data/mastery';
import { DifficultyTrack, Subject } from '@/types/content';
import { TRACK_LABELS, isUnitUnlocked, normalizedUnits, unitsForMastery } from '@/data/courses';
import { useProgress } from '@/context/ProgressContext';
import { colors, font, radius, spacing } from '@/theme/theme';
import { LessonRow } from './LessonRow';

/**
 * Renders a subject's units and lessons as a vertical skill tree.
 * Units can be locked by prerequisites; lessons unlock sequentially within
 * an unlocked unit.
 */
export function UnitList({
  subject,
  track = 'all',
  masteryLevel,
}: {
  subject: Subject;
  track?: DifficultyTrack | 'all';
  masteryLevel?: MasteryLevel | 'all';
}) {
  const { isLessonComplete } = useProgress();
  const allNormalized = normalizedUnits(subject);

  const units = masteryLevel
    ? unitsForMastery(subject, masteryLevel)
    : track === 'all'
      ? allNormalized
      : allNormalized.filter((u) => u.difficulty === track);

  let globalIndex = 0;
  let prevComplete = true;

  return (
    <View style={{ gap: spacing.xxl }}>
      {units.map((unit) => {
        const unitUnlocked = isUnitUnlocked(unit, subject, isLessonComplete);
        return (
          <View key={unit.id}>
            <View style={styles.unitHeader}>
              <View style={styles.unitTitleRow}>
                <Text style={[styles.unitKicker, { color: subject.accent }]}>
                  {unit.difficulty ? TRACK_LABELS[unit.difficulty].toUpperCase() : 'UNIT'}
                </Text>
                {!unitUnlocked ? (
                  <View style={styles.lockBadge}>
                    <Ionicons name="lock-closed" size={12} color={colors.textMuted} />
                    <Text style={styles.lockText}>Complete prior unit</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.unitTitle}>{unit.title}</Text>
              <Text style={styles.unitDesc}>{unit.description}</Text>
            </View>

            {unit.lessons.map((lesson, i) => {
              const idx = globalIndex++;
              const lessonUnlocked = unitUnlocked && prevComplete;
              prevComplete = isLessonComplete(lesson.id);
              return (
                <LessonRow
                  key={lesson.id}
                  lesson={lesson}
                  subject={subject}
                  index={idx}
                  unlocked={lessonUnlocked}
                  isLast={i === unit.lessons.length - 1}
                />
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  unitHeader: { marginBottom: spacing.lg, gap: 2 },
  unitTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  unitKicker: {
    fontSize: font.size.xs,
    fontWeight: font.weight.heavy as '800',
    letterSpacing: 1.5,
  },
  lockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  lockText: { color: colors.textMuted, fontSize: 10, fontWeight: font.weight.semibold as '600' },
  unitTitle: {
    color: colors.text,
    fontSize: font.size.xl,
    fontWeight: font.weight.heavy as '800',
  },
  unitDesc: { color: colors.textMuted, fontSize: font.size.sm, lineHeight: 19 },
});
