import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RoadmapLessonNode as NodeType, RoadmapUnit } from '@/types/roadmap';
import { RoadmapPathNode } from './RoadmapLessonNode';
import { colors, font, radius, spacing } from '@/theme/theme';
import { ProgressBar } from '@/components/ProgressBar';

interface Props {
  unit: RoadmapUnit;
  onNodePress: (node: NodeType) => void;
}

export function RoadmapUnitSection({ unit, onNodePress }: Props) {
  const lessons = [...unit.lessons].sort((a, b) => a.order - b.order);
  const done = lessons.filter((l) => l.status === 'completed').length;
  const pct = lessons.length ? done / lessons.length : 0;

  return (
    <View style={styles.section}>
      <View style={styles.unitHeader}>
        <Text style={styles.unitTitle}>{unit.title}</Text>
        <Text style={styles.unitDesc}>{unit.description}</Text>
        <View style={styles.unitProgress}>
          <ProgressBar progress={pct} color={colors.primary} height={5} />
          <Text style={styles.unitProgressText}>
            {done}/{lessons.length}
          </Text>
        </View>
      </View>

      <View style={styles.pathWrap}>
        <View style={styles.centerLine} />

        {lessons.map((lesson, i) => (
          <RoadmapPathNode
            key={lesson.id}
            node={lesson}
            side={i % 2 === 0 ? 'left' : 'right'}
            onPress={() => onNodePress(lesson)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  unitHeader: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    gap: 4,
  },
  unitTitle: {
    color: colors.text,
    fontSize: font.size.lg,
    fontWeight: font.weight.heavy as '800',
  },
  unitDesc: { color: colors.textMuted, fontSize: font.size.sm, lineHeight: 19 },
  unitProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  unitProgressText: {
    color: colors.textFaint,
    fontSize: font.size.xs,
    fontWeight: font.weight.bold as '700',
  },
  pathWrap: {
    position: 'relative',
    minHeight: 80,
    paddingVertical: spacing.sm,
  },
  centerLine: {
    position: 'absolute',
    left: '50%',
    top: spacing.md,
    bottom: spacing.md,
    width: 3,
    marginLeft: -1.5,
    backgroundColor: colors.borderSoft,
    borderRadius: radius.pill,
  },
});
