import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, spacing } from '@/theme/theme';

type BadgeTier = 'bronze' | 'silver' | 'gold' | 'legendary';

export interface AchievementBadgeData {
  id: string;
  title: string;
  description: string;
  icon?: string;
  category?: string;
  tier?: string;
  accent?: string;
  unlocked: boolean;
  progress?: number;
  progressValue?: number;
}

interface TierStyle {
  label: string;
  accent: string;
  cardGradient: readonly [string, string];
  planetGradient: readonly [string, string];
}

const TIER_STYLES: Record<BadgeTier, TierStyle> = {
  bronze: {
    label: 'Ember',
    accent: '#FF9D5C',
    cardGradient: ['#2A1C1A', '#151A27'],
    planetGradient: ['#FFB36B', '#B94122'],
  },
  silver: {
    label: 'Nova',
    accent: '#B9CEFF',
    cardGradient: ['#1B273D', '#141A28'],
    planetGradient: ['#EDF4FF', '#718ABD'],
  },
  gold: {
    label: 'Supernova',
    accent: '#FFD966',
    cardGradient: ['#302714', '#171A24'],
    planetGradient: ['#FFF19A', '#F59E0B'],
  },
  legendary: {
    label: 'Singularity',
    accent: '#70E1F5',
    cardGradient: ['#241A3C', '#102632'],
    planetGradient: ['#A78BFA', '#22D3EE'],
  },
};

const LOCAL_TIERS: Record<string, BadgeTier> = {
  'first-step': 'bronze',
  'curious-five': 'bronze',
  'streak-3': 'bronze',
  'xp-250': 'silver',
  perfect: 'silver',
  'streak-7': 'gold',
  polymath: 'gold',
  'xp-1000': 'legendary',
  'subject-master': 'legendary',
};

function badgeTier(achievement: AchievementBadgeData): BadgeTier {
  if (achievement.tier === 'bronze' || achievement.tier === 'silver' || achievement.tier === 'gold') {
    return achievement.tier;
  }
  if (achievement.tier === 'legendary') return 'legendary';
  return LOCAL_TIERS[achievement.id] ?? 'bronze';
}

function badgeProgress(achievement: AchievementBadgeData): number {
  if (achievement.unlocked) return 1;
  const value = achievement.progress ?? achievement.progressValue ?? 0;
  return Math.max(0, Math.min(1, value));
}

export function AchievementBadgeCard({
  achievement,
  reduceMotion = false,
}: {
  achievement: AchievementBadgeData;
  reduceMotion?: boolean;
}) {
  const tier = useMemo(() => TIER_STYLES[badgeTier(achievement)], [achievement]);
  const progress = badgeProgress(achievement);
  const progressPercent = Math.round(progress * 100);
  const accent = achievement.accent ?? tier.accent;
  const icon = (achievement.icon ?? 'ribbon') as keyof typeof Ionicons.glyphMap;
  const reveal = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    reveal.stopAnimation();
    if (!achievement.unlocked || reduceMotion) {
      reveal.setValue(1);
      return;
    }

    reveal.setValue(0);
    const animation = Animated.spring(reveal, {
      toValue: 1,
      speed: 16,
      bounciness: 5,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [achievement.unlocked, reduceMotion, reveal]);

  const content = (
    <>
      <View style={styles.topRow}>
        <View style={styles.planetStage}>
          <View style={[styles.orbit, { borderColor: achievement.unlocked ? `${accent}88` : colors.border }]} />
          {achievement.unlocked ? (
            <LinearGradient colors={tier.planetGradient} style={styles.planet}>
              <Ionicons name={icon} size={24} color={colors.bg} />
            </LinearGradient>
          ) : (
            <View style={styles.lockedPlanet}>
              <Ionicons name={icon} size={22} color={colors.textFaint} />
            </View>
          )}
        </View>

        <View style={styles.topMeta}>
          <View style={[styles.tierPill, { borderColor: `${accent}66` }]}>
            <Ionicons name="planet-outline" size={12} color={achievement.unlocked ? accent : colors.textFaint} />
            <Text style={[styles.tierText, achievement.unlocked && { color: accent }]}>
              {tier.label}
            </Text>
          </View>
          <View style={styles.stateRow}>
            <Ionicons
              name={achievement.unlocked ? 'checkmark-circle' : 'lock-closed'}
              size={13}
              color={achievement.unlocked ? colors.success : colors.textFaint}
            />
            <Text style={[styles.stateText, achievement.unlocked && styles.stateTextUnlocked]}>
              {achievement.unlocked ? 'Discovered' : 'Undiscovered'}
            </Text>
          </View>
        </View>
      </View>

      <Text style={[styles.title, !achievement.unlocked && styles.titleLocked]} numberOfLines={2}>
        {achievement.title}
      </Text>
      <Text style={styles.condition} numberOfLines={3}>
        {achievement.description}
      </Text>

      <View style={styles.progressBlock}>
        <View style={styles.progressLabelRow}>
          <Text style={styles.progressLabel}>
            {achievement.category ? achievement.category.replace(/_/g, ' ') : 'Milestone'}
          </Text>
          <Text style={[styles.progressValue, achievement.unlocked && { color: accent }]}>
            {progressPercent}%
          </Text>
        </View>
        <View style={styles.progressTrack}>
          <LinearGradient
            colors={achievement.unlocked ? tier.planetGradient : [colors.textFaint, colors.textFaint]}
            style={[styles.progressFill, { width: `${progressPercent}%` }]}
          />
        </View>
      </View>
    </>
  );

  return (
    <Animated.View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${achievement.title}, ${tier.label} tier, ${achievement.unlocked ? 'unlocked' : 'locked'}. ${achievement.description}. ${progressPercent}% complete.`}
      style={[
        styles.cardShell,
        achievement.unlocked && {
          shadowColor: accent,
          shadowOpacity: 0.32,
          transform: [{ scale: reveal.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
          opacity: reveal.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }),
        },
      ]}
    >
      {achievement.unlocked ? (
        <LinearGradient
          colors={tier.cardGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.card, { borderColor: `${accent}99` }]}
        >
          {content}
        </LinearGradient>
      ) : (
        <View style={[styles.card, styles.lockedCard]}>{content}</View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cardShell: {
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 150,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 7,
  },
  card: {
    minHeight: 230,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    gap: spacing.sm,
    overflow: 'hidden',
  },
  lockedCard: {
    backgroundColor: colors.bgElevated,
    borderColor: colors.borderSoft,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  planetStage: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbit: {
    position: 'absolute',
    width: 58,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
    transform: [{ rotate: '-18deg' }],
  },
  planet: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  lockedPlanet: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  topMeta: {
    alignItems: 'flex-end',
    gap: 6,
    flexShrink: 1,
  },
  tierPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: 'rgba(10,15,26,0.58)',
  },
  tierText: {
    color: colors.textFaint,
    fontSize: 10,
    fontWeight: font.weight.bold as '700',
  },
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stateText: {
    color: colors.textFaint,
    fontSize: 10,
    fontWeight: font.weight.semibold as '600',
  },
  stateTextUnlocked: { color: colors.success },
  title: {
    color: colors.text,
    fontSize: font.size.md,
    lineHeight: 20,
    fontWeight: font.weight.heavy as '800',
  },
  titleLocked: { color: colors.textMuted },
  condition: {
    color: colors.textMuted,
    fontSize: font.size.xs,
    lineHeight: 17,
    minHeight: 34,
  },
  progressBlock: { gap: 6, marginTop: 'auto' },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  progressLabel: {
    color: colors.textFaint,
    fontSize: 10,
    textTransform: 'capitalize',
    flexShrink: 1,
  },
  progressValue: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: font.weight.bold as '700',
  },
  progressTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: radius.pill },
});
