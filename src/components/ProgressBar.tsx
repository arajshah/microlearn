import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radius } from '@/theme/theme';

interface Props {
  progress: number; // 0..1
  color?: string;
  trackColor?: string;
  height?: number;
}

export function ProgressBar({
  progress,
  color = colors.primary,
  trackColor = colors.surfaceAlt,
  height = 8,
}: Props) {
  const pct = Math.max(0, Math.min(1, progress));
  return (
    <View
      style={[styles.track, { backgroundColor: trackColor, height, borderRadius: height }]}
    >
      <View
        style={{
          width: `${pct * 100}%`,
          height: '100%',
          backgroundColor: color,
          borderRadius: height,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: radius.pill,
  },
});
