import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CardContent, Explanation, cardToSpeech, wasCardCorrect } from '@/components/CardView';
import { TutorPanel } from '@/components/TutorPanel';
import { useSpeech } from '@/hooks/useSpeech';
import { isInteractiveCard, countGradedCards } from '@/utils/cards';
import { useRoadmaps } from '@/context/RoadmapContext';
import { useProgress } from '@/context/ProgressContext';
import { useLibrary } from '@/context/LibraryContext';
import { buildLessonOutcome, getNodeObjective } from '@/utils/lessonContinuity';
import { saveLessonOutcome } from '@/storage/lessonOutcomeStorage';
import { useReview } from '@/context/ReviewContext';
import { useBookmarks } from '@/context/BookmarksContext';
import { makeItemId } from '@/srs/scheduler';
import { cardToTutorContext } from '@/utils/tutorContext';
import { colors, font, radius, spacing } from '@/theme/theme';

export default function LessonPlayer() {
  const { id, roadmapId, nodeId } = useLocalSearchParams<{
    id: string;
    roadmapId?: string;
    nodeId?: string;
  }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { completeLesson } = useProgress();
  const { resolveLesson, getGenerated } = useLibrary();
  const { getRoadmapById, onRoadmapLessonCompleted } = useRoadmaps();
  const { ingestLesson } = useReview();
  const { isSaved, toggle } = useBookmarks();
  const { speaking, speak, stop } = useSpeech();

  const location = useMemo(() => resolveLesson(id ?? ''), [id, resolveLesson]);
  const results = useRef<
    { cardIndex: number; cardId: string; correct: boolean; selected: number | null }[]
  >([]);

  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const [earnedXp, setEarnedXp] = useState(0);
  const [tutorOpen, setTutorOpen] = useState(false);
  const [tutorKeyboardUp, setTutorKeyboardUp] = useState(false);

  const fade = useRef(new Animated.Value(1)).current;

  // Stop any narration when moving between cards.
  useEffect(() => {
    stop();
  }, [index, stop]);

  const tutorContext = useMemo(() => {
    if (!location) return undefined;
    const header = `${location.subject.title} — ${location.lesson.title}`;
    return `${header}\n${cardToTutorContext(location.lesson.cards[index])}`;
  }, [location, index]);

  if (!location) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.missing}>Lesson not found.</Text>
        <Pressable onPress={() => router.back()} style={styles.linkBtn}>
          <Text style={styles.linkBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const { subject, lesson } = location;
  const cards = lesson.cards;
  const card = cards[index];
  const totalQuestions = countGradedCards(cards);
  const isQuestion = isInteractiveCard(card);
  const progress = (index + (revealed || !isQuestion ? 1 : 0)) / cards.length;

  const animateTo = (next: () => void) => {
    Animated.timing(fade, {
      toValue: 0,
      duration: 140,
      useNativeDriver: true,
    }).start(() => {
      next();
      Animated.timing(fade, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start();
    });
  };

  const handleSelect = (optionIndex: number, isCorrect: boolean) => {
    if (revealed) return;
    setSelected(optionIndex);
    setRevealed(true);
    results.current.push({
      cardIndex: index,
      cardId: card.id ?? `c${index + 1}`,
      correct: isCorrect,
      selected: optionIndex,
    });
    if (isCorrect) {
      setCorrectCount((c) => c + 1);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        () => {},
      );
    }
  };

  const finish = async () => {
    ingestLesson(
      lesson,
      subject.id,
      results.current.map(({ cardIndex, correct }) => ({ cardIndex, correct })),
    );
    const xp = await completeLesson({
      lesson,
      subjectId: subject.id,
      correct: correctCount,
      total: totalQuestions,
    });
    const gen = getGenerated(lesson.id);
    const rmId = roadmapId ?? gen?.roadmapId;
    const nId = nodeId ?? gen?.roadmapNodeId;
    if (rmId && nId && gen) {
      const roadmap = getRoadmapById(rmId);
      const objective =
        gen.primaryObjective ??
        (roadmap ? getNodeObjective(roadmap, nId) : undefined) ??
        lesson.title;
      const outcome = buildLessonOutcome({
        roadmapId: rmId,
        roadmapNodeId: nId,
        lesson: gen,
        objective,
        results: results.current,
      });
      await saveLessonOutcome(outcome);
      await onRoadmapLessonCompleted(rmId, nId, outcome);
    } else if (rmId && nId) {
      await onRoadmapLessonCompleted(rmId, nId);
    }
    setEarnedXp(xp);
    setFinished(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {},
    );
  };

  const advance = () => {
    if (index >= cards.length - 1) {
      finish();
      return;
    }
    animateTo(() => {
      setIndex((i) => i + 1);
      setSelected(null);
      setRevealed(false);
    });
  };

  const canContinue = !isQuestion || revealed;

  if (finished) {
    return (
      <CompletionScreen
        subjectGradient={subject.gradient}
        subjectAccent={subject.accent}
        lessonTitle={lesson.title}
        xp={earnedXp}
        correct={correctCount}
        total={totalQuestions}
        onDone={() => router.back()}
      />
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color={colors.textMuted} />
        </Pressable>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${progress * 100}%`, backgroundColor: subject.accent },
            ]}
          />
        </View>
        <Text style={styles.counter}>
          {index + 1}/{cards.length}
        </Text>
        <Pressable
          onPress={() => (speaking ? stop() : speak(cardToSpeech(card)))}
          hitSlop={10}
          style={styles.askBtn}
        >
          <Ionicons
            name={speaking ? 'pause' : 'volume-high'}
            size={18}
            color={speaking ? subject.accent : colors.textMuted}
          />
        </Pressable>
        <Pressable
          onPress={() =>
            toggle({
              id: makeItemId(lesson.id, index),
              lessonId: lesson.id,
              lessonTitle: lesson.title,
              subjectId: subject.id,
              cardIndex: index,
              card,
            })
          }
          hitSlop={10}
          style={styles.askBtn}
        >
          <Ionicons
            name={isSaved(makeItemId(lesson.id, index)) ? 'bookmark' : 'bookmark-outline'}
            size={18}
            color={isSaved(makeItemId(lesson.id, index)) ? colors.xp : colors.textMuted}
          />
        </Pressable>
        <Pressable
          onPress={() => router.push(`/listen/${lesson.id}`)}
          hitSlop={10}
          style={styles.askBtn}
        >
          <Ionicons name="headset" size={18} color={colors.textMuted} />
        </Pressable>
        <Pressable
          onPress={() => setTutorOpen((o) => !o)}
          hitSlop={10}
          style={[styles.askBtn, tutorOpen && { borderColor: subject.accent }]}
        >
          <Ionicons name="sparkles" size={18} color={subject.accent} />
        </Pressable>
      </View>

      <View style={styles.body}>
        <Animated.View style={{ flex: 1, opacity: fade }}>
          <ScrollView
            contentContainerStyle={styles.cardScroll}
            showsVerticalScrollIndicator={false}
          >
            <CardContent
              card={card}
              accent={subject.accent}
              selected={selected}
              revealed={revealed}
              onSelect={handleSelect}
            />
          </ScrollView>
        </Animated.View>

        {tutorOpen ? (
          <TutorPanel
            key={`${lesson.id}-${index}`}
            context={tutorContext}
            contextLabel={lesson.title}
            accent={subject.accent}
            variant="inline"
            maxHeight={300}
            onKeyboardChange={setTutorKeyboardUp}
            onClose={() => {
              setTutorKeyboardUp(false);
              setTutorOpen(false);
            }}
          />
        ) : null}
      </View>

      {/* Bottom action — hide while typing in tutor so keyboard doesn't cover input */}
      {!tutorKeyboardUp ? (
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {isQuestion && revealed ? (
          <Explanation card={card} correct={wasCardCorrect(card, selected)} />
        ) : null}
        <Pressable
          disabled={!canContinue}
          onPress={advance}
          style={[
            styles.cta,
            { backgroundColor: canContinue ? subject.accent : colors.surfaceAlt },
          ]}
        >
          <Text
            style={[
              styles.ctaText,
              { color: canContinue ? colors.bg : colors.textFaint },
            ]}
          >
            {index >= cards.length - 1
              ? 'Finish lesson'
              : isQuestion && !revealed
                ? 'Select an answer'
                : 'Continue'}
          </Text>
          {canContinue ? (
            <Ionicons name="arrow-forward" size={18} color={colors.bg} />
          ) : null}
        </Pressable>
      </View>
      ) : null}
    </View>
  );
}

/* ---------- Completion ---------- */

function CompletionScreen({
  subjectGradient,
  subjectAccent,
  lessonTitle,
  xp,
  correct,
  total,
  onDone,
}: {
  subjectGradient: [string, string];
  subjectAccent: string;
  lessonTitle: string;
  xp: number;
  correct: number;
  total: number;
  onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 100;

  return (
    <LinearGradient
      colors={subjectGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.screen, styles.center, { padding: spacing.xl }]}
    >
      <View style={styles.completionBadge}>
        <Ionicons name="trophy" size={56} color={colors.white} />
      </View>
      <Text style={styles.completionTitle}>Lesson complete!</Text>
      <Text style={styles.completionLesson}>{lessonTitle}</Text>

      <View style={styles.statRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>+{xp}</Text>
          <Text style={styles.statLabel}>XP earned</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{accuracy}%</Text>
          <Text style={styles.statLabel}>Accuracy</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>
            {correct}/{total}
          </Text>
          <Text style={styles.statLabel}>Correct</Text>
        </View>
      </View>

      <Pressable
        onPress={onDone}
        style={[styles.completionBtn, { marginBottom: insets.bottom + spacing.md }]}
      >
        <Text style={styles.completionBtnText}>Continue</Text>
      </Pressable>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  missing: { color: colors.textMuted, fontSize: font.size.md },
  linkBtn: { marginTop: spacing.lg },
  linkBtnText: { color: colors.primary, fontWeight: '700' },

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
  askBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1 },

  cardScroll: {
    padding: spacing.lg,
    paddingTop: spacing.xl,
    flexGrow: 1,
  },

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
  ctaText: {
    fontSize: font.size.md,
    fontWeight: font.weight.heavy as '800',
  },

  completionBadge: {
    width: 110,
    height: 110,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  completionTitle: {
    color: colors.white,
    fontSize: font.size.xxxl,
    fontWeight: font.weight.heavy as '800',
  },
  completionLesson: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: font.size.md,
    marginTop: 4,
    textAlign: 'center',
  },
  statRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xxl,
    width: '100%',
  },
  statBox: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
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
  completionBtn: {
    backgroundColor: colors.white,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xxxl,
    borderRadius: radius.pill,
    marginTop: spacing.xxl,
    width: '100%',
    alignItems: 'center',
  },
  completionBtnText: {
    color: colors.bg,
    fontSize: font.size.md,
    fontWeight: font.weight.heavy as '800',
  },
});
