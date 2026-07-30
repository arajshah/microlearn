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
        colors={[`${accent}18`, colors.surface]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, { padding, borderColor: `${accent}33` }]}
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
