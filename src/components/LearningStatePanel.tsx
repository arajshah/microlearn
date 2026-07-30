import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { GlassCard, SectionHeader } from '@/components/ui';
import {
  fetchLearningState,
  isServerConfigured,
  ServerLearningSnapshot,
  ServerNextAction,
} from '@/services/microlearnServer';
import { colors, font, radius, spacing } from '@/theme/theme';

const ACTION_LABELS: Record<ServerNextAction['action'], string> = {
  continue_lesson: 'Continue next lesson',
  review_due_concepts: 'Review due concepts',
  generate_remediation: 'Generate a remediation lesson',
  run_diagnostic: 'Run a quick diagnostic',
  start_new_roadmap: 'Create a new roadmap',
};

function conceptLabel(slug: string): string {
  return slug.split('-').filter(Boolean).join(' ');
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ConceptRow({
  slug,
  right,
  tint,
}: {
  slug: string;
  right: string;
  tint: string;
}) {
  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: tint }]} />
      <Text style={styles.rowLabel} numberOfLines={1}>
        {conceptLabel(slug)}
      </Text>
      <Text style={[styles.rowValue, { color: tint }]}>{right}</Text>
    </View>
  );
}

/** Adaptive learning state: mastery stats, weak concepts, due reviews, next action. */
export function LearningStatePanel() {
  const serverEnabled = isServerConfigured();
  const [snapshot, setSnapshot] = useState<ServerLearningSnapshot | null>(null);
  const [loading, setLoading] = useState(serverEnabled);

  const load = useCallback(async () => {
    if (!serverEnabled) return;
    setLoading(true);
    try {
      setSnapshot(await fetchLearningState());
    } finally {
      setLoading(false);
    }
  }, [serverEnabled]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!serverEnabled) return null;

  const nextAction = snapshot?.recommendedNextActions?.[0];

  return (
    <View style={styles.wrap}>
      <SectionHeader
        title="Learning state"
        right={
          <Pressable onPress={load} hitSlop={8}>
            <Ionicons name="refresh" size={16} color={colors.textFaint} />
          </Pressable>
        }
      />

      <GlassCard>
        <View style={styles.card}>
        {loading && !snapshot ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : !snapshot ? (
          <Text style={styles.empty}>
            Learning state is unavailable. Start the local server to track concept mastery.
          </Text>
        ) : (
          <>
            <Text style={styles.summary}>{snapshot.summary}</Text>

            <View style={styles.statsRow}>
              <Stat label="Lessons" value={String(snapshot.stats.lessonsCompleted)} />
              <Stat label="Answers" value={String(snapshot.stats.cardsAnswered)} />
              <Stat
                label="Accuracy"
                value={
                  snapshot.stats.accuracy == null
                    ? '—'
                    : `${Math.round(snapshot.stats.accuracy * 100)}%`
                }
              />
              <Stat label="Concepts" value={String(snapshot.stats.activeConcepts)} />
            </View>

            {nextAction ? (
              <View style={styles.nextAction}>
                <Ionicons name="compass-outline" size={16} color={colors.primary} />
                <View style={styles.nextActionText}>
                  <Text style={styles.nextActionTitle}>{ACTION_LABELS[nextAction.action]}</Text>
                  <Text style={styles.nextActionReason}>{nextAction.reason}</Text>
                </View>
              </View>
            ) : null}

            {snapshot.weakestConcepts.length > 0 ? (
              <View style={styles.group}>
                <Text style={styles.groupTitle}>Weakest concepts</Text>
                {snapshot.weakestConcepts.slice(0, 4).map((c) => (
                  <ConceptRow
                    key={c.conceptSlug}
                    slug={c.conceptSlug}
                    right={`${Math.round(c.masteryScore * 100)}%`}
                    tint={colors.danger}
                  />
                ))}
              </View>
            ) : null}

            {snapshot.strongestConcepts.length > 0 ? (
              <View style={styles.group}>
                <Text style={styles.groupTitle}>Strongest concepts</Text>
                {snapshot.strongestConcepts.slice(0, 3).map((c) => (
                  <ConceptRow
                    key={c.conceptSlug}
                    slug={c.conceptSlug}
                    right={`${Math.round(c.masteryScore * 100)}%`}
                    tint={colors.success}
                  />
                ))}
              </View>
            ) : null}

            {snapshot.dueReviews.length > 0 ? (
              <View style={styles.group}>
                <Text style={styles.groupTitle}>Due for review ({snapshot.dueReviews.length})</Text>
                {snapshot.dueReviews.slice(0, 4).map((c) => (
                  <ConceptRow
                    key={c.conceptSlug}
                    slug={c.conceptSlug}
                    right={`${Math.round(c.masteryScore * 100)}%`}
                    tint={colors.warning}
                  />
                ))}
              </View>
            ) : null}

            {snapshot.openRemediations.length > 0 ? (
              <View style={styles.group}>
                <Text style={styles.groupTitle}>Open remediation</Text>
                {snapshot.openRemediations.slice(0, 3).map((r) => (
                  <ConceptRow
                    key={r.id}
                    slug={r.conceptSlug}
                    right={`sev ${r.severity.toFixed(2)}`}
                    tint={colors.warning}
                  />
                ))}
              </View>
            ) : null}
          </>
        )}
        </View>
      </GlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  card: { gap: spacing.md },
  center: { paddingVertical: spacing.xl, alignItems: 'center' },
  empty: { color: colors.textFaint, fontSize: font.size.sm, lineHeight: 20 },
  summary: { color: colors.textMuted, fontSize: font.size.sm, lineHeight: 20 },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  stat: {
    flex: 1,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    gap: 2,
  },
  statValue: { color: colors.text, fontSize: font.size.lg, fontWeight: '800' },
  statLabel: { color: colors.textFaint, fontSize: font.size.xs },
  nextAction: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  nextActionText: { flex: 1, gap: 2 },
  nextActionTitle: { color: colors.text, fontSize: font.size.sm, fontWeight: '700' },
  nextActionReason: { color: colors.textFaint, fontSize: font.size.xs, lineHeight: 16 },
  group: { gap: spacing.xs },
  groupTitle: {
    color: colors.textFaint,
    fontSize: font.size.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 6, height: 6, borderRadius: 3 },
  rowLabel: { flex: 1, color: colors.text, fontSize: font.size.sm, textTransform: 'capitalize' },
  rowValue: { fontSize: font.size.sm, fontWeight: '700' },
});
