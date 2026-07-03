import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, spacing } from '@/theme/theme';

interface Props {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  color?: string;
  background?: string;
}

export function Pill({ label, icon, color = colors.text, background = colors.surfaceAlt }: Props) {
  return (
    <View style={[styles.pill, { backgroundColor: background }]}>
      {icon ? <Ionicons name={icon} size={14} color={color} /> : null}
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  label: {
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold as '600',
  },
});
