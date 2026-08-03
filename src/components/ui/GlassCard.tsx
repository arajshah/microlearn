import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';
import { colors, radius, shadow, spacing } from '@/theme/theme';

type GlassCardProps = {
  children: React.ReactNode;
  accent?: string;
  elevated?: boolean;
  padding?: number;
  style?: ViewProps['style'];
};

export function GlassCard({
  children,
  accent = colors.primary,
  elevated = false,
  padding = spacing.lg,
  style,
}: GlassCardProps) {
  return (
    <View style={[styles.wrap, elevated && shadow.card, style]}>
      <LinearGradient
        colors={[`${accent}22`, colors.nebula, colors.surface]}
        locations={[0, 0.45, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, { padding, borderColor: `${accent}40` }]}
      >
        {children}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.xl,
  },
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
});
