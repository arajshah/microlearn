import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MonthlyStreakCalendar } from '@/components/gamification/MonthlyStreakCalendar';
import { ProgressBar } from '@/components/ProgressBar';
import {
  AppScreen,
  BadgePill,
  EmptyState,
  GlassCard,
  PrimaryButton,
  SectionHeader,
} from '@/components/ui';
import { DAILY_GOAL_XP, useProgress } from '@/context/ProgressContext';
import { useChallenge } from '@/context/ChallengeContext';
import { useRoadmaps } from '@/context/RoadmapContext';
import { usePreferences } from '@/context/PreferencesContext';
import { useLibrary } from '@/context/LibraryContext';
import { countDueReviewGroups } from '@/retrieval/reviewGroups';
import { getSubject } from '@/data/subjects';
import { colors, font, gradients, radius, shadow, spacing } from '@/theme/theme';
import { dayKey, greeting } from '@/utils/date';
import { useScreenRefresh } from '@/hooks/useScreenRefresh';
import { continueNode, roadmapStats } from '@/utils/roadmapProgress';
import {
  getDailyActivity,
  getDueRetrievalItems,
  getProfileSummary,
  isServerConfigured,
  ServerDailyActivity,
  ServerProfileSummary,
} from '@/services/microlearnServer';
import {
  filterRetrievalItems,
  readDeletedRetrievalItemIds,
  readDeletedReviewSetIds,
} from '@/storage/retrievalTombstones';

function isActivityDay(day: ServerDailyActivity): boolean {
  return (
    day.xpEarned > 0 ||
    day.lessonsCompleted > 0 ||
    day.retrievalItemsReviewed > 0 ||
    day.roadmapProgressEvents > 0
  );
}

function MetricCard({
  label,
  value,
  helper,
  icon,
  accent,
  onPress,
}: {
  label: string;
  value: string;
  helper: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  onPress?: () => void;
}) {
  const content = (
    <>
      <View style={[styles.metricIcon, { backgroundColor: `${accent}1F` }]}>
        <Ionicons name={icon} size={15} color={accent} />
      </View>
      <Text style={styles.metricLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.metricValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.metricHelper} numberOfLines={1}>
        {helper}
      </Text>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.metricCard, pressed && { opacity: 0.86 }]}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={styles.metricCard}>{content}</View>;
}

export default function TodayScreen() {
  const router = useRouter();
  const {
    streak,
    totalXp,
    todayXp,
    goalPct,
    completedCount,
    isLessonComplete,
    hydrated,
    xpByDay,
  } = useProgress();
  const { isDoneToday: challengeDone } = useChallenge();
  const { onboarded, hydrated: prefsHydrated } = usePreferences();
  const { hydrated: roadmapsHydrated, lastOpenedRoadmap, refreshRoadmaps } = useRoadmaps();
  const { generatedLessons, refreshFromBackend } = useLibrary();

  const serverEnabled = isServerConfigured();
  const [serverSummary, setServerSummary] = useState<ServerProfileSummary | null>(null);
  const [dueGroupCount, setDueGroupCount] = useState(0);
  const [serverActivity, setServerActivity] = useState<ServerDailyActivity[]>([]);

  const monthDate = useMemo(() => new Date(), []);

  const refreshToday = useCallback(async () => {
    const refreshServerData = async () => {
      if (serverEnabled) {
        const [summary, deletedReviewSets, deletedItems, dueItems, activity] = await Promise.all([
          getProfileSummary(),
          readDeletedReviewSetIds(),
          readDeletedRetrievalItemIds(),
          getDueRetrievalItems({ limit: 200 }),
          getDailyActivity(35),
        ]);
        setServerSummary(summary);
        const filtered = filterRetrievalItems(dueItems, deletedReviewSets, deletedItems);
        setDueGroupCount(countDueReviewGroups(filtered));
        setServerActivity(activity);
      }
    };
    await Promise.all([refreshRoadmaps(), refreshFromBackend(), refreshServerData()]);
  }, [refreshFromBackend, refreshRoadmaps, serverEnabled]);

  const { refreshing, refresh } = useScreenRefresh(refreshToday);

  useEffect(() => {
    if (prefsHydrated && !onboarded) router.replace('/onboarding');
  }, [prefsHydrated, onboarded, router]);

  const activeDays = useMemo(() => {
    const set = new Set<string>();
    const month = monthDate.getMonth();
    const year = monthDate.getFullYear();

    const inCurrentMonth = (key: string) => {
      const [y, m] = key.split('-').map(Number);
      return y === year && m - 1 === month;
    };

    for (const [key, xp] of Object.entries(xpByDay)) {
      if (xp > 0 && inCurrentMonth(key)) set.add(key);
    }

    for (const day of serverActivity) {
      if (day.day && isActivityDay(day) && inCurrentMonth(day.day)) {
        set.add(day.day);
      }
    }

    if (serverSummary?.activity.today?.day && isActivityDay(serverSummary.activity.today)) {
      set.add(serverSummary.activity.today.day);
    }

    for (const day of serverSummary?.activity.last7Days ?? []) {
      if (day.day && isActivityDay(day) && inCurrentMonth(day.day)) {
        set.add(day.day);
      }
    }

    const today = dayKey();
    if (todayXp > 0) set.add(today);

    return set;
  }, [xpByDay, serverActivity, serverSummary, todayXp, monthDate]);

  const nextGenerated = useMemo(() => {
    for (const lesson of generatedLessons) {
      if (isLessonComplete(lesson.id)) continue;
      const subject = getSubject(lesson.subjectId);
      if (subject) return { subject, lesson };
    }
    return undefined;
  }, [generatedLessons, isLessonComplete]);

  const roadmapNext = useMemo(() => {
    if (!lastOpenedRoadmap) return null;
    const stats = roadmapStats(lastOpenedRoadmap);
    const next = continueNode(lastOpenedRoadmap);
    const complete = stats.total > 0 && stats.completed >= stats.total;
    return {
      roadmap: lastOpenedRoadmap,
      stats,
      next,
      complete,
      minutes: next?.estimatedMinutes ?? Math.max(5, stats.remainingMinutes),
    };
  }, [lastOpenedRoadmap]);

  const goalMet = todayXp >= DAILY_GOAL_XP;
  const lessonCatalogSize = generatedLessons.length;
  const coursePct =
    lessonCatalogSize > 0 ? Math.round((completedCount / lessonCatalogSize) * 100) : 0;
  const displayStreak = serverSummary?.streaks.study.current ?? streak;
  const totalDue = serverEnabled ? dueGroupCount : 0;
  const dueMinutes = Math.max(1, Math.ceil(totalDue * 0.6));
  const recentAchievement = serverSummary?.achievements.recent[0];
  const showAchievementNudge = Boolean(
    recentAchievement?.unlockedAt &&
      Date.now() - new Date(recentAchievement.unlockedAt).getTime() < 86_400_000,
  );

  return (
    <AppScreen
      scroll
      contentStyle={styles.content}
      refresh={{ refreshing, onRefresh: refresh, accent: colors.today }}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.greeting}>{greeting()}</Text>
          <Text style={styles.eyebrow}>Observatory</Text>
          <Text style={styles.title}>Today</Text>
        </View>
        <Pressable onPress={() => router.push('/search')} hitSlop={8} style={styles.iconBtn}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
        </Pressable>
        <View style={styles.streakChip}>
          <Ionicons name="flame" size={16} color={colors.streak} />
          <Text style={styles.streakText}>{displayStreak}</Text>
        </View>
      </View>

      {showAchievementNudge && recentAchievement ? (
        <Pressable onPress={() => router.push('/profile')} style={styles.nudge}>
          <Ionicons name="ribbon" size={18} color={colors.xp} />
          <Text style={styles.nudgeText} numberOfLines={1}>
            Achievement unlocked: {recentAchievement.title}
          </Text>
        </Pressable>
      ) : null}

      {/* Continue Learning */}
      {roadmapsHydrated && roadmapNext ? (
        <LinearGradient
          colors={gradients.paths}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroTop}>
            <BadgePill label="Continue Learning" icon="map" accent={colors.white} subtle={false} />
            <View style={styles.heroIcon}>
              <Ionicons name="map" size={20} color={colors.white} />
            </View>
          </View>
          <Text style={styles.heroTitle} numberOfLines={2}>
            {roadmapNext.roadmap.title}
          </Text>
          <Text style={styles.heroSub} numberOfLines={2}>
            {roadmapNext.complete
              ? `${roadmapNext.stats.completed}/${roadmapNext.stats.total} lessons complete`
              : roadmapNext.next
                ? `Up next: ${roadmapNext.next.title}`
                : roadmapNext.roadmap.topic}
          </Text>
          <View style={styles.heroProgressRow}>
            <View style={styles.heroProgressTrack}>
              <ProgressBar
                progress={roadmapNext.stats.pct}
                color={colors.white}
                trackColor="rgba(255,255,255,0.25)"
                height={6}
              />
            </View>
            <Text style={styles.heroProgressText}>
              {roadmapNext.stats.completed}/{roadmapNext.stats.total}
            </Text>
          </View>
          {!roadmapNext.complete && roadmapNext.minutes > 0 ? (
            <Text style={styles.heroMeta}>~{roadmapNext.minutes} min</Text>
          ) : null}
          <PrimaryButton
            label={roadmapNext.complete ? 'Open path' : 'Continue'}
            icon="arrow-forward"
            accent={colors.white}
            onPress={() => router.push(`/roadmap/${roadmapNext.roadmap.id}`)}
            style={styles.heroCta}
          />
        </LinearGradient>
      ) : nextGenerated ? (
        <LinearGradient
          colors={nextGenerated.subject.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroTop}>
            <BadgePill
              label="Continue Learning"
              icon="play"
              accent={colors.white}
              subtle={false}
            />
            <View style={styles.heroIcon}>
              <Ionicons
                name={nextGenerated.subject.icon as keyof typeof Ionicons.glyphMap}
                size={20}
                color={colors.white}
              />
            </View>
          </View>
          <Text style={styles.heroTitle} numberOfLines={2}>
            {nextGenerated.lesson.title}
          </Text>
          <Text style={styles.heroSub} numberOfLines={1}>
            {nextGenerated.subject.title} · {nextGenerated.lesson.minutes} min
          </Text>
          <PrimaryButton
            label="Start lesson"
            icon="arrow-forward"
            accent={colors.white}
            onPress={() => router.push(`/lesson/${nextGenerated.lesson.id}`)}
            style={styles.heroCta}
          />
        </LinearGradient>
      ) : (
        <GlassCard accent={colors.today} elevated>
          <EmptyState
            icon="sparkles-outline"
            title="Start learning"
            message="Create a lesson or roadmap to start learning."
            actionLabel="Create"
            onActionPress={() => router.push('/create')}
            accent={colors.today}
          />
        </GlassCard>
      )}

      {/* Streak Calendar */}
      <View style={styles.calendarSection}>
        <SectionHeader
          title="Streak Calendar"
          subtitle="Keep your learning chain alive."
        />
        <GlassCard accent={colors.today}>
          <MonthlyStreakCalendar
            monthDate={monthDate}
            activeDays={activeDays}
            challengeDone={challengeDone}
            onChallengePress={() => router.push('/challenge')}
            accent={colors.today}
          />
        </GlassCard>
      </View>

      {/* Today Summary */}
      <View style={styles.summarySection}>
        <SectionHeader title="Today summary" />
        <View style={styles.metricRow}>
          <MetricCard
            label="Due today"
            value={String(totalDue)}
            helper={totalDue > 0 ? `~${dueMinutes} min` : 'Clear'}
            icon="refresh"
            accent={colors.retrieve}
            onPress={() => router.push('/retrieve')}
          />
          <MetricCard
            label="Daily goal"
            value={`${Math.round(goalPct * 100)}%`}
            helper={goalMet ? 'Complete' : `${todayXp}/${DAILY_GOAL_XP} XP`}
            icon="flash"
            accent={colors.today}
          />
          <MetricCard
            label="Streak"
            value={`${displayStreak}`}
            helper={coursePct > 0 ? `${coursePct}% learned` : `${totalXp} XP`}
            icon="flame"
            accent={colors.streak}
          />
        </View>
      </View>

      {!hydrated ? <Text style={styles.loading}>Loading your progress…</Text> : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  greeting: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    letterSpacing: 0.3,
  },
  eyebrow: {
    color: colors.constellation,
    fontSize: 10,
    fontWeight: font.weight.bold as '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  title: {
    color: colors.text,
    fontSize: font.size.xxxl,
    fontWeight: font.weight.heavy as '800',
    marginTop: 2,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
    maxWidth: 92,
  },
  streakText: {
    color: colors.text,
    fontWeight: font.weight.bold as '700',
    fontSize: font.size.sm,
  },
  nudge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: `${colors.xp}55`,
  },
  nudgeText: {
    color: colors.text,
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold as '600',
    flex: 1,
  },

  heroCard: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.sm,
    ...shadow.card,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    color: colors.white,
    fontSize: font.size.xxl,
    fontWeight: font.weight.heavy as '800',
    lineHeight: 34,
  },
  heroSub: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: font.size.sm,
    lineHeight: 20,
  },
  heroProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  heroProgressTrack: {
    flex: 1,
    minWidth: 0,
  },
  heroProgressText: {
    color: colors.white,
    fontSize: font.size.xs,
    fontWeight: font.weight.bold as '700',
    minWidth: 36,
    textAlign: 'right',
  },
  heroMeta: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold as '600',
  },
  heroCta: { marginTop: spacing.sm, alignSelf: 'flex-start' },

  calendarSection: { gap: spacing.md },
  summarySection: { gap: spacing.md },

  metricRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  metricCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.md,
    gap: 5,
  },
  metricIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold as '600',
  },
  metricValue: {
    color: colors.text,
    fontSize: font.size.xl,
    fontWeight: font.weight.heavy as '800',
  },
  metricHelper: {
    color: colors.textFaint,
    fontSize: font.size.xs,
  },

  loading: {
    color: colors.textFaint,
    textAlign: 'center',
  },
});
