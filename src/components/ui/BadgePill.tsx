import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, spacing } from '@/theme/theme';

type BadgePillProps = {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  accent?: string;
  subtle?: boolean;
};

export function BadgePill({
  label,
  icon,
  accent = colors.primary,
  subtle = true,
}: BadgePillProps) {
  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: subtle ? `${accent}1F` : accent,
          borderColor: `${accent}44`,
        },
      ]}
    >
      {icon ? <Ionicons name={icon} size={13} color={subtle ? accent : colors.bg} /> : null}
      <Text style={[styles.label, { color: subtle ? accent : colors.bg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    maxWidth: '100%',
  },
  label: {
    fontSize: font.size.xs,
    fontWeight: font.weight.heavy as '800',
    flexShrink: 1,
  },
});
