import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Lesson, Subject } from '@/types/content';
import { useProgress } from '@/context/ProgressContext';
import { colors, font, radius, spacing } from '@/theme/theme';

interface Props {
  lesson: Lesson;
  subject: Subject;
  index: number;
  /** Whether this lesson is unlocked (previous one done or it's the first). */
  unlocked: boolean;
  isLast?: boolean;
}

export function LessonRow({ lesson, subject, index, unlocked, isLast }: Props) {
  const router = useRouter();
  const { isLessonComplete, lessonResult } = useProgress();
  const done = isLessonComplete(lesson.id);
  const result = lessonResult(lesson.id);

  const nodeColor = done ? subject.accent : unlocked ? colors.surfaceAlt : colors.bgElevated;

  return (
    <View style={styles.row}>
      {/* Timeline node + connector */}
      <View style={styles.timeline}>
        <View
          style={[
            styles.node,
            { backgroundColor: nodeColor, borderColor: done ? subject.accent : colors.border },
          ]}
        >
          {done ? (
            <Ionicons name="checkmark" size={18} color={colors.bg} />
          ) : unlocked ? (
            <Text style={styles.nodeNum}>{index + 1}</Text>
          ) : (
            <Ionicons name="lock-closed" size={14} color={colors.textFaint} />
          )}
        </View>
        {!isLast ? <View style={styles.connector} /> : null}
      </View>

      <Pressable
        disabled={!unlocked}
        onPress={() => router.push(`/lesson/${lesson.id}`)}
        style={({ pressed }) => [
          styles.card,
          !unlocked && styles.cardLocked,
          pressed && unlocked && { transform: [{ scale: 0.99 }], borderColor: subject.accent },
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, !unlocked && styles.textLocked]} numberOfLines={1}>
            {lesson.title}
          </Text>
          <Text style={[styles.sub, !unlocked && styles.textLocked]} numberOfLines={1}>
            {lesson.subtitle}
          </Text>
          <View style={styles.metaRow}>
            <Ionicons
              name="time-outline"
              size={13}
              color={unlocked ? colors.textFaint : colors.borderSoft}
            />
            <Text style={[styles.meta, !unlocked && styles.textLocked]}>
              {lesson.minutes} min · {lesson.cards.length} cards
            </Text>
            {done && result ? (
              <Text style={[styles.scoreTag, { color: subject.accent }]}>
                {result.correct}/{result.total} correct
              </Text>
            ) : null}
          </View>
        </View>
        {unlocked ? (
          <Ionicons
            name={done ? 'refresh' : 'chevron-forward'}
            size={20}
            color={done ? subject.accent : colors.textMuted}
          />
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md },
  timeline: { alignItems: 'center', width: 40 },
  node: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeNum: {
    color: colors.text,
    fontWeight: font.weight.bold as '700',
    fontSize: font.size.md,
  },
  connector: {
    width: 2,
    flex: 1,
    minHeight: 18,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
  card: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardLocked: { backgroundColor: colors.bgElevated, borderColor: colors.borderSoft },
  title: {
    color: colors.text,
    fontSize: font.size.md,
    fontWeight: font.weight.bold as '700',
  },
  sub: { color: colors.textMuted, fontSize: font.size.sm, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.sm },
  meta: { color: colors.textFaint, fontSize: font.size.xs },
  scoreTag: {
    fontSize: font.size.xs,
    fontWeight: font.weight.bold as '700',
    marginLeft: spacing.sm,
  },
  textLocked: { color: colors.textFaint },
});
