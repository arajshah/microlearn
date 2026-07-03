import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RoadmapHeader } from '@/components/roadmap/RoadmapHeader';
import { RoadmapLessonPreview } from '@/components/roadmap/RoadmapLessonPreview';
import { RoadmapUnitSection } from '@/components/roadmap/RoadmapUnitSection';
import { continueNode, useRoadmaps } from '@/context/RoadmapContext';
import { RoadmapLessonNode } from '@/types/roadmap';
import { colors, font, radius, spacing } from '@/theme/theme';

export default function RoadmapScreen() {
  const { roadmapId } = useLocalSearchParams<{ roadmapId: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getRoadmapById, openRoadmap, startRoadmapLesson, hydrated } = useRoadmaps();

  const [previewNode, setPreviewNode] = useState<RoadmapLessonNode | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const roadmap = roadmapId ? getRoadmapById(roadmapId) : undefined;

  useEffect(() => {
    if (roadmapId) void openRoadmap(roadmapId);
  }, [roadmapId, openRoadmap]);

  const handleContinue = useCallback(() => {
    if (!roadmap) return;
    const next = continueNode(roadmap);
    if (next) setPreviewNode(next);
  }, [roadmap]);

  const handleStart = async () => {
    if (!roadmap || !previewNode) return;
    setStarting(true);
    setStartError(null);
    try {
      const { lessonId } = await startRoadmapLesson(roadmap.id, previewNode.id);
      setPreviewNode(null);
      router.push(`/lesson/${lessonId}?roadmapId=${roadmap.id}&nodeId=${previewNode.id}`);
    } catch (e) {
      setStartError(e instanceof Error ? e.message : 'Could not start lesson.');
    } finally {
      setStarting(false);
    }
  };

  if (!hydrated) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.primary} />
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

  const units = [...roadmap.units].sort((a, b) => a.order - b.order);

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

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxxl }]}
        showsVerticalScrollIndicator={false}
      >
        <RoadmapHeader roadmap={roadmap} onContinue={handleContinue} />

        <View style={styles.pathSection}>
          {units.map((unit) => (
            <RoadmapUnitSection
              key={unit.id}
              unit={unit}
              onNodePress={setPreviewNode}
            />
          ))}
        </View>
      </ScrollView>

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
