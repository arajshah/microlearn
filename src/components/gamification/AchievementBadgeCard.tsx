import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ServerAchievement } from '@/services/microlearnServer';
import { colors, font, radius, spacing } from '@/theme/theme';

const TIER_COLORS: Record<string, string> = {
  bronze: '#CD7F32',
  silver: '#94A3B8',
  gold: '#FACC15',
  legendary: '#A78BFA',
};

export function AchievementBadgeCard({ achievement }: { achievement: ServerAchievement }) {
  const accent = achievement.accent ?? TIER_COLORS[achievement.tier] ?? colors.primary;
  const icon = (achievement.icon ?? 'ribbon') as keyof typeof Ionicons.glyphMap;

  return (
    <View
      style={[
        styles.card,
        achievement.unlocked ? styles.unlocked : styles.locked,
        achievement.unlocked && { borderColor: accent },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: achievement.unlocked ? `${accent}33` : colors.surfaceAlt }]}>
        <Ionicons
          name={icon}
          size={22}
          color={achievement.unlocked ? accent : colors.textFaint}
        />
      </View>
      <Text style={[styles.title, !achievement.unlocked && styles.titleLocked]} numberOfLines={1}>
        {achievement.title}
      </Text>
      <Text style={styles.meta}>
        {achievement.category} · {achievement.tier}
      </Text>
      {!achievement.unlocked ? (
        <Text style={styles.desc} numberOfLines={2}>
          {achievement.description}
        </Text>
      ) : (
        <Text style={styles.unlockedLabel}>Unlocked</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '47.5%',
    flexGrow: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 4,
    borderWidth: 1,
    backgroundColor: colors.surface,
  },
  unlocked: { borderColor: colors.borderSoft },
  locked: { borderColor: colors.borderSoft, opacity: 0.85 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  title: {
    color: colors.text,
    fontSize: font.size.sm,
    fontWeight: font.weight.bold as '700',
  },
  titleLocked: { color: colors.textMuted },
  meta: {
    color: colors.textFaint,
    fontSize: font.size.xs,
    textTransform: 'capitalize',
  },
  desc: {
    color: colors.textFaint,
    fontSize: font.size.xs,
    lineHeight: 15,
    marginTop: 2,
  },
  unlockedLabel: {
    color: colors.success,
    fontSize: font.size.xs,
    fontWeight: font.weight.bold as '700',
    marginTop: 2,
  },
});
