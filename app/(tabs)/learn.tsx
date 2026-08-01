import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ProgressBar } from '@/components/ProgressBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AppScreen,
  EmptyState,
  GlassCard,
  PrimaryButton,
  SectionHeader,
} from '@/components/ui';
import { useRoadmaps } from '@/context/RoadmapContext';
import { usePreferences } from '@/context/PreferencesContext';
import { useProgress } from '@/context/ProgressContext';
import { subjects } from '@/data/subjects';
import { SubjectId } from '@/types/content';
import { continueNode, roadmapStats } from '@/utils/roadmapProgress';
import { colors, font, gradients, radius, shadow, spacing } from '@/theme/theme';

function RoadmapListCard({
  title,
  topic,
  subtitle,
  completed,
  total,
  pct,
  onPress,
  onDelete,
}: {
  title: string;
  topic: string;
  subtitle: string;
  completed: number;
  total: number;
  pct: number;
  onPress: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={styles.roadmapRow}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.roadmapRowMain, pressed && { opacity: 0.92 }]}
      >
        <View style={styles.roadmapRowIcon}>
          <Ionicons name="map" size={18} color={colors.paths} />
        </View>
        <View style={styles.roadmapRowBody}>
          <Text style={styles.roadmapRowTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.roadmapRowTopic} numberOfLines={1}>
            {topic}
          </Text>
          <Text style={styles.roadmapRowSub} numberOfLines={1}>
            {subtitle}
          </Text>
          <View style={styles.roadmapRowProgress}>
            <ProgressBar progress={pct} color={colors.paths} height={4} />
            <Text style={styles.roadmapRowMeta}>
              {completed} of {total} lessons
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
      </Pressable>
      <Pressable onPress={onDelete} hitSlop={10} style={styles.roadmapDeleteBtn}>
        <Ionicons name="trash-outline" size={17} color={colors.textFaint} />
      </Pressable>
    </View>
  );
}

export default function LearnScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { subjectProgress } = useProgress();
  const { interests } = usePreferences();
  const {
    roadmaps,
    hydrated: roadmapsHydrated,
    refreshingRoadmaps,
    lastOpenedRoadmap,
    deleteRoadmap,
    refreshRoadmaps,
  } = useRoadmaps();

  const requestRoadmapRefresh = useCallback(() => {
    void refreshRoadmaps().catch(() => {});
  }, [refreshRoadmaps]);

  useFocusEffect(
    useCallback(() => {
      requestRoadmapRefresh();
    }, [requestRoadmapRefresh]),
  );

  const orderedSubjects = useMemo(
    () =>
      [...subjects].sort(
        (a, b) =>
          (interests.includes(b.id) ? 1 : 0) - (interests.includes(a.id) ? 1 : 0),
      ),
    [interests],
  );

  const [selectedSubjectId, setSelectedSubjectId] = useState<SubjectId>(subjects[0].id);
  const pickedInitial = useRef(false);

  useEffect(() => {
    if (!pickedInitial.current && interests.length > 0) {
      pickedInitial.current = true;
      setSelectedSubjectId(interests[0]);
    }
  }, [interests]);

  const continueRoadmap = useMemo(() => {
    if (lastOpenedRoadmap) return lastOpenedRoadmap;
    if (roadmaps.length > 0) return roadmaps[0];
    return null;
  }, [lastOpenedRoadmap, roadmaps]);

  const continueStats = continueRoadmap ? roadmapStats(continueRoadmap) : null;
  const continueNext = continueRoadmap ? continueNode(continueRoadmap) : null;
  const continueComplete =
    continueStats !== null && continueStats.total > 0 && continueStats.completed >= continueStats.total;

  const listedRoadmaps = roadmaps;

  const subject = subjects.find((s) => s.id === selectedSubjectId)!;
  const { done } = subjectProgress(subject.id);

  const confirmDeleteRoadmap = (id: string, title: string) => {
    Alert.alert('Delete roadmap?', `Remove "${title}" from your paths?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteRoadmap(id) },
    ]);
  };

  return (
    <AppScreen
      scroll
      contentStyle={styles.content}
      scrollProps={{
        refreshControl: (
          <RefreshControl
            refreshing={refreshingRoadmaps}
            onRefresh={requestRoadmapRefresh}
            tintColor={colors.white}
            colors={[colors.white, colors.paths]}
            progressBackgroundColor={colors.surfaceAlt}
            progressViewOffset={insets.top + spacing.sm}
          />
        ),
      }}
    >
      <View style={styles.header}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title}>Paths</Text>
          <Text style={styles.subtitle}>Your long-term learning journeys</Text>
        </View>
        <Pressable onPress={() => router.push('/search')} hitSlop={8} style={styles.iconBtn}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
        </Pressable>
        <Pressable onPress={() => router.push('/create')} hitSlop={8} style={styles.iconBtn}>
          <Ionicons name="add" size={20} color={colors.textMuted} />
        </Pressable>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Continue learning" />
        {roadmapsHydrated && continueRoadmap && continueStats ? (
          <LinearGradient
            colors={gradients.paths}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.continueCard}
          >
            <Text style={styles.continueKicker}>
              {continueComplete ? 'Path complete' : 'Up next'}
            </Text>
            <Text style={styles.continueTitle} numberOfLines={2}>
              {continueRoadmap.title}
            </Text>
            {!continueComplete && continueNext ? (
              <Text style={styles.continueNext} numberOfLines={1}>
                {continueNext.title}
              </Text>
            ) : (
              <Text style={styles.continueNext} numberOfLines={1}>
                {continueRoadmap.goal}
              </Text>
            )}
            <View style={styles.continueProgress}>
              <ProgressBar
                progress={continueStats.pct}
                color={colors.white}
                trackColor="rgba(255,255,255,0.25)"
                height={6}
              />
              <Text style={styles.continueMeta}>
                {continueStats.completed} of {continueStats.total} lessons
              </Text>
            </View>
            <PrimaryButton
              label={continueComplete ? 'Open path' : 'Continue'}
              icon="arrow-forward"
              accent={colors.white}
              onPress={() => router.push(`/roadmap/${continueRoadmap.id}`)}
              style={styles.continueBtn}
            />
          </LinearGradient>
        ) : (
          <GlassCard accent={colors.paths}>
            <EmptyState
              icon="map-outline"
              title="No path in progress"
              message="Create a roadmap to start a structured learning journey."
              actionLabel="Create roadmap"
              onActionPress={() => router.push('/create')}
              accent={colors.paths}
            />
          </GlassCard>
        )}
      </View>

      {roadmapsHydrated ? (
        <View style={styles.section}>
          <SectionHeader
            title="Your roadmaps"
            subtitle={roadmaps.length > 0 ? `${roadmaps.length} saved` : undefined}
            actionLabel="New"
            onActionPress={() => router.push('/create')}
          />
          {listedRoadmaps.length > 0 ? (
            <View style={styles.roadmapList}>
              {listedRoadmaps.map((rm) => {
                const stats = roadmapStats(rm);
                const next = continueNode(rm);
                const complete = stats.total > 0 && stats.completed >= stats.total;
                return (
                  <RoadmapListCard
                    key={rm.id}
                    title={rm.title}
                    topic={rm.topic}
                    subtitle={
                      complete ? rm.goal : next ? `Next: ${next.title}` : rm.goal
                    }
                    completed={stats.completed}
                    total={stats.total}
                    pct={stats.pct}
                    onPress={() => router.push(`/roadmap/${rm.id}`)}
                    onDelete={() => confirmDeleteRoadmap(rm.id, rm.title)}
                  />
                );
              })}
            </View>
          ) : (
            <Text style={styles.mutedNote}>
              Create a lesson or roadmap to start learning.
            </Text>
          )}
        </View>
      ) : null}

      <View style={[styles.section, styles.browseSection]}>
        <SectionHeader
          title="Browse subjects"
          subtitle="Pick a category when creating lessons or roadmaps"
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {orderedSubjects.map((s) => {
            const active = s.id === selectedSubjectId;
            return (
              <Pressable
                key={s.id}
                onPress={() => setSelectedSubjectId(s.id)}
                style={[
                  styles.chip,
                  active && { backgroundColor: s.accent, borderColor: s.accent },
                ]}
              >
                <Ionicons
                  name={s.icon as keyof typeof Ionicons.glyphMap}
                  size={15}
                  color={active ? colors.bg : colors.textMuted}
                />
                <Text style={[styles.chipText, active && { color: colors.bg }]}>{s.title}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <GlassCard accent={subject.accent}>
          <View style={styles.subjectPreview}>
            <View style={[styles.subjectPreviewIcon, { backgroundColor: `${subject.accent}22` }]}>
              <Ionicons
                name={subject.icon as keyof typeof Ionicons.glyphMap}
                size={22}
                color={subject.accent}
              />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.subjectPreviewTitle}>{subject.title}</Text>
              <Text style={styles.subjectPreviewDesc} numberOfLines={3}>
                {subject.description}
              </Text>
              {done > 0 ? (
                <Text style={styles.subjectPreviewMeta}>{done} lesson{done === 1 ? '' : 's'} completed</Text>
              ) : null}
            </View>
          </View>
          <PrimaryButton
            label={`Create in ${subject.title}`}
            icon="sparkles"
            accent={subject.accent}
            onPress={() => router.push({ pathname: '/create', params: { subjectId: subject.id } })}
            style={styles.viewLessonsBtn}
          />
        </GlassCard>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.xl },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: font.size.xxxl,
    fontWeight: font.weight.heavy as '800',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    lineHeight: 20,
    marginTop: 4,
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

  section: { gap: spacing.md },

  continueCard: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.sm,
    ...shadow.card,
  },
  continueKicker: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold as '600',
  },
  continueTitle: {
    color: colors.white,
    fontSize: font.size.xl,
    fontWeight: font.weight.heavy as '800',
  },
  continueNext: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: font.size.sm,
    lineHeight: 20,
  },
  continueProgress: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  continueMeta: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold as '600',
  },
  continueBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.white,
  },

  roadmapList: { gap: spacing.sm },
  roadmapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    overflow: 'hidden',
  },
  roadmapRowMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    paddingRight: spacing.sm,
  },
  roadmapRowIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: `${colors.paths}18`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roadmapRowBody: { flex: 1, minWidth: 0, gap: 2 },
  roadmapRowTitle: {
    color: colors.text,
    fontSize: font.size.md,
    fontWeight: font.weight.bold as '700',
  },
  roadmapRowTopic: {
    color: colors.textMuted,
    fontSize: font.size.xs,
  },
  roadmapRowSub: {
    color: colors.textFaint,
    fontSize: font.size.xs,
    marginTop: 2,
  },
  roadmapRowProgress: {
    gap: 4,
    marginTop: spacing.sm,
  },
  roadmapRowMeta: {
    color: colors.textFaint,
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold as '600',
  },
  roadmapDeleteBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    alignSelf: 'stretch',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: colors.borderSoft,
  },

  mutedNote: {
    color: colors.textFaint,
    fontSize: font.size.sm,
    lineHeight: 20,
  },

  browseSection: {
    marginTop: spacing.sm,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },

  chips: { gap: spacing.sm, paddingRight: spacing.lg },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    maxWidth: 180,
  },
  chipText: {
    color: colors.textMuted,
    fontWeight: font.weight.semibold as '600',
    fontSize: font.size.sm,
    flexShrink: 1,
  },

  subjectPreview: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  subjectPreviewIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subjectPreviewTitle: {
    color: colors.text,
    fontSize: font.size.md,
    fontWeight: font.weight.bold as '700',
  },
  subjectPreviewDesc: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    lineHeight: 19,
    marginTop: 2,
  },
  subjectPreviewMeta: {
    color: colors.textFaint,
    fontSize: font.size.xs,
    marginTop: spacing.sm,
  },
  viewLessonsBtn: {
    marginTop: spacing.lg,
  },
});
