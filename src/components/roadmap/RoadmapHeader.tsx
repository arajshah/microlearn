import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DEPTH_LABELS } from '@/types/roadmap';
import { GeneratedRoadmap } from '@/types/roadmap';
import { roadmapStats } from '@/utils/roadmapProgress';
import { colors, font, radius, spacing } from '@/theme/theme';
import { ProgressBar } from '@/components/ProgressBar';

interface Props {
  roadmap: GeneratedRoadmap;
  onContinue: () => void;
}

export function RoadmapHeader({ roadmap, onContinue }: Props) {
  const { completed, total, pct, remainingMinutes } = roadmapStats(roadmap);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{roadmap.title}</Text>
      <Text style={styles.goalLabel}>Goal</Text>
      <Text style={styles.goal}>{roadmap.goal}</Text>

      <View style={styles.metaRow}>
        <View style={styles.metaChip}>
          <Text style={styles.metaText}>Level {roadmap.masteryLevel}</Text>
        </View>
        <View style={styles.metaChip}>
          <Text style={styles.metaText}>{DEPTH_LABELS[roadmap.depth]}</Text>
        </View>
      </View>

      <View style={styles.progressBlock}>
        <View style={styles.progressRow}>
          <Text style={styles.progressLabel}>
            {completed} of {total} lessons completed
          </Text>
          <Text style={styles.progressPct}>{Math.round(pct * 100)}%</Text>
        </View>
        <ProgressBar progress={pct} color={colors.primary} height={8} />
        <Text style={styles.remaining}>
          Estimated time remaining: {remainingMinutes} min
        </Text>
      </View>

      <Pressable onPress={onContinue} style={styles.continueBtn}>
        <Text style={styles.continueText}>Continue</Text>
        <Ionicons name="arrow-forward" size={18} color={colors.bg} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: font.size.xxl,
    fontWeight: font.weight.heavy as '800',
    letterSpacing: -0.3,
  },
  goalLabel: {
    color: colors.textFaint,
    fontSize: font.size.xs,
    fontWeight: font.weight.bold as '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: spacing.sm,
  },
  goal: { color: colors.textMuted, fontSize: font.size.sm, lineHeight: 20 },
  metaRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  metaChip: {
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  metaText: {
    color: colors.textMuted,
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold as '600',
  },
  progressBlock: { gap: spacing.sm, marginTop: spacing.md },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: {
    color: colors.text,
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold as '600',
  },
  progressPct: {
    color: colors.primary,
    fontSize: font.size.sm,
    fontWeight: font.weight.bold as '700',
  },
  remaining: { color: colors.textFaint, fontSize: font.size.xs },
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    marginTop: spacing.md,
  },
  continueText: {
    color: colors.bg,
    fontSize: font.size.md,
    fontWeight: font.weight.heavy as '800',
  },
});
