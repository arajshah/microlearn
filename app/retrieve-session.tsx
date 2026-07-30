import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { consumeRetrievalSessionCache } from '@/retrieval/sessionCache';
import {
  finishRetrievalSession,
  recordRetrievalAttempt,
  ServerRetrievalItem,
  ServerRetrievalRating,
} from '@/services/microlearnServer';
import { trackReviewAttempted } from '@/services/learningTelemetry';
import { normalizeConceptSlug } from '@/utils/conceptTags';
import { colors, font, radius, spacing } from '@/theme/theme';

const RATINGS: { id: ServerRetrievalRating; label: string; tint: string }[] = [
  { id: 'forgot', label: 'Forgot', tint: colors.danger },
  { id: 'partial', label: 'Partial', tint: colors.warning },
  { id: 'remembered', label: 'Remembered', tint: colors.success },
  { id: 'easy', label: 'Easy', tint: colors.primary },
];

function sessionQuality(forgot: number, partial: number, total: number): {
  label: string;
  note: string;
} {
  if (total <= 0) return { label: 'Complete', note: 'Session saved.' };
  if (forgot === 0 && partial === 0) {
    return { label: 'Perfect', note: 'Every item recalled cleanly. Your memory is holding strong.' };
  }
  if (forgot <= 1 && forgot + partial <= Math.ceil(total * 0.3)) {
    return { label: 'Strong', note: 'Solid session. A few prompts will return sooner for reinforcement.' };
  }
  return { label: 'Needs review', note: 'Focus on harder prompts next time. Retrieval is how memory sticks.' };
}

export default function RetrieveSessionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const cached = useMemo(
    () => (sessionId ? consumeRetrievalSessionCache(sessionId) : null),
    [sessionId],
  );

  const itemsRef = useRef<ServerRetrievalItem[]>(cached?.items ?? []);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [responseText, setResponseText] = useState('');
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [summary, setSummary] = useState(cached?.session ?? null);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [unlockedBanner, setUnlockedBanner] = useState<string | null>(null);
  const startedAt = useRef(Date.now());

  const items = itemsRef.current;
  const current = items[index];
  const total = items.length;

  if (!sessionId || !cached || total === 0) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
        <Text style={styles.title}>Session unavailable</Text>
        <Text style={styles.sub}>Start a new retrieval session from the Retrieve tab.</Text>
        <Pressable onPress={() => router.back()} style={styles.doneBtn}>
          <Text style={styles.doneText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const onRate = async (rating: ServerRetrievalRating) => {
    if (!current || submitting) return;
    setSubmitting(true);
    setError(null);
    const durationMs = Date.now() - startedAt.current;
    const result = await recordRetrievalAttempt({
      sessionId,
      itemId: current.id,
      rating,
      responseText: (selectedChoice ?? responseText.trim()) || undefined,
      durationMs,
    });
    setSubmitting(false);

    if (!result) {
      setError('Could not save your rating. Tap the button again to retry.');
      return;
    }

    trackReviewAttempted({
      lessonId: current.lessonId ?? undefined,
      roadmapId: current.roadmapId ?? undefined,
      itemId: current.id,
      conceptSlug: current.concept ? normalizeConceptSlug(current.concept) : undefined,
      correct: rating === 'remembered' || rating === 'easy',
      rating,
      responseTimeMs: durationMs,
    });

    const nextCombo =
      rating === 'remembered' || rating === 'easy' ? combo + 1 : 0;
    setCombo(nextCombo);
    setMaxCombo((m) => Math.max(m, nextCombo));

    const unlocked = (result as { unlocked?: string[] }).unlocked;
    if (unlocked?.length) {
      setUnlockedBanner(unlocked[unlocked.length - 1].replace(/_/g, ' '));
    }

    if (index >= total - 1) {
      const session = await finishRetrievalSession(sessionId);
      if (session) setSummary(session);
      setFinished(true);
      return;
    }

    setIndex((i) => i + 1);
    setRevealed(false);
    setResponseText('');
    setSelectedChoice(null);
    startedAt.current = Date.now();
  };

  const quality = sessionQuality(
    summary?.forgotCount ?? 0,
    summary?.partialCount ?? 0,
    summary?.totalItems ?? total,
  );

  if (finished) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.xl, paddingHorizontal: spacing.lg }]}>
        <Text style={styles.title}>Session complete</Text>
        <View style={styles.qualityBadge}>
          <Text style={styles.qualityLabel}>{quality.label}</Text>
          <Text style={styles.qualityNote}>{quality.note}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLine}>Remembered: {summary?.rememberedCount ?? 0}</Text>
          <Text style={styles.summaryLine}>Partial: {summary?.partialCount ?? 0}</Text>
          <Text style={styles.summaryLine}>Forgot: {summary?.forgotCount ?? 0}</Text>
          {maxCombo > 1 ? (
            <Text style={styles.summaryLine}>Best combo: {maxCombo}</Text>
          ) : null}
          <Text style={styles.summaryNote}>
            Your schedule is updated. Harder prompts will return sooner.
          </Text>
        </View>
        {unlockedBanner ? (
          <View style={styles.unlockBanner}>
            <Ionicons name="ribbon" size={18} color={colors.xp} />
            <Text style={styles.unlockText}>Achievement: {unlockedBanner}</Text>
          </View>
        ) : null}
        <Pressable onPress={() => router.back()} style={styles.doneBtn}>
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="close" size={24} color={colors.textMuted} />
        </Pressable>
        <Text style={styles.progress}>
          Question {index + 1} of {total}
        </Text>
        {combo >= 2 ? (
          <View style={styles.comboChip}>
            <Text style={styles.comboText}>{combo}×</Text>
          </View>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.prompt}>{current.prompt}</Text>

        {current.choices?.length ? (
          <View style={styles.choiceList}>
            {current.choices.map((choice) => {
              const selected = selectedChoice === choice;
              const correct = revealed && current.answer === choice;
              return (
                <Pressable
                  key={choice}
                  onPress={() => {
                    if (revealed) return;
                    setSelectedChoice(choice);
                    setRevealed(true);
                  }}
                  style={[
                    styles.choiceBtn,
                    selected && styles.choiceSelected,
                    correct && styles.choiceCorrect,
                  ]}
                >
                  <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
                    {choice}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <TextInput
            value={responseText}
            onChangeText={setResponseText}
            placeholder="Optional: think first, or jot a short answer"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            multiline
            editable={!revealed}
          />
        )}

        {!revealed ? (
          <Pressable onPress={() => setRevealed(true)} style={styles.revealBtn}>
            <Text style={styles.revealText}>Reveal answer</Text>
          </Pressable>
        ) : (
          <View style={styles.answerBox}>
            {current.answer ? <Text style={styles.answerTitle}>{current.answer}</Text> : null}
            {current.explanation ? (
              <Text style={styles.answerSub}>{current.explanation}</Text>
            ) : null}
          </View>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {revealed ? (
          <View style={styles.ratingRow}>
            {RATINGS.map((r) => (
              <Pressable
                key={r.id}
                onPress={() => onRate(r.id)}
                disabled={submitting}
                style={[styles.rateBtn, { borderColor: r.tint }]}
              >
                {submitting ? (
                  <ActivityIndicator color={r.tint} size="small" />
                ) : (
                  <Text style={[styles.rateText, { color: r.tint }]}>{r.label}</Text>
                )}
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  progress: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold as '600',
  },
  comboChip: {
    backgroundColor: `${colors.streak}33`,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  comboText: {
    color: colors.streak,
    fontWeight: font.weight.heavy as '800',
    fontSize: font.size.sm,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  title: {
    color: colors.text,
    fontSize: font.size.xxl,
    fontWeight: font.weight.heavy as '800',
  },
  sub: { color: colors.textMuted, fontSize: font.size.sm, marginTop: spacing.sm },
  prompt: {
    color: colors.text,
    fontSize: font.size.xl,
    fontWeight: font.weight.bold as '700',
    lineHeight: 28,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.lg,
    color: colors.text,
    minHeight: 88,
    textAlignVertical: 'top',
  },
  choiceList: {
    gap: spacing.sm,
  },
  choiceBtn: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.lg,
  },
  choiceSelected: {
    borderColor: colors.retrieve,
    backgroundColor: `${colors.retrieve}22`,
  },
  choiceCorrect: {
    borderColor: colors.success,
    backgroundColor: `${colors.success}22`,
  },
  choiceText: {
    color: colors.text,
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold as '600',
  },
  choiceTextSelected: {
    color: colors.text,
  },
  revealBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.retrieve,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
  },
  revealText: { color: colors.bg, fontWeight: font.weight.bold as '700' },
  answerBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  answerTitle: { color: colors.text, fontSize: font.size.md, fontWeight: font.weight.bold as '700' },
  answerSub: { color: colors.textMuted, fontSize: font.size.sm, lineHeight: 20 },
  ratingRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  rateBtn: {
    flexGrow: 1,
    minWidth: '47%',
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  rateText: { fontWeight: font.weight.heavy as '800', fontSize: font.size.sm },
  error: { color: colors.danger, fontSize: font.size.sm },
  qualityBadge: {
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.retrieve,
    gap: spacing.xs,
  },
  qualityLabel: {
    color: colors.retrieve,
    fontSize: font.size.lg,
    fontWeight: font.weight.heavy as '800',
  },
  qualityNote: { color: colors.textMuted, fontSize: font.size.sm, lineHeight: 20 },
  summaryCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  summaryLine: { color: colors.text, fontSize: font.size.md },
  summaryNote: { color: colors.textMuted, fontSize: font.size.sm, marginTop: spacing.md, lineHeight: 20 },
  unlockBanner: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.xp,
  },
  unlockText: { color: colors.text, fontSize: font.size.sm, fontWeight: font.weight.semibold as '600' },
  doneBtn: {
    marginTop: spacing.xl,
    backgroundColor: colors.retrieve,
    paddingVertical: spacing.lg,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  doneText: { color: colors.bg, fontWeight: font.weight.heavy as '800', fontSize: font.size.md },
});
