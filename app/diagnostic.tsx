import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProgressBar } from '@/components/ProgressBar';
import {
  createDiagnosticSession,
  finishDiagnosticSession,
  isServerConfigured,
  ServerDiagnosticSession,
  submitDiagnosticAnswer,
} from '@/services/microlearnServer';
import { colors, font, radius, spacing } from '@/theme/theme';

function firstParam(value: unknown): string | undefined {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : undefined;
  return typeof value === 'string' ? value : undefined;
}

interface DiagnosticResult {
  accuracy: number | null;
  strengths: string[];
  weaknesses: string[];
}

/**
 * Optional pre-roadmap diagnostic. Never blocks learning: the user can skip at
 * any point, and a missing/unreachable server falls back to a dismissible notice.
 */
export default function DiagnosticScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ roadmapId?: string; topic?: string }>();
  const roadmapId = firstParam(params.roadmapId);
  const topic = firstParam(params.topic);

  const [session, setSession] = useState<ServerDiagnosticSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const shownAt = useRef(Date.now());

  const start = useCallback(async () => {
    if (!isServerConfigured()) {
      setError('Connect the local server to run a diagnostic.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const created = await createDiagnosticSession({ roadmapId, topic });
    if (!created || created.items.length === 0) {
      setError('Could not build a diagnostic for this roadmap yet. Start learning instead.');
      setLoading(false);
      return;
    }
    setSession(created);
    setLoading(false);
  }, [roadmapId, topic]);

  useEffect(() => {
    void start();
  }, [start]);

  useEffect(() => {
    shownAt.current = Date.now();
  }, [index]);

  const item = session?.items[index];
  const total = session?.items.length ?? 0;

  const onSelect = async (optionIndex: number) => {
    if (!session || !item || revealed || submitting) return;
    setSelected(optionIndex);
    setSubmitting(true);
    const response = await submitDiagnosticAnswer({
      sessionId: session.id,
      itemId: item.id,
      selectedIndex: optionIndex,
      responseTimeMs: Date.now() - shownAt.current,
    });
    setSubmitting(false);
    setRevealed(true);
    setExplanation(response?.explanation ?? null);
    Haptics.notificationAsync(
      response?.correct
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Error,
    ).catch(() => {});
  };

  const advance = async () => {
    if (!session) return;
    if (index >= total - 1) {
      setSubmitting(true);
      const finished = await finishDiagnosticSession(session.id);
      setSubmitting(false);
      setResult(finished ?? { accuracy: null, strengths: [], weaknesses: [] });
      return;
    }
    setIndex((i) => i + 1);
    setSelected(null);
    setRevealed(false);
    setExplanation(null);
  };

  if (loading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.sub}>Building your diagnostic…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top + spacing.xl }]}>
        <Ionicons name="information-circle-outline" size={32} color={colors.textFaint} />
        <Text style={styles.sub}>{error}</Text>
        <Pressable onPress={() => router.back()} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>Skip diagnostic</Text>
        </Pressable>
      </View>
    );
  }

  if (result) {
    return (
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl },
        ]}
      >
        <Text style={styles.kicker}>DIAGNOSTIC COMPLETE</Text>
        <Text style={styles.title}>
          {result.accuracy == null ? 'Baseline saved' : `${Math.round(result.accuracy * 100)}% baseline`}
        </Text>
        <Text style={styles.sub}>
          Your concept mastery has been updated. Lessons will target weak areas first.
        </Text>

        {result.weaknesses.length > 0 ? (
          <View style={styles.resultGroup}>
            <Text style={styles.groupTitle}>Needs work</Text>
            {result.weaknesses.map((slug) => (
              <Text key={slug} style={[styles.resultItem, { color: colors.danger }]}>
                • {slug.split('-').join(' ')}
              </Text>
            ))}
          </View>
        ) : null}

        {result.strengths.length > 0 ? (
          <View style={styles.resultGroup}>
            <Text style={styles.groupTitle}>Already solid</Text>
            {result.strengths.map((slug) => (
              <Text key={slug} style={[styles.resultItem, { color: colors.success }]}>
                • {slug.split('-').join(' ')}
              </Text>
            ))}
          </View>
        ) : null}

        <Pressable onPress={() => router.back()} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>Start learning</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (!item) return null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.skip}>Skip</Text>
        </Pressable>
        <Text style={styles.counter}>
          {index + 1} / {total}
        </Text>
      </View>
      <ProgressBar progress={(index + (revealed ? 1 : 0)) / total} />

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>QUICK DIAGNOSTIC</Text>
        <Text style={styles.question}>{item.question}</Text>

        {item.options.map((option, optionIndex) => {
          const isSelected = selected === optionIndex;
          const isAnswer = revealed && optionIndex === item.answerIndex;
          const isWrong = revealed && isSelected && optionIndex !== item.answerIndex;
          return (
            <Pressable
              key={`${optionIndex}-${option}`}
              disabled={revealed || submitting}
              onPress={() => onSelect(optionIndex)}
              style={[
                styles.option,
                isSelected && styles.optionSelected,
                isAnswer && styles.optionCorrect,
                isWrong && styles.optionWrong,
              ]}
            >
              <Text style={styles.optionText}>{option}</Text>
            </Pressable>
          );
        })}

        {revealed && explanation ? <Text style={styles.explanation}>{explanation}</Text> : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Pressable
          disabled={!revealed || submitting}
          onPress={advance}
          style={[styles.primaryBtn, (!revealed || submitting) && styles.primaryBtnDisabled]}
        >
          <Text style={styles.primaryBtnText}>
            {index >= total - 1 ? 'Finish diagnostic' : 'Next question'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  skip: { color: colors.textFaint, fontSize: font.size.sm, fontWeight: '700' },
  counter: { color: colors.textFaint, fontSize: font.size.sm },
  content: { padding: spacing.lg, gap: spacing.md },
  kicker: {
    color: colors.primary,
    fontSize: font.size.xs,
    fontWeight: '800',
    letterSpacing: 1,
  },
  title: { color: colors.text, fontSize: font.size.xxl, fontWeight: '800' },
  question: { color: colors.text, fontSize: font.size.lg, fontWeight: '700', lineHeight: 26 },
  sub: { color: colors.textMuted, fontSize: font.size.sm, lineHeight: 20, textAlign: 'center' },
  option: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  optionSelected: { borderColor: colors.primary },
  optionCorrect: { borderColor: colors.success, backgroundColor: `${colors.success}18` },
  optionWrong: { borderColor: colors.danger, backgroundColor: `${colors.danger}18` },
  optionText: { color: colors.text, fontSize: font.size.sm, lineHeight: 20 },
  explanation: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    lineHeight: 20,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  footer: { padding: spacing.lg, gap: spacing.sm },
  resultGroup: { gap: spacing.xs },
  groupTitle: {
    color: colors.textFaint,
    fontSize: font.size.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  resultItem: { fontSize: font.size.sm, textTransform: 'capitalize' },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  primaryBtnDisabled: { backgroundColor: colors.surfaceAlt },
  primaryBtnText: { color: colors.bg, fontSize: font.size.md, fontWeight: '800' },
});
