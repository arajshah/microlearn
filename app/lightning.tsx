import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CardContent, Explanation, wasCardCorrect } from '@/components/CardView';
import { useProgress } from '@/context/ProgressContext';
import { allLessons, getSubject } from '@/data/courses';
import { LessonCard } from '@/types/content';
import { isInteractiveCard } from '@/utils/cards';
import { mulberry32, seedFromString, shuffle } from '@/utils/random';
import { colors, font, radius, spacing } from '@/theme/theme';
import { dayKey } from '@/utils/date';

const DURATION_SEC = 60;
const XP_PER_CORRECT = 5;

interface LightningItem {
  card: LessonCard;
  accent: string;
  subjectTitle: string;
}

function buildPool(): LightningItem[] {
  const pool: LightningItem[] = [];
  for (const { subject, lesson } of allLessons()) {
    lesson.cards.forEach((card) => {
      if (isInteractiveCard(card)) {
        pool.push({ card, accent: subject.accent, subjectTitle: subject.title });
      }
    });
  }
  const rnd = mulberry32(seedFromString(`lightning:${dayKey()}`));
  return shuffle(pool, rnd);
}

export default function LightningRound() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { awardXp } = useProgress();

  const pool = useRef(buildPool()).current;
  const [poolIdx, setPoolIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(DURATION_SEC);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const awarded = useRef(false);

  const item = pool[poolIdx % pool.length];
  const card = item?.card;

  const endRound = useCallback(() => {
    if (finished) return;
    setFinished(true);
    const xp = score * XP_PER_CORRECT;
    if (xp > 0 && !awarded.current) {
      awarded.current = true;
      awardXp(xp);
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [finished, score, awardXp]);

  useEffect(() => {
    if (finished) return;
    const t = setInterval(() => {
      setTimeLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [finished]);

  useEffect(() => {
    if (timeLeft === 0 && !finished) endRound();
  }, [timeLeft, finished, endRound]);

  const handleSelect = (opt: number, correct: boolean) => {
    if (revealed || finished) return;
    setSelected(opt);
    setRevealed(true);
    if (correct) {
      setScore((s) => s + 1);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
    setTimeout(() => {
      setPoolIdx((i) => i + 1);
      setSelected(null);
      setRevealed(false);
    }, 700);
  };

  if (finished || !card) {
    const xp = score * XP_PER_CORRECT;
    return (
      <LinearGradient
        colors={['#1a0a2e', '#0E1525']}
        style={[styles.screen, styles.center, { padding: spacing.xl }]}
      >
        <Ionicons name="flash" size={56} color={colors.warning} />
        <Text style={styles.doneTitle}>Time&apos;s up!</Text>
        <Text style={styles.doneSub}>
          {score} correct · +{xp} XP
        </Text>
        <Pressable onPress={() => router.back()} style={styles.doneBtn}>
          <Text style={styles.doneBtnText}>Done</Text>
        </Pressable>
      </LinearGradient>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={24} color={colors.textMuted} />
        </Pressable>
        <View style={styles.timerWrap}>
          <Ionicons name="flash" size={16} color={colors.warning} />
          <Text style={[styles.timer, timeLeft <= 10 && { color: colors.danger }]}>
            {timeLeft}s
          </Text>
        </View>
        <Text style={styles.score}>{score}</Text>
      </View>

      <Text style={styles.kicker}>LIGHTNING · {item.subjectTitle}</Text>

      <View style={styles.cardArea}>
        <CardContent
          card={card}
          accent={item.accent}
          selected={selected}
          revealed={revealed}
          onSelect={handleSelect}
        />
        {revealed ? (
          <Explanation card={card} correct={wasCardCorrect(card, selected)} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  timerWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timer: {
    color: colors.warning,
    fontSize: font.size.xl,
    fontWeight: font.weight.heavy as '800',
  },
  score: {
    color: colors.text,
    fontSize: font.size.lg,
    fontWeight: font.weight.bold as '700',
    width: 40,
    textAlign: 'right',
  },
  kicker: {
    color: colors.textFaint,
    fontSize: font.size.xs,
    fontWeight: font.weight.heavy as '800',
    letterSpacing: 1,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  cardArea: { flex: 1, padding: spacing.lg, gap: spacing.lg },
  doneTitle: {
    color: colors.white,
    fontSize: font.size.xxxl,
    fontWeight: font.weight.heavy as '800',
    marginTop: spacing.xl,
  },
  doneSub: { color: colors.textMuted, fontSize: font.size.lg, marginTop: spacing.sm },
  doneBtn: {
    backgroundColor: colors.warning,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xxxl,
    borderRadius: radius.pill,
    marginTop: spacing.xxl,
  },
  doneBtnText: { color: colors.bg, fontWeight: font.weight.heavy as '800', fontSize: font.size.md },
});
