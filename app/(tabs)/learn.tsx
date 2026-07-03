import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UnitList } from '@/components/UnitList';
import { RoadmapContinueCard } from '@/components/roadmap/RoadmapContinueCard';
import { useRoadmaps } from '@/context/RoadmapContext';
import { usePreferences } from '@/context/PreferencesContext';
import { useProgress } from '@/context/ProgressContext';
import { MASTERY_TIERS, MasteryLevel } from '@/data/mastery';
import { subjects } from '@/data/courses';
import { SubjectId } from '@/types/content';
import { roadmapStats } from '@/utils/roadmapProgress';
import { colors, font, radius, spacing } from '@/theme/theme';

export default function LearnScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { subjectProgress } = useProgress();
  const { interests } = usePreferences();
  const { roadmaps, hydrated: roadmapsHydrated, lastOpenedRoadmap } = useRoadmaps();

  const orderedSubjects = useMemo(
    () =>
      [...subjects].sort(
        (a, b) =>
          (interests.includes(b.id) ? 1 : 0) - (interests.includes(a.id) ? 1 : 0),
      ),
    [interests],
  );

  const [activeId, setActiveId] = useState<SubjectId>(subjects[0].id);
  const [masteryFilter, setMasteryFilter] = useState<MasteryLevel | 'all'>('all');
  const pickedInitial = useRef(false);
  useEffect(() => {
    if (!pickedInitial.current && interests.length > 0) {
      pickedInitial.current = true;
      setActiveId(interests[0]);
    }
  }, [interests]);

  const subject = subjects.find((s) => s.id === activeId)!;
  const { done, total, pct } = subjectProgress(subject.id);

  return (
    <View style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.headingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heading}>Learn</Text>
            <Text style={styles.subheading}>Pick a subject and follow the path</Text>
          </View>
          <Pressable
            onPress={() => router.push('/search')}
            hitSlop={8}
            style={styles.searchBtn}
          >
            <Ionicons name="search" size={20} color={colors.textMuted} />
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {orderedSubjects.map((s) => {
            const active = s.id === activeId;
            return (
              <Pressable
                key={s.id}
                onPress={() => setActiveId(s.id)}
                style={[
                  styles.chip,
                  active && { backgroundColor: s.accent, borderColor: s.accent },
                ]}
              >
                <Ionicons
                  name={s.icon as any}
                  size={15}
                  color={active ? colors.bg : colors.textMuted}
                />
                <Text style={[styles.chipText, active && { color: colors.bg }]}>
                  {s.title}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.chips, { paddingTop: spacing.sm }]}
        >
          {(['all', ...MASTERY_TIERS.map((t) => t.level)] as const).map((t) => {
            const active = masteryFilter === t;
            const label =
              t === 'all'
                ? 'All levels'
                : `L${t} ${MASTERY_TIERS.find((x) => x.level === t)?.name ?? ''}`;
            return (
              <Pressable
                key={String(t)}
                onPress={() => setMasteryFilter(t)}
                style={[styles.trackChip, active && styles.trackChipActive]}
              >
                <Text style={[styles.trackChipText, active && { color: colors.bg }]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: spacing.xxxl }]}
        showsVerticalScrollIndicator={false}
      >
        {roadmapsHydrated && lastOpenedRoadmap ? (
          <RoadmapContinueCard
            roadmap={lastOpenedRoadmap}
            onPress={() => router.push(`/roadmap/${lastOpenedRoadmap.id}`)}
          />
        ) : null}

        {roadmapsHydrated && roadmaps.length > 0 ? (
          <View style={styles.roadmapsSection}>
            <View style={styles.roadmapsHead}>
              <Text style={styles.roadmapsTitle}>My roadmaps</Text>
              <Pressable onPress={() => router.push('/create')} hitSlop={8}>
                <Text style={styles.roadmapsLink}>New</Text>
              </Pressable>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.roadmapsScroll}
            >
              {roadmaps.map((rm) => {
                const stats = roadmapStats(rm);
                return (
                  <Pressable
                    key={rm.id}
                    onPress={() => router.push(`/roadmap/${rm.id}`)}
                    style={({ pressed }) => [styles.roadmapCard, pressed && { opacity: 0.9 }]}
                  >
                    <Ionicons name="map" size={20} color={colors.primary} />
                    <Text style={styles.roadmapCardTitle} numberOfLines={2}>
                      {rm.title}
                    </Text>
                    <Text style={styles.roadmapCardMeta}>
                      {stats.completed}/{stats.total} done
                    </Text>
                    <View style={styles.roadmapBarTrack}>
                      <View
                        style={[styles.roadmapBarFill, { width: `${stats.pct * 100}%` }]}
                      />
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        <LinearGradient
          colors={subject.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroIcon}>
            <Ionicons name={subject.icon as any} size={28} color={colors.white} />
          </View>
          <Text style={styles.heroTitle}>{subject.title}</Text>
          <Text style={styles.heroDesc}>{subject.description}</Text>
          <View style={styles.heroProgress}>
            <View style={styles.heroBarTrack}>
              <View style={[styles.heroBarFill, { width: `${pct * 100}%` }]} />
            </View>
            <Text style={styles.heroProgressText}>
              {done}/{total}
            </Text>
          </View>
        </LinearGradient>

        <UnitList subject={subject} masteryLevel={masteryFilter} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  searchBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {
    color: colors.text,
    fontSize: font.size.xxl,
    fontWeight: font.weight.heavy as '800',
  },
  subheading: { color: colors.textMuted, fontSize: font.size.sm, marginTop: 2 },
  chips: { gap: spacing.sm, paddingVertical: spacing.md, paddingRight: spacing.lg },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: {
    color: colors.textMuted,
    fontWeight: font.weight.semibold as '600',
    fontSize: font.size.sm,
  },
  trackChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  trackChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  trackChipText: {
    color: colors.textMuted,
    fontSize: font.size.xs,
    fontWeight: font.weight.bold as '700',
  },
  content: { padding: spacing.lg, gap: spacing.xl },
  roadmapsSection: { gap: spacing.md },
  roadmapsHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  roadmapsTitle: {
    color: colors.text,
    fontSize: font.size.lg,
    fontWeight: font.weight.bold as '700',
  },
  roadmapsLink: {
    color: colors.primary,
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold as '600',
  },
  roadmapsScroll: { gap: spacing.md, paddingRight: spacing.lg },
  roadmapCard: {
    width: 168,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    gap: spacing.sm,
  },
  roadmapCardTitle: {
    color: colors.text,
    fontSize: font.size.sm,
    fontWeight: font.weight.bold as '700',
    minHeight: 36,
  },
  roadmapCardMeta: { color: colors.textMuted, fontSize: font.size.xs },
  roadmapBarTrack: {
    height: 4,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    overflow: 'hidden',
    marginTop: 4,
  },
  roadmapBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
  },
  hero: {
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: 6,
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  heroTitle: {
    color: colors.white,
    fontSize: font.size.xxl,
    fontWeight: font.weight.heavy as '800',
  },
  heroDesc: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: font.size.sm,
    lineHeight: 20,
  },
  heroProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  heroBarTrack: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  heroBarFill: {
    height: '100%',
    backgroundColor: colors.white,
    borderRadius: radius.pill,
  },
  heroProgressText: {
    color: colors.white,
    fontWeight: font.weight.bold as '700',
    fontSize: font.size.sm,
  },
});
