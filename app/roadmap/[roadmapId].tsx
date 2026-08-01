import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RoadmapHeader } from '@/components/roadmap/RoadmapHeader';
import { RoadmapLessonPreview } from '@/components/roadmap/RoadmapLessonPreview';
import { RoadmapUnitSection } from '@/components/roadmap/RoadmapUnitSection';
import { AppRefreshScrollView } from '@/components/ui';
import { useRoadmaps } from '@/context/RoadmapContext';
import { useProgress } from '@/context/ProgressContext';
import { isServerConfigured, listDiagnosticSessions } from '@/services/microlearnServer';
import { GeneratedRoadmap, RoadmapLessonNode } from '@/types/roadmap';
import { allRoadmapLessons, continueNode, roadmapStats, markNodeCompleted } from '@/utils/roadmapProgress';
import { colors, font, radius, spacing } from '@/theme/theme';
import { useScreenRefresh } from '@/hooks/useScreenRefresh';

function findFirstUsableNode(roadmap: GeneratedRoadmap): RoadmapLessonNode | undefined {
  const flat = allRoadmapLessons(roadmap);
  return flat.find(
    (node) =>
      node.status !== 'completed' &&
      node.status !== 'locked' &&
      node.status !== 'generating',
  );
}

export default function RoadmapScreen() {
  const { roadmapId } = useLocalSearchParams<{ roadmapId: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    getRoadmapById,
    openRoadmap,
    startRoadmapLesson,
    refreshRoadmapById,
    onRoadmapLessonCompleted,
    hydrated,
    pregenActive,
  } = useRoadmaps();
  const { isLessonComplete } = useProgress();

  const [freshRoadmap, setFreshRoadmap] = useState<GeneratedRoadmap | undefined>(undefined);
  const [previewNode, setPreviewNode] = useState<RoadmapLessonNode | null>(null);
  const [starting, setStarting] = useState(false);
  const [continueLoading, setContinueLoading] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [diagnosticDismissed, setDiagnosticDismissed] = useState(false);
  const [diagnosticDone, setDiagnosticDone] = useState<boolean | null>(null);

  const localRoadmap = roadmapId ? getRoadmapById(roadmapId) : undefined;
  const roadmap = localRoadmap ?? freshRoadmap;

  useEffect(() => {
    if (!localRoadmap) return;
    setFreshRoadmap(localRoadmap);
  }, [localRoadmap]);

  useEffect(() => {
    if (!roadmapId) return;
    setFreshRoadmap(undefined);
    void openRoadmap(roadmapId);
  }, [openRoadmap, roadmapId]);

  useEffect(() => {
    if (!roadmap) return;
    const finished = allRoadmapLessons(roadmap).find(
      (node) => node.status !== 'completed' && !!node.generatedLessonId && isLessonComplete(node.generatedLessonId),
    );
    if (finished) void onRoadmapLessonCompleted(roadmap.id, finished.id);
  }, [roadmap, isLessonComplete, onRoadmapLessonCompleted]);

  const refreshRoadmapScreen = useCallback(async () => {
    if (!roadmapId || !isServerConfigured()) {
      setDiagnosticDone(true);
      return;
    }
    const [fresh, sessions] = await Promise.all([
      refreshRoadmapById(roadmapId),
      listDiagnosticSessions({ roadmapId, status: 'completed', limit: 1 }),
    ]);
    if (fresh) setFreshRoadmap(fresh);
    setDiagnosticDone(sessions.length > 0);
  }, [refreshRoadmapById, roadmapId]);

  const {
    refreshing: refreshingRoadmap,
    isRefreshing: isRefreshingRoadmap,
    refresh,
  } = useScreenRefresh(refreshRoadmapScreen, { enabled: Boolean(roadmapId) });

  const handleContinue = useCallback(async () => {
    if (!roadmapId || continueLoading) return;

    setContinueLoading(true);
    setStartError(null);

    try {
      let workingRoadmap = roadmap;

      const fresh = await refreshRoadmapById(roadmapId);
      if (fresh) {
        workingRoadmap = fresh;
        setFreshRoadmap(fresh);
      }

      if (!workingRoadmap) {
        Alert.alert('Roadmap not found', 'Could not load this learning path.');
        return;
      }

      let next = continueNode(workingRoadmap);
      if (!next) {
        next = findFirstUsableNode(workingRoadmap);
      }

      if (!next) {
        const flat = allRoadmapLessons(workingRoadmap);
        console.warn('[roadmap] no continue node', {
          roadmapId: workingRoadmap.id,
          statuses: flat.map((l) => ({
            id: l.id,
            status: l.status,
            prereqs: l.prerequisiteIds,
          })),
        });
        const stats = roadmapStats(workingRoadmap);
        if (stats.total > 0 && stats.completed >= stats.total) {
          Alert.alert('Path complete', 'This roadmap is complete.');
        } else {
          Alert.alert('No lesson available', 'No available lesson found.');
        }
        return;
      }

      const { lessonId } = await startRoadmapLesson(workingRoadmap.id, next.id);
      router.push(
        `/lesson/${lessonId}?roadmapId=${workingRoadmap.id}&nodeId=${next.id}`,
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not start lesson.';
      Alert.alert('Could not start lesson', message);
      setStartError(message);
    } finally {
      setContinueLoading(false);
    }
  }, [roadmap, roadmapId, continueLoading, refreshRoadmapById, startRoadmapLesson, router]);

  const handleStart = async () => {
    if (!roadmap || !previewNode || !roadmapId) return;
    setStarting(true);
    setStartError(null);
    try {
      let workingRoadmap = roadmap;
      const fresh = await refreshRoadmapById(roadmapId);
      if (fresh) {
        workingRoadmap = fresh;
        setFreshRoadmap(fresh);
      }
      const { lessonId } = await startRoadmapLesson(workingRoadmap.id, previewNode.id);
      setPreviewNode(null);
      router.push(
        `/lesson/${lessonId}?roadmapId=${workingRoadmap.id}&nodeId=${previewNode.id}`,
      );
    } catch (e) {
      setStartError(e instanceof Error ? e.message : 'Could not start lesson.');
    } finally {
      setStarting(false);
    }
  };

  if (!hydrated || (isRefreshingRoadmap && !roadmap)) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.primary} />
        {isRefreshingRoadmap ? (
          <Text style={styles.loadingText}>Loading learning path…</Text>
        ) : null}
      </View>
    );
  }

  if (!roadmap) {
    return (
      <View style={[styles.center, { paddingTop: insets.top, padding: spacing.xl }]}>
        <Text style={styles.missingTitle}>Roadmap not found</Text>
        <Pressable onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.backLinkText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const showDiagnosticPrompt = diagnosticDone === false && !diagnosticDismissed;
  const units = [...roadmap.units].sort((a, b) => a.order - b.order);
  const generatedLessonCount = units.reduce(
    (sum, unit) => sum + unit.lessons.filter((lesson) => Boolean(lesson.generatedLessonId)).length,
    0,
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.textMuted} />
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>
          Learning path
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <AppRefreshScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxxl }]}
        showsVerticalScrollIndicator={false}
        refresh={{
          refreshing: refreshingRoadmap,
          onRefresh: refresh,
          accent: colors.paths,
          indicatorTopOffset: spacing.sm,
        }}
      >
        <RoadmapHeader
          roadmap={roadmap}
          onContinue={() => void handleContinue()}
          continueLoading={continueLoading}
          continueDisabled={continueLoading || (!roadmap && isRefreshingRoadmap)}
        />

        {showDiagnosticPrompt ? (
          <View style={styles.scheduleNote}>
            <View style={styles.scheduleIcon}>
              <Ionicons name="pulse-outline" size={18} color={colors.paths} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.scheduleTitle}>Run a quick diagnostic first?</Text>
              <Text style={styles.scheduleText}>
                A few questions calibrate lesson depth to what you already know.
              </Text>
            </View>
            <Pressable
              onPress={() => router.push(`/diagnostic?roadmapId=${encodeURIComponent(roadmap.id)}`)}
              hitSlop={8}
            >
              <Text style={styles.diagnosticCta}>Start</Text>
            </Pressable>
            <Pressable onPress={() => setDiagnosticDismissed(true)} hitSlop={8}>
              <Ionicons name="close" size={18} color={colors.textFaint} />
            </Pressable>
          </View>
        ) : null}

        {pregenActive ? (
          <View style={styles.pregenNote}>
            <ActivityIndicator color={colors.paths} size="small" />
            <Text style={styles.pregenText}>Preparing upcoming lessons…</Text>
          </View>
        ) : null}

        {generatedLessonCount > 0 ? (
          <View style={styles.scheduleNote}>
            <View style={styles.scheduleIcon}>
              <Ionicons name="calendar-outline" size={18} color={colors.retrieve} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.scheduleTitle}>Schedule roadmap lessons</Text>
              <Text style={styles.scheduleText}>
                Open a generated lesson to add it to retrieval.
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.pathSection}>
          {units.map((unit) => (
            <RoadmapUnitSection
              key={unit.id}
              unit={unit}
              onNodePress={setPreviewNode}
            />
          ))}
        </View>
      </AppRefreshScrollView>

      <RoadmapLessonPreview
        visible={previewNode !== null}
        roadmap={roadmap}
        node={previewNode}
        starting={starting}
        onClose={() => {
          setPreviewNode(null);
          setStartError(null);
        }}
        onStart={handleStart}
      />

      {startError ? (
        <View style={[styles.toast, { bottom: insets.bottom + spacing.lg }]}>
          <Text style={styles.toastText}>{startError}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  loadingText: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    marginTop: spacing.md,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  backBtn: { padding: 4 },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    color: colors.text,
    fontSize: font.size.md,
    fontWeight: font.weight.bold as '700',
  },
  content: { padding: spacing.lg, gap: spacing.xl },
  pathSection: { gap: spacing.xxxl },
  scheduleNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  scheduleIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: `${colors.retrieve}22`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleTitle: {
    color: colors.text,
    fontSize: font.size.sm,
    fontWeight: font.weight.bold as '700',
  },
  scheduleText: {
    color: colors.textMuted,
    fontSize: font.size.xs,
    lineHeight: 17,
    marginTop: 2,
  },
  diagnosticCta: {
    color: colors.paths,
    fontSize: font.size.sm,
    fontWeight: font.weight.heavy as '800',
    paddingHorizontal: spacing.sm,
  },
  pregenNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  pregenText: {
    color: colors.textMuted,
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold as '600',
  },
  missingTitle: { color: colors.text, fontSize: font.size.lg, fontWeight: font.weight.bold as '700' },
  backLink: { marginTop: spacing.lg },
  backLinkText: { color: colors.primary, fontWeight: font.weight.bold as '700' },
  toast: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.dangerDark,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  toastText: { color: colors.danger, fontSize: font.size.sm, textAlign: 'center' },
});
