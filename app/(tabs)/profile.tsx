import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AchievementBadgeCard } from '@/components/gamification/AchievementBadgeCard';
import { LearningStatePanel } from '@/components/LearningStatePanel';
import { ProgressBar } from '@/components/ProgressBar';
import { ReminderSettings } from '@/components/ReminderSettings';
import { GlassCard, SectionHeader } from '@/components/ui';
import { useBookmarks } from '@/context/BookmarksContext';
import { useChallenge } from '@/context/ChallengeContext';
import { useProgress } from '@/context/ProgressContext';
import { deriveAchievements } from '@/data/achievements';
import { subjects } from '@/data/courses';
import {
  getAchievements,
  getProfileSummary,
  isServerConfigured,
  ServerAchievement,
  ServerProfileSummary,
} from '@/services/microlearnServer';
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
    resetAll,
  } = useProgress();

  const serverEnabled = isServerConfigured();
  const [serverSummary, setServerSummary] = useState<ServerProfileSummary | null>(null);
  const [serverAchievements, setServerAchievements] = useState<ServerAchievement[]>([]);
  const [serverLoading, setServerLoading] = useState(serverEnabled);

  useEffect(() => {
    if (!serverEnabled) return;
    let cancelled = false;
    (async () => {
      try {
        const [summary, achievements] = await Promise.all([
          getProfileSummary(),
          getAchievements(),
        ]);
        if (!cancelled) {
          setServerSummary(summary);
          setServerAchievements(achievements);
        }
      } finally {
        if (!cancelled) setServerLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [serverEnabled]);

  const displayXp = serverSummary?.xp ?? totalXp;
  const displayStreak = serverSummary?.streaks.study.current ?? streak;
  const displayBestStreak = serverSummary?.streaks.study.best ?? longestStreak;
  const masteredCount = serverSummary?.retrieval.masteredCount;
  const achievementsUnlocked =
    serverSummary?.achievements.unlockedCount ??
    deriveAchievements({ totalXp, longestStreak, streak, completed }).filter((a) => a.unlocked).length;
  const achievementsTotal =
    serverSummary?.achievements.totalCount ??
    deriveAchievements({ totalXp, longestStreak, streak, completed }).length;

  const level = Math.floor(displayXp / XP_PER_LEVEL) + 1;
  const levelFloor = (level - 1) * XP_PER_LEVEL;
  const levelProgress = (displayXp - levelFloor) / XP_PER_LEVEL;
  const xpToNext = level * XP_PER_LEVEL - displayXp;

  const localAchievements = useMemo(
    () => deriveAchievements({ totalXp, longestStreak, streak, completed }),
    [totalXp, longestStreak, streak, completed],
  );

  const badgeList = useMemo(() => {
    if (serverAchievements.length > 0) {
      const recent = serverSummary?.achievements.recent ?? [];
      const recentIds = new Set(recent.map((a) => a.id));
      const recentSorted = serverAchievements.filter((a) => recentIds.has(a.id));
      const lockedPreview = serverAchievements.filter((a) => !a.unlocked).slice(0, 4);
      return [...recentSorted, ...lockedPreview.filter((a) => !recentIds.has(a.id))].slice(0, 6);
    }
    return null;
  }, [serverAchievements, serverSummary]);

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
      <View style={styles.headerRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.pageTitle}>Profile</Text>
          <Text style={styles.pageSub}>Your learning identity</Text>
        </View>
        <View style={styles.streakChip}>
          <Ionicons name="flame" size={16} color={colors.streak} />
          <Text style={styles.streakChipText}>{displayStreak}</Text>
        </View>
        <Pressable onPress={() => router.push('/settings')} hitSlop={8} style={styles.settingsBtn}>
          <Ionicons name="settings-outline" size={22} color={colors.textMuted} />
        </Pressable>
      </View>

      {!serverLoading && serverEnabled && !serverSummary ? (
        <Text style={styles.fallbackNote}>Using saved progress. Full profile is unavailable.</Text>
      ) : null}

      <View style={styles.heroGrid}>
        <GlassCard accent={colors.streak} style={styles.heroCard}>
          <Text style={styles.heroValue}>{displayStreak}</Text>
          <Text style={styles.heroLabel}>Study streak</Text>
          <Text style={styles.heroMeta}>Best {displayBestStreak}</Text>
        </GlassCard>
        <GlassCard accent={colors.xp} style={styles.heroCard}>
          <Text style={styles.heroValue}>{displayXp}</Text>
          <Text style={styles.heroLabel}>Total XP</Text>
          <Text style={styles.heroMeta}>Level {level}</Text>
        </GlassCard>
        <GlassCard accent={colors.success} style={styles.heroCard}>
          <Text style={styles.heroValue}>
            {achievementsUnlocked}/{achievementsTotal}
          </Text>
          <Text style={styles.heroLabel}>Achievements</Text>
        </GlassCard>
        <GlassCard accent={colors.retrieve} style={styles.heroCard}>
          <Text style={styles.heroValue}>
            {masteredCount !== undefined ? masteredCount : '—'}
          </Text>
          <Text style={styles.heroLabel}>Retrieval mastered</Text>
        </GlassCard>
      </View>

      <View style={styles.levelBlock}>
        <Text style={styles.levelSub}>{xpToNext} XP to level {level + 1}</Text>
        <ProgressBar progress={levelProgress} color={colors.xp} height={8} />
      </View>

      <View style={styles.section}>
        <SectionHeader
          title="Achievements"
          subtitle={
            serverAchievements.length > 0
              ? `${achievementsUnlocked} unlocked`
              : `${achievementsUnlocked}/${achievementsTotal} on this device`
          }
        />
        <View style={styles.badgeGrid}>
          {badgeList
            ? badgeList.map((a) => <AchievementBadgeCard key={a.id} achievement={a} />)
            : localAchievements.slice(0, 6).map((a) => (
                <View
                  key={a.id}
                  style={[styles.localBadge, a.unlocked ? styles.localUnlocked : styles.localLocked]}
                >
                  <Ionicons
                    name={a.icon}
                    size={22}
                    color={a.unlocked ? colors.xp : colors.textFaint}
                  />
                  <Text style={styles.localBadgeTitle} numberOfLines={2}>
                    {a.title}
                  </Text>
                </View>
              ))}
        </View>
      </View>

      <View style={styles.section}>
        <LearningStatePanel />
      </View>

      <View style={styles.section}>
        <SectionHeader title="Learning stats" />
        <GlassCard accent={colors.primary}>
          <StatLine label="Retrieval reviewed" value={String(serverSummary?.retrieval.reviewedCount ?? '—')} />
          <StatLine label="Mastered items" value={String(serverSummary?.retrieval.masteredCount ?? '—')} />
          <StatLine label="Active roadmaps" value={String(serverSummary?.roadmaps.activeCount ?? '—')} />
          <StatLine label="Lessons completed" value={`${completedCount}/${totalLessons}`} />
          <StatLine label="Challenges" value={String(challengeCount)} />
        </GlassCard>
      </View>

      <Pressable
        onPress={() => router.push('/saved')}
        style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.7 }]}
      >
        <View style={styles.linkIcon}>
          <Ionicons name="bookmark" size={18} color={colors.xp} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.linkTitle}>Saved slides</Text>
          <Text style={styles.linkSub}>
            {savedCount > 0
              ? `${savedCount} slide${savedCount === 1 ? '' : 's'} saved for review`
              : 'Bookmark slides while you learn'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </Pressable>

      <Text style={styles.sectionTitle}>Reminders</Text>
      <ReminderSettings />

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
                <Ionicons name={s.icon as keyof typeof Ionicons.glyphMap} size={16} color={colors.bg} />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                <View style={styles.subjectTop}>
                  <Text style={styles.subjectName} numberOfLines={1}>
                    {s.title}
                  </Text>
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

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statLine}>
      <Text style={styles.statLineLabel}>{label}</Text>
      <Text style={styles.statLineValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, gap: spacing.xl },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  pageTitle: {
    color: colors.text,
    fontSize: font.size.display,
    fontWeight: font.weight.heavy as '800',
  },
  pageSub: { color: colors.textMuted, fontSize: font.size.sm, marginTop: 2 },
  streakChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  streakChipText: {
    color: colors.text,
    fontWeight: font.weight.bold as '700',
    fontSize: font.size.sm,
  },
  settingsBtn: { padding: spacing.xs },
  fallbackNote: {
    color: colors.textMuted,
    fontSize: font.size.xs,
    marginTop: -spacing.sm,
  },
  heroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  heroCard: { flexBasis: '48%', flexGrow: 1, minWidth: 0 },
  heroValue: {
    color: colors.text,
    fontSize: font.size.xxl,
    fontWeight: font.weight.heavy as '800',
  },
  heroLabel: { color: colors.textMuted, fontSize: font.size.xs, marginTop: 2 },
  heroMeta: { color: colors.textFaint, fontSize: font.size.xs, marginTop: 2 },
  levelBlock: { gap: spacing.sm },
  levelSub: { color: colors.textMuted, fontSize: font.size.sm },
  section: { gap: spacing.md },
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  localBadge: {
    flexBasis: '48%',
    flexGrow: 1,
    minWidth: 0,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  localUnlocked: { backgroundColor: colors.surface, borderColor: colors.xp },
  localLocked: { backgroundColor: colors.bgElevated, borderColor: colors.borderSoft },
  localBadgeTitle: { color: colors.text, fontSize: font.size.sm, fontWeight: font.weight.bold as '700' },
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
  sectionTitle: {
    color: colors.text,
    fontSize: font.size.lg,
    fontWeight: font.weight.bold as '700',
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
  subjectTop: { flexDirection: 'row', justifyContent: 'space-between' },
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
  statLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  statLineLabel: { color: colors.textMuted, fontSize: font.size.sm },
  statLineValue: { color: colors.text, fontSize: font.size.sm, fontWeight: font.weight.bold as '700' },
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
