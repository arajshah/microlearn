import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GeneratedRoadmap } from '@/types/roadmap';
import { continueNode, roadmapStats } from '@/utils/roadmapProgress';
import { colors, font, radius, spacing } from '@/theme/theme';
import { ProgressBar } from '@/components/ProgressBar';

interface Props {
  roadmap: GeneratedRoadmap;
  onPress: () => void;
  compact?: boolean;
}

export function RoadmapContinueCard({ roadmap, onPress, compact }: Props) {
  const stats = roadmapStats(roadmap);
  const next = continueNode(roadmap);
  const complete = stats.completed >= stats.total;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, compact && styles.cardCompact, pressed && { opacity: 0.9 }]}
    >
      <View style={styles.topRow}>
        <View style={styles.iconWrap}>
          <Ionicons name="map" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>{complete ? 'Your roadmap' : 'Continue learning'}</Text>
          <Text style={styles.title} numberOfLines={2}>
            {roadmap.title}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
      </View>

      {!complete && next ? (
        <Text style={styles.next} numberOfLines={1}>
          Up next: {next.title}
        </Text>
      ) : null}

      <View style={styles.progressRow}>
        <ProgressBar progress={stats.pct} color={colors.primary} height={compact ? 5 : 6} />
        <Text style={styles.progressText}>
          {stats.completed}/{stats.total}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    gap: spacing.sm,
  },
  cardCompact: { padding: spacing.md },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kicker: {
    color: colors.primary,
    fontSize: font.size.xs,
    fontWeight: font.weight.bold as '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  title: {
    color: colors.text,
    fontSize: font.size.md,
    fontWeight: font.weight.heavy as '800',
    marginTop: 2,
  },
  next: { color: colors.textMuted, fontSize: font.size.sm },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: 2 },
  progressText: {
    color: colors.textFaint,
    fontSize: font.size.xs,
    fontWeight: font.weight.bold as '700',
    minWidth: 36,
    textAlign: 'right',
  },
});
