import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SubjectCard } from '@/components/SubjectCard';
import { ProgressRing } from '@/components/ProgressRing';
import { DAILY_GOAL_XP, useProgress } from '@/context/ProgressContext';
import { useReview } from '@/context/ReviewContext';
import { useChallenge } from '@/context/ChallengeContext';
import { RoadmapContinueCard } from '@/components/roadmap/RoadmapContinueCard';
import { useRoadmaps } from '@/context/RoadmapContext';
import { usePreferences } from '@/context/PreferencesContext';
import { allLessons, subjects } from '@/data/courses';
import { colors, font, radius, shadow, spacing } from '@/theme/theme';
import { greeting } from '@/utils/date';

function QuickAction({
  icon,
  label,
  tint,
  onPress,
  badge,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tint: string;
  onPress: () => void;
  badge?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.quickAction, pressed && { opacity: 0.85 }]}
    >
      <View style={[styles.quickIcon, { backgroundColor: `${tint}22` }]}>
        <Ionicons name={icon} size={20} color={tint} />
        {badge ? (
          <View style={[styles.quickBadge, { backgroundColor: tint }]}>
            <Text style={styles.quickBadgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

export default function TodayScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    streak,
    totalXp,
    todayXp,
    goalPct,
    completedCount,
    totalLessons,
    isLessonComplete,
    hydrated,
  } = useProgress();
  const { stats: reviewStats } = useReview();
  const { isDoneToday: challengeDone } = useChallenge();
  const { onboarded, hydrated: prefsHydrated, interests } = usePreferences();
  const { hydrated: roadmapsHydrated, lastOpenedRoadmap } = useRoadmaps();

  useEffect(() => {
    if (prefsHydrated && !onboarded) router.replace('/onboarding');
  }, [prefsHydrated, onboarded, router]);

  const orderedSubjects = useMemo(
    () =>
      [...subjects].sort(
        (a, b) =>
          (interests.includes(b.id) ? 1 : 0) - (interests.includes(a.id) ? 1 : 0),
      ),
    [interests],
  );

  const nextLesson = useMemo(() => {
    const all = allLessons();
    return all.find((l) => !isLessonComplete(l.lesson.id)) ?? all[0];
  }, [isLessonComplete]);

  const goalMet = todayXp >= DAILY_GOAL_XP;
  const coursePct = totalLessons ? Math.round((completedCount / totalLessons) * 100) : 0;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.md, paddingBottom: spacing.xxxl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>{greeting()}</Text>
          <Text style={styles.appName}>Microlearn</Text>
        </View>
        <Pressable onPress={() => router.push('/search')} hitSlop={8} style={styles.iconBtn}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
        </Pressable>
        <Pressable onPress={() => router.push('/saved')} hitSlop={8} style={styles.iconBtn}>
          <Ionicons name="bookmark-outline" size={18} color={colors.textMuted} />
        </Pressable>
        <View style={styles.streakChip}>
          <Ionicons name="flame" size={16} color={colors.streak} />
          <Text style={styles.streakText}>{streak}</Text>
        </View>
      </View>

      {/* Hero — continue learning */}
      {nextLesson ? (
        <Pressable
          onPress={() => router.push(`/lesson/${nextLesson.lesson.id}`)}
          style={({ pressed }) => [pressed && { transform: [{ scale: 0.985 }] }]}
        >
          <LinearGradient
            colors={nextLesson.subject.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            <View style={styles.heroTop}>
              <Text style={styles.heroKicker}>
                {completedCount > 0 ? 'Continue' : 'Start here'}
              </Text>
              <View style={styles.heroIcon}>
                <Ionicons name={nextLesson.subject.icon as any} size={18} color={colors.white} />
              </View>
            </View>
            <Text style={styles.heroTitle}>{nextLesson.lesson.title}</Text>
            <Text style={styles.heroSub}>
              {nextLesson.subject.title} · {nextLesson.lesson.minutes} min
            </Text>
            <View style={styles.heroCta}>
              <Text style={styles.heroCtaText}>Open lesson</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.bg} />
            </View>
          </LinearGradient>
        </Pressable>
      ) : null}

      {roadmapsHydrated && lastOpenedRoadmap ? (
        <RoadmapContinueCard
          roadmap={lastOpenedRoadmap}
          compact
          onPress={() => router.push(`/roadmap/${lastOpenedRoadmap.id}`)}
        />
      ) : null}

      {/* Daily goal — compact */}
      <View style={styles.goalRow}>
        <ProgressRing progress={goalPct} size={72} strokeWidth={8}>
          <Text style={styles.ringPct}>{Math.round(goalPct * 100)}%</Text>
        </ProgressRing>
        <View style={{ flex: 1 }}>
          <Text style={styles.goalTitle}>
            {goalMet ? 'Goal complete' : 'Daily goal'}
          </Text>
          <Text style={styles.goalSub}>
            {goalMet
              ? `${todayXp} XP today · ${totalXp} total`
              : `${todayXp} / ${DAILY_GOAL_XP} XP · ${coursePct}% of course done`}
          </Text>
        </View>
      </View>

      {/* Quick actions */}
      <View style={styles.quickRow}>
        <QuickAction
          icon={challengeDone ? 'checkmark-circle' : 'trophy'}
          label="Challenge"
          tint={colors.warning}
          onPress={() => router.push('/challenge')}
        />
        <QuickAction
          icon="refresh"
          label="Review"
          tint={colors.streak}
          badge={reviewStats.dueCount > 0 ? String(reviewStats.dueCount) : undefined}
          onPress={() => router.push('/review')}
        />
        <QuickAction
          icon="flash"
          label="Lightning"
          tint={colors.primary}
          onPress={() => router.push('/lightning')}
        />
        <QuickAction
          icon="sparkles"
          label="Create"
          tint={colors.xp}
          onPress={() => router.push('/create')}
        />
      </View>

      {/* Subjects — horizontal scroll */}
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Explore</Text>
        <Pressable onPress={() => router.push('/learn')} hitSlop={8}>
          <Text style={styles.sectionLink}>See all</Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.subjectScroll}
      >
        {orderedSubjects.map((s) => (
          <View key={s.id} style={styles.subjectItem}>
            <SubjectCard subject={s} compact />
          </View>
        ))}
      </ScrollView>

      {!hydrated ? <Text style={styles.loading}>Loading your progress…</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, gap: spacing.xl },

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
  appName: {
    color: colors.text,
    fontSize: font.size.xxxl,
    fontWeight: font.weight.heavy as '800',
    letterSpacing: -0.5,
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
  },
  streakText: {
    color: colors.text,
    fontWeight: font.weight.bold as '700',
    fontSize: font.size.sm,
  },

  heroCard: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: 4,
    ...shadow.card,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroKicker: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: font.size.xs,
    fontWeight: font.weight.heavy as '800',
    letterSpacing: 1.2,
  },
  heroIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    color: colors.white,
    fontSize: font.size.xxl,
    fontWeight: font.weight.heavy as '800',
    marginTop: spacing.sm,
    letterSpacing: -0.3,
  },
  heroSub: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: font.size.sm,
  },
  heroCta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    marginTop: spacing.md,
  },
  heroCtaText: {
    color: colors.bg,
    fontWeight: font.weight.bold as '700',
    fontSize: font.size.sm,
  },

  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  ringPct: {
    color: colors.text,
    fontSize: font.size.sm,
    fontWeight: font.weight.bold as '700',
  },
  goalTitle: {
    color: colors.text,
    fontSize: font.size.md,
    fontWeight: font.weight.bold as '700',
  },
  goalSub: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    lineHeight: 19,
    marginTop: 2,
  },

  quickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  quickAction: { flex: 1, alignItems: 'center', gap: spacing.sm },
  quickIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  quickBadgeText: {
    color: colors.bg,
    fontSize: 10,
    fontWeight: font.weight.bold as '700',
  },
  quickLabel: {
    color: colors.textMuted,
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold as '600',
    textAlign: 'center',
  },

  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: font.size.lg,
    fontWeight: font.weight.bold as '700',
  },
  sectionLink: {
    color: colors.primary,
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold as '600',
  },
  subjectScroll: { gap: spacing.md, paddingRight: spacing.lg },
  subjectItem: { width: 160 },

  loading: {
    color: colors.textFaint,
    textAlign: 'center',
  },
});
