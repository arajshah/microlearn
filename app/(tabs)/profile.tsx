import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProgressBar } from '@/components/ProgressBar';
import { ReminderSettings } from '@/components/ReminderSettings';
import { StreakCalendar } from '@/components/StreakCalendar';
import { useBookmarks } from '@/context/BookmarksContext';
import { useChallenge } from '@/context/ChallengeContext';
import { useProgress } from '@/context/ProgressContext';
import { deriveAchievements } from '@/data/achievements';
import { subjects } from '@/data/courses';
import { colors, font, radius, spacing } from '@/theme/theme';

const XP_PER_LEVEL = 150;

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { count: savedCount } = useBookmarks();
  const { completedCount: challengeCount } = useChallenge();
  const {
    totalXp,
    streak,
    longestStreak,
    completedCount,
    totalLessons,
    completed,
    subjectProgress,
    streakFreezes,
    xpByDay,
    resetAll,
  } = useProgress();

  const level = Math.floor(totalXp / XP_PER_LEVEL) + 1;
  const levelFloor = (level - 1) * XP_PER_LEVEL;
  const levelProgress = (totalXp - levelFloor) / XP_PER_LEVEL;
  const xpToNext = level * XP_PER_LEVEL - totalXp;

  const achievements = useMemo(
    () => deriveAchievements({ totalXp, longestStreak, streak, completed }),
    [totalXp, longestStreak, streak, completed],
  );
  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  const confirmReset = () => {
    Alert.alert(
      'Reset all progress?',
      'This clears your XP, streak, and completed lessons. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: () => resetAll() },
      ],
    );
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.md, paddingBottom: spacing.xxxl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Identity */}
      <View style={styles.identity}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{level}</Text>
        </View>
        <Text style={styles.name}>Level {level} Learner</Text>
        <Text style={styles.levelSub}>
          {xpToNext} XP to level {level + 1}
        </Text>
        <View style={styles.levelBar}>
          <ProgressBar progress={levelProgress} color={colors.xp} height={8} />
        </View>
      </View>

      {/* Stat tiles */}
      <View style={styles.statGrid}>
        <StatTile icon="flame" color={colors.streak} value={`${streak}`} label="Day streak" />
        <StatTile icon="star" color={colors.xp} value={`${totalXp}`} label="Total XP" />
        <StatTile
          icon="book"
          color={colors.primary}
          value={`${completedCount}/${totalLessons}`}
          label="Lessons"
        />
        <StatTile
          icon="trophy"
          color={colors.success}
          value={`${longestStreak}`}
          label="Best streak"
        />
        <StatTile
          icon="ribbon"
          color={colors.xp}
          value={`${challengeCount}`}
          label="Challenges"
        />
      </View>

      {/* Quick links */}
      <Pressable
        onPress={() => router.push('/saved')}
        style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.7 }]}
      >
        <View style={styles.linkIcon}>
          <Ionicons name="bookmark" size={18} color={colors.xp} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.linkTitle}>Saved cards</Text>
          <Text style={styles.linkSub}>
            {savedCount > 0
              ? `${savedCount} card${savedCount === 1 ? '' : 's'} saved for review`
              : 'Bookmark cards while you learn'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </Pressable>

      <Pressable
        onPress={() => router.push('/onboarding')}
        style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.7 }]}
      >
        <View style={styles.linkIcon}>
          <Ionicons name="options" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.linkTitle}>Personalize</Text>
          <Text style={styles.linkSub}>Update your interests & difficulty level</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </Pressable>

      {/* Streak */}
      <Text style={styles.sectionTitle}>Your streak</Text>
      <StreakCalendar
        streak={streak}
        longestStreak={longestStreak}
        streakFreezes={streakFreezes}
        xpByDay={xpByDay}
      />

      {/* Reminders */}
      <Text style={styles.sectionTitle}>Reminders</Text>
      <ReminderSettings />

      {/* Subject progress */}
      <Text style={styles.sectionTitle}>Subjects</Text>
      <View style={styles.card}>
        {subjects.map((s, i) => {
          const { done, total, pct } = subjectProgress(s.id);
          return (
            <View
              key={s.id}
              style={[styles.subjectRow, i < subjects.length - 1 && styles.divider]}
            >
              <View style={[styles.subjectDot, { backgroundColor: s.accent }]}>
                <Ionicons name={s.icon as any} size={16} color={colors.bg} />
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <View style={styles.subjectTop}>
                  <Text style={styles.subjectName}>{s.title}</Text>
                  <Text style={styles.subjectCount}>
                    {done}/{total}
                  </Text>
                </View>
                <ProgressBar progress={pct} color={s.accent} height={6} />
              </View>
            </View>
          );
        })}
      </View>

      {/* Achievements */}
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Achievements</Text>
        <Text style={styles.sectionMeta}>
          {unlockedCount}/{achievements.length}
        </Text>
      </View>
      <View style={styles.achGrid}>
        {achievements.map((a) => (
          <View
            key={a.id}
            style={[styles.achCard, a.unlocked ? styles.achUnlocked : styles.achLocked]}
          >
            <View
              style={[
                styles.achIcon,
                { backgroundColor: a.unlocked ? colors.xp : colors.surfaceAlt },
              ]}
            >
              <Ionicons
                name={a.icon}
                size={22}
                color={a.unlocked ? colors.bg : colors.textFaint}
              />
            </View>
            <Text
              style={[styles.achTitle, !a.unlocked && { color: colors.textMuted }]}
              numberOfLines={1}
            >
              {a.title}
            </Text>
            <Text style={styles.achDesc} numberOfLines={2}>
              {a.description}
            </Text>
            {!a.unlocked ? (
              <View style={styles.achBarWrap}>
                <ProgressBar progress={a.progress} color={colors.textFaint} height={4} />
              </View>
            ) : (
              <View style={styles.achDoneRow}>
                <Ionicons name="checkmark-circle" size={13} color={colors.success} />
                <Text style={styles.achDoneText}>Unlocked</Text>
              </View>
            )}
          </View>
        ))}
      </View>

      <Pressable onPress={confirmReset} style={styles.resetBtn}>
        <Ionicons name="trash-outline" size={16} color={colors.danger} />
        <Text style={styles.resetText}>Reset all progress</Text>
      </Pressable>

      <Text style={styles.footerNote}>
        Microlearn · Bite-sized lessons in Economics, Philosophy, Literature & CS
      </Text>
    </ScrollView>
  );
}

function StatTile({
  icon,
  color,
  value,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  value: string;
  label: string;
}) {
  return (
    <View style={styles.statTile}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, gap: spacing.xl },

  identity: { alignItems: 'center', gap: 6 },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  avatarText: {
    color: colors.white,
    fontSize: font.size.xxl,
    fontWeight: font.weight.heavy as '800',
  },
  name: {
    color: colors.text,
    fontSize: font.size.xl,
    fontWeight: font.weight.heavy as '800',
  },
  levelSub: { color: colors.textMuted, fontSize: font.size.sm },
  levelBar: { width: '70%', marginTop: spacing.sm },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  statTile: {
    width: '47.5%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: {
    color: colors.text,
    fontSize: font.size.xl,
    fontWeight: font.weight.heavy as '800',
  },
  statLabel: { color: colors.textMuted, fontSize: font.size.xs },

  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  linkIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkTitle: { color: colors.text, fontSize: font.size.md, fontWeight: font.weight.bold as '700' },
  linkSub: { color: colors.textMuted, fontSize: font.size.xs, marginTop: 2 },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: font.size.lg,
    fontWeight: font.weight.bold as '700',
  },
  sectionMeta: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold as '600',
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  subjectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  subjectDot: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subjectTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  subjectName: {
    color: colors.text,
    fontSize: font.size.md,
    fontWeight: font.weight.semibold as '600',
  },
  subjectCount: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold as '600',
  },

  achGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  achCard: {
    width: '47.5%',
    flexGrow: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: 6,
    borderWidth: 1,
  },
  achUnlocked: { backgroundColor: colors.surface, borderColor: colors.xp },
  achLocked: { backgroundColor: colors.bgElevated, borderColor: colors.borderSoft },
  achIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  achTitle: {
    color: colors.text,
    fontSize: font.size.md,
    fontWeight: font.weight.bold as '700',
  },
  achDesc: {
    color: colors.textFaint,
    fontSize: font.size.xs,
    lineHeight: 16,
    minHeight: 32,
  },
  achBarWrap: { marginTop: 4 },
  achDoneRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  achDoneText: {
    color: colors.success,
    fontSize: font.size.xs,
    fontWeight: font.weight.bold as '700',
  },

  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.md,
  },
  resetText: {
    color: colors.danger,
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold as '600',
  },
  footerNote: {
    color: colors.textFaint,
    fontSize: font.size.xs,
    textAlign: 'center',
    lineHeight: 17,
  },
});
