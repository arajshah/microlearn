import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CardContent, Explanation, wasCardCorrect } from '@/components/CardView';
import { useProgress } from '@/context/ProgressContext';
import { useReview } from '@/context/ReviewContext';
import { getSubject } from '@/data/courses';
import { colors, font, radius, spacing } from '@/theme/theme';

const XP_CORRECT = 6;
const XP_ATTEMPT = 2;

export default function ReviewSession() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { dueItems, gradeItem } = useReview();
  const { awardXp } = useProgress();

  // Snapshot the queue once so it doesn't reshuffle as we grade.
  const queue = useRef(dueItems()).current;

  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [xp, setXp] = useState(0);
  const [finished, setFinished] = useState(false);

  const total = queue.length;
  const item = queue[index];
  const accent = useMemo(
    () => (item ? getSubject(item.subjectId)?.accent ?? colors.primary : colors.primary),
    [item],
  );

  if (total === 0 || finished) {
    return (
      <Summary
        empty={total === 0}
        correct={correctCount}
        total={total}
        xp={xp}
        onDone={() => router.back()}
      />
    );
  }

  const handleSelect = (_optIndex: number, isCorrect: boolean) => {
    if (revealed) return;
    setSelected(_optIndex);
    setRevealed(true);
    gradeItem(item.id, isCorrect);
    if (isCorrect) {
      setCorrectCount((c) => c + 1);
      setXp((x) => x + XP_CORRECT);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else {
      setXp((x) => x + XP_ATTEMPT);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  };

  const advance = () => {
    if (index >= total - 1) {
      awardXp(xp);
      setFinished(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      return;
    }
    setIndex((i) => i + 1);
    setSelected(null);
    setRevealed(false);
  };

  const progress = (index + (revealed ? 1 : 0)) / total;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color={colors.textMuted} />
        </Pressable>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${progress * 100}%`, backgroundColor: accent },
            ]}
          />
        </View>
        <Text style={styles.counter}>
          {index + 1}/{total}
        </Text>
      </View>

      <View style={styles.kickerRow}>
        <Ionicons name="refresh" size={14} color={colors.textFaint} />
        <Text style={styles.kicker}>REVIEW · {item.lessonTitle}</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.cardScroll}
        showsVerticalScrollIndicator={false}
      >
        <CardContent
          card={item.card}
          accent={accent}
          selected={selected}
          revealed={revealed}
          onSelect={handleSelect}
        />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {revealed ? (
          <Explanation card={item.card} correct={wasCardCorrect(item.card, selected)} />
        ) : null}
        <Pressable
          disabled={!revealed}
          onPress={advance}
          style={[
            styles.cta,
            { backgroundColor: revealed ? accent : colors.surfaceAlt },
          ]}
        >
          <Text
            style={[styles.ctaText, { color: revealed ? colors.bg : colors.textFaint }]}
          >
            {!revealed
              ? 'Select an answer'
              : index >= total - 1
                ? 'Finish review'
                : 'Continue'}
          </Text>
          {revealed ? (
            <Ionicons name="arrow-forward" size={18} color={colors.bg} />
          ) : null}
        </Pressable>
      </View>
    </View>
  );
}

function Summary({
  empty,
  correct,
  total,
  xp,
  onDone,
}: {
  empty: boolean;
  correct: number;
  total: number;
  xp: number;
  onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, styles.center, { padding: spacing.xl }]}>
      <View style={styles.badge}>
        <Ionicons
          name={empty ? 'checkmark-done' : 'sparkles'}
          size={48}
          color={colors.primary}
        />
      </View>
      <Text style={styles.summaryTitle}>
        {empty ? 'Nothing due — nice!' : 'Review complete!'}
      </Text>
      <Text style={styles.summarySub}>
        {empty
          ? 'Your memory is fresh. Finish a lesson to add new cards to your review queue.'
          : `You recalled ${correct} of ${total} and earned +${xp} XP.`}
      </Text>
      <Pressable
        onPress={onDone}
        style={[styles.summaryBtn, { marginBottom: insets.bottom + spacing.md }]}
      >
        <Text style={styles.summaryBtnText}>Done</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  closeBtn: { padding: 2 },
  progressTrack: {
    flex: 1,
    height: 10,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: radius.pill },
  counter: {
    color: colors.textFaint,
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold as '600',
    width: 42,
    textAlign: 'right',
  },
  kickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  kicker: {
    color: colors.textFaint,
    fontSize: font.size.xs,
    fontWeight: font.weight.heavy as '800',
    letterSpacing: 1,
  },
  cardScroll: { padding: spacing.lg, paddingTop: spacing.md, flexGrow: 1 },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.bg,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
  },
  ctaText: { fontSize: font.size.md, fontWeight: font.weight.heavy as '800' },
  badge: {
    width: 96,
    height: 96,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  summaryTitle: {
    color: colors.text,
    fontSize: font.size.xxl,
    fontWeight: font.weight.heavy as '800',
    textAlign: 'center',
  },
  summarySub: {
    color: colors.textMuted,
    fontSize: font.size.md,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  summaryBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xxxl,
    borderRadius: radius.pill,
    marginTop: spacing.xxl,
    width: '100%',
    alignItems: 'center',
  },
  summaryBtnText: {
    color: colors.bg,
    fontSize: font.size.md,
    fontWeight: font.weight.heavy as '800',
  },
});
