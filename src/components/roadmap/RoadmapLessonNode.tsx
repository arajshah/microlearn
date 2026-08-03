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
import { useReducedMotion } from '@/hooks/useReducedMotion';
import {
  RoadmapLessonNode as LessonNode,
  RoadmapNodeStatus,
} from '@/types/roadmap';
import { NODE_STATUS_HINT, NODE_STATUS_LABEL } from '@/theme/cosmicNarrative';
import { colors, font, motion, radius, spacing } from '@/theme/theme';

interface Props {
  node: LessonNode;
  side: 'left' | 'right';
  onPress: () => void;
}

function statusStyle(status: RoadmapNodeStatus) {
  switch (status) {
    case 'completed':
      return {
        bg: colors.successDark,
        border: colors.success,
        icon: 'sunny' as const,
        ring: colors.signal,
      };
    case 'active':
      return {
        bg: colors.primaryDark,
        border: colors.primary,
        icon: 'navigate' as const,
        ring: colors.constellation,
      };
    case 'available':
      return {
        bg: colors.surfaceAlt,
        border: colors.constellation,
        icon: 'ellipse-outline' as const,
        ring: colors.border,
      };
    case 'generating':
      return {
        bg: colors.surfaceAlt,
        border: colors.textMuted,
        icon: 'hourglass' as const,
        ring: colors.borderSoft,
      };
    case 'error':
      return {
        bg: colors.dangerDark,
        border: colors.danger,
        icon: 'alert' as const,
        ring: colors.danger,
      };
    default:
      return {
        bg: colors.bgElevated,
        border: colors.borderSoft,
        icon: 'lock-closed' as const,
        ring: colors.borderSoft,
      };
  }
}

export function RoadmapPathNode({ node, side, onPress }: Props) {
  const s = statusStyle(node.status);
  const reduceMotion = useReducedMotion();
  const tappable = node.status !== 'generating';
  const pulse = useSharedValue(1);
  const statusLabel = NODE_STATUS_LABEL[node.status];

  useEffect(() => {
    if (node.status === 'active' && !reduceMotion) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1.06, { duration: motion.pulse }),
          withTiming(1, { duration: motion.pulse }),
        ),
        -1,
        true,
      );
    } else {
      pulse.value = 1;
    }
  }, [node.status, pulse, reduceMotion]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: node.status === 'active' && !reduceMotion ? pulse.value : 1 }],
  }));

  return (
    <View style={[styles.row, side === 'left' ? styles.rowLeft : styles.rowRight]}>
      <Pressable
        onPress={tappable ? onPress : undefined}
        disabled={!tappable}
        accessibilityRole="button"
        accessibilityLabel={`${node.title}, ${statusLabel}. ${NODE_STATUS_HINT[node.status]}`}
        accessibilityState={{ disabled: !tappable }}
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
            node.status === 'completed' && styles.nodeCompleted,
            animStyle,
          ]}
        >
          {node.status === 'active' || node.status === 'completed' ? (
            <View style={[styles.orbitRing, { borderColor: `${s.ring}66` }]} />
          ) : null}
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
        <Text
          style={[
            styles.status,
            node.status === 'completed' && { color: colors.success },
            node.status === 'active' && { color: colors.primary },
            node.status === 'error' && { color: colors.danger },
          ]}
        >
          {statusLabel}
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
  nodeCompleted: {
    shadowColor: colors.signal,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  orbitRing: {
    position: 'absolute',
    width: NODE + 10,
    height: NODE + 10,
    borderRadius: radius.pill,
    borderWidth: 1,
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
  status: {
    color: colors.textFaint,
    fontSize: 10,
    fontWeight: font.weight.bold as '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  meta: { color: colors.textFaint, fontSize: font.size.xs },
});
