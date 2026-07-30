import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { colors, font, radius, spacing } from '@/theme/theme';

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  accent?: string;
  disabled?: boolean;
  style?: ViewStyle;
};

export function PrimaryButton({
  label,
  onPress,
  icon,
  accent = colors.primary,
  disabled = false,
  style,
}: PrimaryButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: disabled ? colors.surfaceAlt : accent },
        pressed && !disabled && { opacity: 0.86, transform: [{ scale: 0.99 }] },
        style,
      ]}
    >
      <Text
        style={[styles.label, { color: disabled ? colors.textFaint : colors.bg }]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {icon ? (
        <Ionicons
          name={icon}
          size={18}
          color={disabled ? colors.textFaint : colors.bg}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 54,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  label: {
    fontSize: font.size.md,
    fontWeight: font.weight.heavy as '800',
    flexShrink: 1,
  },
});
