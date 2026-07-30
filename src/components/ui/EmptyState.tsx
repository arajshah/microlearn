import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, spacing } from '@/theme/theme';
import { PrimaryButton } from './PrimaryButton';

type EmptyStateProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  actionLabel?: string;
  onActionPress?: () => void;
  accent?: string;
};

export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onActionPress,
  accent = colors.primary,
}: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <View style={[styles.iconWrap, { backgroundColor: `${accent}1F`, borderColor: `${accent}33` }]}>
        <Ionicons name={icon} size={30} color={accent} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {actionLabel && onActionPress ? (
        <PrimaryButton label={actionLabel} onPress={onActionPress} accent={accent} icon="arrow-forward" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xxl,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.text,
    fontSize: font.size.xl,
    fontWeight: font.weight.heavy as '800',
    textAlign: 'center',
  },
  message: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 280,
  },
});
