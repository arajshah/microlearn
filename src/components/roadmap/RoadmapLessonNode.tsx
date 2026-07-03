import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import {
  RoadmapLessonNode as LessonNode,
  RoadmapNodeStatus,
} from '@/types/roadmap';
import { colors, font, radius, spacing } from '@/theme/theme';

interface Props {
  node: LessonNode;
  side: 'left' | 'right';
  onPress: () => void;
}

function statusStyle(status: RoadmapNodeStatus) {
  switch (status) {
    case 'completed':
      return { bg: colors.successDark, border: colors.success, icon: 'checkmark' as const };
    case 'active':
      return { bg: colors.primaryDark, border: colors.primary, icon: 'play' as const };
    case 'available':
      return { bg: colors.surfaceAlt, border: colors.primary, icon: 'ellipse-outline' as const };
    case 'generating':
      return { bg: colors.surfaceAlt, border: colors.textMuted, icon: 'hourglass' as const };
    case 'error':
      return { bg: colors.dangerDark, border: colors.danger, icon: 'alert' as const };
    default:
      return { bg: colors.bgElevated, border: colors.borderSoft, icon: 'lock-closed' as const };
  }
}

export function RoadmapPathNode({ node, side, onPress }: Props) {
  const s = statusStyle(node.status);
  // Locked/completed: preview only. Generating stays non-interactive per spec.
  const tappable = node.status !== 'generating';
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (node.status === 'active') {
      pulse.value = withRepeat(
        withSequence(withTiming(1.06, { duration: 900 }), withTiming(1, { duration: 900 })),
        -1,
        true,
      );
    } else {
      pulse.value = 1;
    }
  }, [node.status, pulse]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: node.status === 'active' ? pulse.value : 1 }],
  }));

  return (
    <View style={[styles.row, side === 'left' ? styles.rowLeft : styles.rowRight]}>
      <Pressable
        onPress={tappable ? onPress : undefined}
        disabled={!tappable}
        style={({ pressed }) => [pressed && tappable && { opacity: 0.85 }]}
      >
        <Animated.View
          style={[
            styles.node,
            {
              backgroundColor: s.bg,
              borderColor: s.border,
              opacity: node.status === 'locked' ? 0.55 : 1,
            },
            node.status === 'active' && styles.nodeActive,
            animStyle,
          ]}
        >
          {node.status === 'generating' ? (
            <ActivityIndicator size="small" color={colors.textMuted} />
          ) : (
            <Ionicons
              name={s.icon}
              size={node.status === 'completed' ? 22 : 18}
              color={node.status === 'locked' ? colors.textFaint : colors.text}
            />
          )}
        </Animated.View>
      </Pressable>
      <View style={[styles.labelWrap, side === 'left' ? styles.labelLeft : styles.labelRight]}>
        <Text
          style={[styles.label, node.status === 'locked' && styles.labelMuted]}
          numberOfLines={2}
        >
          {node.title}
        </Text>
        <Text style={styles.meta}>{node.estimatedMinutes} min</Text>
      </View>
    </View>
  );
}

const NODE = 52;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    minHeight: NODE + spacing.lg,
    paddingVertical: spacing.sm,
  },
  rowLeft: { justifyContent: 'flex-start', paddingLeft: '18%' },
  rowRight: { justifyContent: 'flex-end', paddingRight: '18%', flexDirection: 'row-reverse' },
  node: {
    width: NODE,
    height: NODE,
    borderRadius: radius.pill,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeActive: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 6,
  },
  labelWrap: { maxWidth: '42%', gap: 2 },
  labelLeft: { marginLeft: spacing.md, alignItems: 'flex-start' },
  labelRight: { marginRight: spacing.md, alignItems: 'flex-end' },
  label: {
    color: colors.text,
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold as '600',
  },
  labelMuted: { color: colors.textFaint },
  meta: { color: colors.textFaint, fontSize: font.size.xs },
});
