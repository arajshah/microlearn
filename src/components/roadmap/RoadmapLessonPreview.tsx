import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GeneratedRoadmap, RoadmapLessonNode } from '@/types/roadmap';
import { lockedReason } from '@/utils/roadmapProgress';
import { colors, font, radius, spacing } from '@/theme/theme';

interface Props {
  visible: boolean;
  roadmap: GeneratedRoadmap;
  node: RoadmapLessonNode | null;
  starting: boolean;
  onClose: () => void;
  onStart: () => void;
}

export function RoadmapLessonPreview({
  visible,
  roadmap,
  node,
  starting,
  onClose,
  onStart,
}: Props) {
  const insets = useSafeAreaInsets();
  if (!node) return null;

  const locked = node.status === 'locked';
  const canStart =
    !locked &&
    node.status !== 'generating' &&
    (node.status === 'available' ||
      node.status === 'active' ||
      node.status === 'error' ||
      (node.status === 'completed' && Boolean(node.generatedLessonId)));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.handle} />
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>{node.title}</Text>
          <Text style={styles.desc}>{node.shortDescription}</Text>

          <View style={styles.block}>
            <Text style={styles.label}>Objective</Text>
            <Text style={styles.body}>{node.learningObjective}</Text>
          </View>

          <View style={styles.metaRow}>
            <Text style={styles.meta}>{node.estimatedMinutes} min</Text>
            <Text style={styles.meta}>·</Text>
            <Text style={styles.meta}>Difficulty {node.difficulty}/5</Text>
          </View>

          {node.keyIdeas.length > 0 ? (
            <View style={styles.block}>
              <Text style={styles.label}>Key ideas</Text>
              {node.keyIdeas.map((k) => (
                <Text key={k} style={styles.bullet}>
                  • {k}
                </Text>
              ))}
            </View>
          ) : null}

          {locked ? (
            <View style={styles.lockBox}>
              <Ionicons name="lock-closed" size={18} color={colors.textMuted} />
              <Text style={styles.lockText}>{lockedReason(roadmap, node)}</Text>
            </View>
          ) : null}

          {node.status === 'error' ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>Lesson generation failed. Tap retry below.</Text>
            </View>
          ) : null}
        </ScrollView>

        {canStart ? (
          <Pressable
            onPress={onStart}
            disabled={starting}
            style={[styles.startBtn, starting && { opacity: 0.7 }]}
          >
            {starting ? (
              <ActivityIndicator color={colors.bg} />
            ) : (
              <>
                <Ionicons name="play" size={18} color={colors.bg} />
                <Text style={styles.startText}>
                  {node.generatedLessonId ? 'Open lesson' : node.status === 'error' ? 'Retry' : 'Start lesson'}
                </Text>
              </>
            )}
          </Pressable>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    maxHeight: '78%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: font.size.xl,
    fontWeight: font.weight.heavy as '800',
  },
  desc: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    lineHeight: 20,
    marginTop: spacing.sm,
  },
  block: { marginTop: spacing.lg, gap: 4 },
  label: {
    color: colors.textFaint,
    fontSize: font.size.xs,
    fontWeight: font.weight.bold as '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  body: { color: colors.text, fontSize: font.size.sm, lineHeight: 20 },
  metaRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  meta: { color: colors.textMuted, fontSize: font.size.sm },
  bullet: { color: colors.textMuted, fontSize: font.size.sm, lineHeight: 20 },
  lockBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.lg,
    alignItems: 'flex-start',
  },
  lockText: { flex: 1, color: colors.textMuted, fontSize: font.size.sm, lineHeight: 19 },
  errorBox: {
    backgroundColor: colors.dangerDark,
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.lg,
  },
  errorText: { color: colors.danger, fontSize: font.size.sm },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: radius.pill,
    marginTop: spacing.lg,
  },
  startText: {
    color: colors.bg,
    fontSize: font.size.md,
    fontWeight: font.weight.heavy as '800',
  },
});
