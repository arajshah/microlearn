import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CardContent, Explanation, cardToSpeech, wasCardCorrect } from '@/components/CardView';
import { TutorSheet } from '@/components/tutor/TutorSheet';
import { useTutorConversation } from '@/components/tutor/useTutorConversation';
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
import { clampCardIndex, getLessonCardAtIndex } from '@/utils/lessonPlayerState';
import { createReviewSetFromLesson, isServerConfigured } from '@/services/microlearnServer';
import {
  LessonTelemetryContext,
  trackCardAnswered,
  trackCardViewed,
  trackLessonCompleted,
  trackLessonStarted,
} from '@/services/learningTelemetry';
import { colors, font, radius, spacing } from '@/theme/theme';
import { GeneratedLesson } from '@/types/content';

function firstParam(value: unknown): string | undefined {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : undefined;
  return typeof value === 'string' ? value : undefined;
}

export default function LessonPlayer() {
  const { id, roadmapId, nodeId } = useLocalSearchParams<{
    id: string;
    roadmapId?: string;
    nodeId?: string;
  }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { completeLesson } = useProgress();
  const { resolveLesson, getGenerated, serverConfigured } = useLibrary();
  const { getRoadmapById, onRoadmapLessonCompleted } = useRoadmaps();
  const { ingestLesson } = useReview();
  const { isSaved, toggle } = useBookmarks();
  const { speaking, speak, stop } = useSpeech();

  const location = useMemo(() => resolveLesson(id ?? ''), [id, resolveLesson]);
  const results = useRef<
    { cardIndex: number; cardId: string; correct: boolean; selected: number | null }[]
  >([]);
  const tutorToggleLock = useRef(false);

  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const [earnedXp, setEarnedXp] = useState(0);
  const [tutorOpen, setTutorOpen] = useState(false);
  const [tutorKeyboardUp, setTutorKeyboardUp] = useState(false);
  const [scheduleStatus, setScheduleStatus] = useState<
    'idle' | 'scheduling' | 'scheduled' | 'error' | 'unavailable'
  >('idle');
  const [scheduleMessage, setScheduleMessage] = useState<string | null>(null);
  const scheduleRequestInFlight = useRef(false);
  const finishInFlight = useRef(false);

  const fade = useRef(new Animated.Value(1)).current;
  const generatedLesson = useMemo(() => getGenerated(id ?? ''), [id, getGenerated]);
  const cardShownAt = useRef<number>(Date.now());
  const lessonId = location?.lesson.id;
  const cards = location?.lesson.cards ?? [];
  const cardCount = cards.length;
  const safeIndex = clampCardIndex(index, cardCount);
  const card = getLessonCardAtIndex(cards, safeIndex);

  useEffect(() => {
    setIndex((current) => clampCardIndex(current, cardCount));
    setSelected(null);
    setRevealed(false);
  }, [lessonId, cardCount]);

  useEffect(() => {
    if (safeIndex !== index) {
      setIndex(safeIndex);
    }
  }, [safeIndex, index]);

  useEffect(() => {
    return () => {
      stop();
      setTutorOpen(false);
      setTutorKeyboardUp(false);
    };
  }, [stop]);

  const telemetry = useMemo<LessonTelemetryContext | null>(() => {
    if (!location) return null;
    const meta = location.lesson as unknown as Record<string, unknown>;
    return {
      lessonId: location.lesson.id,
      lessonTitle: location.lesson.title,
      roadmapId: firstParam(roadmapId) ?? (typeof meta.roadmapId === 'string' ? meta.roadmapId : undefined),
      lessonNodeId:
        firstParam(nodeId) ?? (typeof meta.roadmapNodeId === 'string' ? meta.roadmapNodeId : undefined),
      lessonConceptTags: location.lesson.conceptTags,
      lessonSkillTags: location.lesson.skillTags,
    };
  }, [location, roadmapId, nodeId]);

  // Stop any narration when moving between slides.
  useEffect(() => {
    stop();
  }, [index, stop]);

  useEffect(() => {
    if (!telemetry || !location) return;
    trackLessonStarted(telemetry, location.lesson.cards.length);
    // Only the lesson identity should retrigger a lesson_started event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telemetry?.lessonId]);

  useEffect(() => {
    if (!telemetry || !card) return;
    cardShownAt.current = Date.now();
    trackCardViewed(telemetry, card, safeIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telemetry?.lessonId, safeIndex, card?.id]);

  const tutorContext = useMemo(() => {
    if (!location || !card) return undefined;
    const header = `${location.subject.title} — ${location.lesson.title}`;
    const body = cardToTutorContext(card);
    return body ? `${header}\n${body}` : header;
  }, [location, card]);

  const tutorCardLabel = useMemo(() => {
    if (!card) return null;
    if ('title' in card && typeof card.title === 'string' && card.title.trim()) {
      return card.title.trim();
    }
    return `Card ${safeIndex + 1}`;
  }, [card, safeIndex]);

  // Conversation is scoped to the lesson session — card changes update context only.
  const tutorConversation = useTutorConversation({
    context: tutorContext,
    serverConfigured,
    sessionKey: lessonId ?? 'none',
  });

  const closeTutor = () => {
    Keyboard.dismiss();
    setTutorKeyboardUp(false);
    setTutorOpen(false);
  };

  const toggleTutor = () => {
    if (tutorToggleLock.current) return;
    tutorToggleLock.current = true;
    setTutorOpen((open) => {
      if (open) setTutorKeyboardUp(false);
      return !open;
    });
    requestAnimationFrame(() => {
      tutorToggleLock.current = false;
    });
  };

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
  const totalQuestions = countGradedCards(cards);
  const isQuestion = card ? isInteractiveCard(card) : false;
  const progress = cardCount > 0 ? (safeIndex + (revealed || !isQuestion ? 1 : 0)) / cardCount : 1;

  const closeLesson = () => {
    stop();
    closeTutor();
    router.back();
  };

  const finish = async () => {
    if (finishInFlight.current || finished) return;
    finishInFlight.current = true;
    closeTutor();
    try {
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
      const lessonMeta = lesson as unknown as Record<string, unknown>;
      const lessonRoadmapId = typeof lessonMeta.roadmapId === 'string' ? lessonMeta.roadmapId : undefined;
      const lessonNodeId = typeof lessonMeta.roadmapNodeId === 'string' ? lessonMeta.roadmapNodeId : undefined;
      const gen = generatedLesson ?? (lessonRoadmapId && lessonNodeId
        ? (lesson as unknown as GeneratedLesson)
        : undefined);
      const rmId = firstParam(roadmapId) ?? gen?.roadmapId ?? lessonRoadmapId;
      const nId = firstParam(nodeId) ?? gen?.roadmapNodeId ?? lessonNodeId;
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
      if (telemetry) {
        await trackLessonCompleted(telemetry, {
          correctCount,
          totalCount: totalQuestions,
          accuracy: totalQuestions > 0 ? Number((correctCount / totalQuestions).toFixed(4)) : 0,
        });
      }
      setEarnedXp(xp);
      setFinished(true);
      stop();
      setTutorOpen(false);
      setTutorKeyboardUp(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
    } finally {
      finishInFlight.current = false;
    }
  };

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
    if (revealed || !card) return;
    setSelected(optionIndex);
    setRevealed(true);
    results.current.push({
      cardIndex: safeIndex,
      cardId: card.id ?? `c${safeIndex + 1}`,
      correct: isCorrect,
      selected: optionIndex,
    });
    if (telemetry) {
      trackCardAnswered(telemetry, card, {
        correct: isCorrect,
        selectedAnswer: optionIndex,
        expectedAnswer: (card as { answerIndex?: number }).answerIndex,
        responseTimeMs: Date.now() - cardShownAt.current,
      });
    }
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

  const advance = () => {
    if (cardCount === 0) {
      void finish();
      return;
    }
    if (safeIndex >= cardCount - 1) {
      void finish();
      return;
    }
    animateTo(() => {
      setIndex((i) => clampCardIndex(i + 1, cardCount));
      setSelected(null);
      setRevealed(false);
    });
  };

  const goBack = () => {
    if (safeIndex <= 0) return;
    animateTo(() => {
      setIndex((i) => clampCardIndex(i - 1, cardCount));
      setSelected(null);
      setRevealed(false);
    });
  };

  const canContinue = cardCount === 0 || !isQuestion || revealed;
  const canGoBack = safeIndex > 0;
  const isLastSlide = cardCount === 0 || safeIndex >= cardCount - 1;
  const completionRoadmapId = firstParam(roadmapId) ?? generatedLesson?.roadmapId;
  const completionNodeId = firstParam(nodeId) ?? generatedLesson?.roadmapNodeId;
  const isRoadmapGeneratedLesson = Boolean(completionRoadmapId && completionNodeId);

  const scheduleRetrieval = async () => {
    if (!generatedLesson || scheduleRequestInFlight.current) return;
    if (!isServerConfigured()) {
      setScheduleStatus('unavailable');
      setScheduleMessage('Connect the local server to add this lesson to review.');
      return;
    }
    scheduleRequestInFlight.current = true;
    setScheduleStatus('scheduling');
    setScheduleMessage(null);
    try {
      const result = await createReviewSetFromLesson({
        lessonId: generatedLesson.id,
        roadmapId: completionRoadmapId ?? generatedLesson.roadmapId,
        lessonNodeId: completionNodeId ?? generatedLesson.roadmapNodeId,
        lesson: generatedLesson,
      });
      if (result.ok && (result.reviewSet || (result.items?.length ?? 0) > 0)) {
        setScheduleStatus('scheduled');
        if ((result.created ?? 0) > 0) {
          const count = result.created ?? 0;
          setScheduleMessage(`Added ${count} review prompt${count === 1 ? '' : 's'}.`);
        } else {
          setScheduleMessage('Already in review.');
        }
      } else if (result.ok && result.totalCandidates === 0) {
        setScheduleStatus('error');
        setScheduleMessage('No review prompts could be created from this lesson.');
      } else {
        setScheduleStatus('error');
        setScheduleMessage(result.errorMessage ?? 'Could not add to review. Try again.');
      }
    } catch {
      setScheduleStatus('error');
      setScheduleMessage('Could not add to review. Try again.');
    } finally {
      scheduleRequestInFlight.current = false;
    }
  };

  if (finished) {
    return (
      <CompletionScreen
        subjectGradient={subject.gradient}
        subjectAccent={subject.accent}
        lessonTitle={lesson.title}
        xp={earnedXp}
        correct={correctCount}
        total={totalQuestions}
        canSchedule={Boolean(generatedLesson)}
        scheduleStatus={scheduleStatus}
        scheduleMessage={scheduleMessage}
        scheduleLabel={
          isRoadmapGeneratedLesson ? 'Add lesson to review' : 'Add to review'
        }
        onSchedule={scheduleRetrieval}
        onDone={() => router.back()}
      />
    );
  }

  if (cardCount === 0) {
    return (
      <View style={[styles.screen, styles.center, { padding: spacing.xl }]}>
        <Text style={styles.missing}>This lesson has no cards yet.</Text>
        <Pressable onPress={closeLesson} style={styles.linkBtn}>
          <Text style={styles.linkBtnText}>Go back</Text>
        </Pressable>
        <Pressable
          onPress={() => void finish()}
          style={[styles.linkBtn, { marginTop: spacing.sm }]}
        >
          <Text style={styles.linkBtnText}>Mark complete</Text>
        </Pressable>
      </View>
    );
  }

  if (!card) {
    return (
      <View style={[styles.screen, styles.center, { padding: spacing.xl }]}>
        <Text style={styles.missing}>This card is no longer available.</Text>
        <Pressable onPress={closeLesson} style={styles.linkBtn}>
          <Text style={styles.linkBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={closeLesson} hitSlop={12} style={styles.closeBtn}>
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
          {safeIndex + 1} of {cardCount}
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
              id: makeItemId(lesson.id, safeIndex),
              lessonId: lesson.id,
              lessonTitle: lesson.title,
              subjectId: subject.id,
              cardIndex: safeIndex,
              card,
            })
          }
          hitSlop={10}
          style={styles.askBtn}
        >
          <Ionicons
            name={isSaved(makeItemId(lesson.id, safeIndex)) ? 'bookmark' : 'bookmark-outline'}
            size={18}
            color={isSaved(makeItemId(lesson.id, safeIndex)) ? colors.xp : colors.textMuted}
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
          onPress={toggleTutor}
          hitSlop={10}
          style={[styles.askBtn, tutorOpen && { borderColor: subject.accent }]}
          accessibilityRole="button"
          accessibilityLabel={tutorOpen ? 'Close AI tutor' : 'Open AI tutor'}
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

        {/* Sheet overlays the lesson body; footer stays available to change cards. */}
        <TutorSheet
          visible={tutorOpen}
          onClose={closeTutor}
          conversation={tutorConversation}
          contextLabel={lesson.title}
          cardLabel={tutorCardLabel}
          accent={subject.accent}
          onKeyboardChange={setTutorKeyboardUp}
        />
      </View>

      {/* Hide footer only while the tutor keyboard is up so the sheet owns that space. */}
      {!tutorKeyboardUp ? (
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {isQuestion && revealed ? (
          <Explanation card={card} correct={wasCardCorrect(card, selected)} />
        ) : null}
        <View style={styles.navRow}>
          {canGoBack ? (
            <Pressable onPress={goBack} style={[styles.navBtn, styles.navBtnBack]}>
              <Ionicons name="arrow-back" size={18} color={colors.text} />
              <Text style={styles.navBtnBackText}>Back</Text>
            </Pressable>
          ) : (
            <View style={styles.navBtnPlaceholder} />
          )}
          <Pressable
            disabled={!canContinue || finishInFlight.current}
            onPress={advance}
            style={[
              styles.navBtn,
              styles.navBtnForward,
              { backgroundColor: canContinue ? subject.accent : colors.surfaceAlt },
            ]}
          >
            <Text
              style={[
                styles.navBtnForwardText,
                { color: canContinue ? colors.bg : colors.textFaint },
              ]}
            >
              {isLastSlide
                ? 'Finish lesson'
                : isQuestion && !revealed
                  ? 'Select an answer'
                  : 'Forward'}
            </Text>
            {canContinue ? (
              <Ionicons
                name={isLastSlide ? 'checkmark' : 'arrow-forward'}
                size={18}
                color={colors.bg}
              />
            ) : null}
          </Pressable>
        </View>
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
  canSchedule,
  scheduleStatus,
  scheduleMessage,
  scheduleLabel,
  onSchedule,
  onDone,
}: {
  subjectGradient: [string, string];
  subjectAccent: string;
  lessonTitle: string;
  xp: number;
  correct: number;
  total: number;
  canSchedule: boolean;
  scheduleStatus: 'idle' | 'scheduling' | 'scheduled' | 'error' | 'unavailable';
  scheduleMessage: string | null;
  scheduleLabel: string;
  onSchedule: () => void;
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
      <View style={[styles.completionBadge, { borderColor: `${subjectAccent}88` }]}>
        <Ionicons name="planet" size={52} color={colors.white} />
      </View>
      <Text style={styles.completionEyebrow}>Destination illuminated</Text>
      <Text style={styles.completionTitle}>Lesson complete</Text>
      <Text style={styles.completionLesson} numberOfLines={2}>
        {lessonTitle}
      </Text>

      <View style={styles.statRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>+{xp}</Text>
          <Text style={styles.statLabel}>Stellar energy</Text>
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

      {canSchedule ? (
        <View style={styles.scheduleBox}>
          <Text style={styles.scheduleTitle}>Schedule recall practice</Text>
          <Text style={styles.scheduleText}>
            Review prompts will appear in Retrieve when due.
          </Text>
          <Pressable
            onPress={onSchedule}
            disabled={scheduleStatus === 'scheduling' || scheduleStatus === 'scheduled'}
            style={[
              styles.scheduleBtn,
              scheduleStatus === 'scheduled' && styles.scheduleBtnDone,
            ]}
          >
            <Ionicons
              name={scheduleStatus === 'scheduled' ? 'checkmark-circle' : 'calendar-outline'}
              size={17}
              color={colors.bg}
            />
            <Text style={styles.scheduleBtnText} numberOfLines={1}>
              {scheduleStatus === 'scheduling'
                ? 'Adding…'
                : scheduleStatus === 'scheduled'
                  ? scheduleMessage ?? 'Added to review'
                  : scheduleLabel}
            </Text>
          </Pressable>
          {scheduleStatus === 'error' || scheduleStatus === 'unavailable' ? (
            <Text style={styles.scheduleError}>{scheduleMessage}</Text>
          ) : null}
        </View>
      ) : null}

        <Pressable
          onPress={onDone}
          style={[styles.completionBtn, { marginBottom: insets.bottom + spacing.md }]}
        >
          <Text style={styles.completionBtnText}>Done</Text>
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
  body: { flex: 1, position: 'relative', overflow: 'hidden' },

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
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  navBtnPlaceholder: { width: 96 },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
  },
  navBtnBack: {
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 96,
  },
  navBtnBackText: {
    color: colors.text,
    fontSize: font.size.md,
    fontWeight: font.weight.heavy as '800',
  },
  navBtnForward: {
    flex: 1,
  },
  navBtnForwardText: {
    fontSize: font.size.md,
    fontWeight: font.weight.heavy as '800',
  },

  completionBadge: {
    width: 110,
    height: 110,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  completionEyebrow: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    fontWeight: font.weight.bold as '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
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
    minWidth: 0,
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
    textAlign: 'center',
  },
  scheduleBox: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  scheduleTitle: {
    color: colors.white,
    fontSize: font.size.md,
    fontWeight: font.weight.heavy as '800',
  },
  scheduleText: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: font.size.sm,
    lineHeight: 20,
  },
  scheduleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
  },
  scheduleBtnDone: {
    backgroundColor: colors.success,
  },
  scheduleBtnText: {
    color: colors.bg,
    fontSize: font.size.sm,
    fontWeight: font.weight.heavy as '800',
    flexShrink: 1,
  },
  scheduleError: {
    color: colors.white,
    fontSize: font.size.xs,
    lineHeight: 17,
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
