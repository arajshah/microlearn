import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CardContent, Explanation, isAnswerCorrect } from '@/components/CardView';
import {
  challengeQuestionToCard,
  DailyChallenge,
  getTodayChallenge,
} from '@/challenge/challengeOfDay';
import { useChallenge } from '@/context/ChallengeContext';
import { useProgress } from '@/context/ProgressContext';
import { useLibrary } from '@/context/LibraryContext';
import { colors, font, radius, spacing } from '@/theme/theme';
import { dayKey } from '@/utils/date';

const BASE_XP = 10;
const XP_PER_CORRECT = 4;

type ChallengeItem = {
  id: string;
  subjectTitle: string;
  accent: string;
  card: ReturnType<typeof challengeQuestionToCard>;
};

export default function ChallengeSession() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { awardXp } = useProgress();
  const { recordToday, todayResult } = useChallenge();
  const { generatedLessons, config, hasKey } = useLibrary();

  const today = dayKey();
  const [loading, setLoading] = useState(true);
  const [daily, setDaily] = useState<DailyChallenge | null>(null);
  const queueRef = useRef<ChallengeItem[]>([]);
  const alreadyDone = useRef(Boolean(todayResult)).current;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const challenge = await getTodayChallenge({
        dayKey: today,
        generatedLessons,
        config,
        hasKey,
      });
      if (cancelled) return;
      const items: ChallengeItem[] = challenge.questions.map((q) => ({
        id: q.id,
        subjectTitle: challenge.subjectTitle,
        accent: challenge.accent,
        card: challengeQuestionToCard(q),
      }));
      queueRef.current = items;
      setDaily(challenge);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [today, generatedLessons, config, hasKey]);

  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [finished, setFinished] = useState(false);

  const queue = queueRef.current;
  const total = queue.length;
  const item = queue[index];

  const topicLabel = useMemo(() => daily?.topic ?? 'Daily mix', [daily?.topic]);

  if (loading) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.xp} size="large" />
        <Text style={styles.loadingText}>Preparing today&apos;s challenge…</Text>
      </View>
    );
  }

  if (total === 0 || finished) {
    const correct = finished ? correctCount : todayResult?.correct ?? 0;
    const xp = finished ? BASE_XP + correctCount * XP_PER_CORRECT : todayResult?.xp ?? 0;
    return (
      <Summary
        replay={alreadyDone && !finished}
        correct={correct}
        total={finished ? total : todayResult?.total ?? total}
        xp={xp}
        onDone={() => router.back()}
      />
    );
  }

  const handleSelect = (optIndex: number, isCorrect: boolean) => {
    if (revealed) return;
    setSelected(optIndex);
    setRevealed(true);
    if (isCorrect) {
      setCorrectCount((c) => c + 1);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  };

  const advance = () => {
    if (index >= total - 1) {
      const xp = BASE_XP + correctCount * XP_PER_CORRECT;
      if (!alreadyDone) {
        awardXp(xp);
        recordToday({
          correct: correctCount,
          total,
          xp,
          at: new Date().toISOString(),
        });
      }
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
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.counter}>
          {index + 1}/{total}
        </Text>
      </View>

      <View style={styles.kickerRow}>
        <Ionicons name="trophy" size={14} color={colors.xp} />
        <Text style={styles.kicker}>DAILY CHALLENGE · {item.subjectTitle}</Text>
      </View>
      <Text style={styles.topicLine} numberOfLines={2}>
        {topicLabel}
      </Text>

      <ScrollView
        contentContainerStyle={styles.cardScroll}
        showsVerticalScrollIndicator={false}
      >
        <CardContent
          card={item.card}
          accent={item.accent}
          selected={selected}
          revealed={revealed}
          onSelect={handleSelect}
        />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {revealed ? (
          <Explanation card={item.card} correct={isAnswerCorrect(item.card, selected)} />
        ) : null}
        <Pressable
          disabled={!revealed}
          onPress={advance}
          style={[
            styles.cta,
            { backgroundColor: revealed ? colors.xp : colors.surfaceAlt },
          ]}
        >
          <Text style={[styles.ctaText, { color: revealed ? colors.bg : colors.textFaint }]}>
            {!revealed
              ? 'Select an answer'
              : index >= total - 1
                ? 'Finish challenge'
                : 'Continue'}
          </Text>
          {revealed ? <Ionicons name="arrow-forward" size={18} color={colors.bg} /> : null}
        </Pressable>
      </View>
    </View>
  );
}

function Summary({
  replay,
  correct,
  total,
  xp,
  onDone,
}: {
  replay: boolean;
  correct: number;
  total: number;
  xp: number;
  onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  return (
    <LinearGradient
      colors={['#3A2B12', '#1B2640']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.screen, styles.center, { padding: spacing.xl }]}
    >
      <View style={styles.badge}>
        <Ionicons name="trophy" size={52} color={colors.xp} />
      </View>
      <Text style={styles.summaryTitle}>
        {replay ? 'Challenge recap' : 'Challenge complete!'}
      </Text>
      <Text style={styles.summarySub}>
        {replay
          ? "You've already earned today's bonus — come back tomorrow for a fresh mix."
          : `You scored ${correct}/${total} and earned +${xp} XP.`}
      </Text>

      <View style={styles.statRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{accuracy}%</Text>
          <Text style={styles.statLabel}>Accuracy</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>+{xp}</Text>
          <Text style={styles.statLabel}>XP</Text>
        </View>
      </View>

      <Pressable
        onPress={onDone}
        style={[styles.summaryBtn, { marginBottom: insets.bottom + spacing.md }]}
      >
        <Text style={styles.summaryBtnText}>Done</Text>
      </Pressable>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  loadingText: {
    color: colors.textMuted,
    fontSize: font.size.md,
    marginTop: spacing.lg,
  },
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
  progressFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.xp },
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
  topicLine: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    lineHeight: 20,
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
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  summaryTitle: {
    color: colors.white,
    fontSize: font.size.xxl,
    fontWeight: font.weight.heavy as '800',
    textAlign: 'center',
  },
  summarySub: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: font.size.md,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  statRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xxl, width: '100%' },
  statBox: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    color: colors.white,
    fontSize: font.size.xl,
    fontWeight: font.weight.heavy as '800',
  },
  statLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold as '600',
  },
  summaryBtn: {
    backgroundColor: colors.white,
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
