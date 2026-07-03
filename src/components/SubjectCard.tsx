import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Subject } from '@/types/content';
import { useProgress } from '@/context/ProgressContext';
import { colors, font, radius, shadow, spacing } from '@/theme/theme';
import { ProgressBar } from './ProgressBar';

export function SubjectCard({ subject, compact }: { subject: Subject; compact?: boolean }) {
  const router = useRouter();
  const { subjectProgress } = useProgress();
  const { done, total, pct } = subjectProgress(subject.id);

  return (
    <Pressable
      onPress={() => router.push(`/subject/${subject.id}`)}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
    >
      <LinearGradient
        colors={subject.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, compact && styles.cardCompact]}
      >
        <View style={[styles.iconBubble, compact && styles.iconBubbleCompact]}>
          <Ionicons name={subject.icon as any} size={compact ? 20 : 26} color={colors.white} />
        </View>
        <Text style={[styles.title, compact && styles.titleCompact]}>{subject.title}</Text>
        {!compact ? (
          <Text style={styles.tagline} numberOfLines={2}>
            {subject.tagline}
          </Text>
        ) : null}

        <View style={styles.footer}>
          <ProgressBar
            progress={pct}
            color={colors.white}
            trackColor="rgba(255,255,255,0.25)"
            height={compact ? 4 : 6}
          />
          <Text style={styles.progressText}>
            {done}/{total}
          </Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    ...shadow.card,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
  card: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    minHeight: 168,
    justifyContent: 'space-between',
  },
  cardCompact: {
    minHeight: 140,
    padding: spacing.md,
  },
  iconBubble: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  iconBubbleCompact: {
    width: 36,
    height: 36,
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.white,
    fontSize: font.size.lg,
    fontWeight: font.weight.heavy as '800',
  },
  titleCompact: { fontSize: font.size.md },
  tagline: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: font.size.xs,
    marginTop: 2,
    lineHeight: 16,
  },
  footer: {
    marginTop: spacing.md,
    gap: 6,
  },
  progressText: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold as '600',
  },
});
