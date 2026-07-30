import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, spacing } from '@/theme/theme';

type ActionCardProps = {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent?: string;
  meta?: string;
  onPress: () => void;
};

export function ActionCard({
  title,
  subtitle,
  icon,
  accent = colors.primary,
  meta,
  onPress,
}: ActionCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.88, transform: [{ scale: 0.99 }] }]}
    >
      <View style={[styles.icon, { backgroundColor: `${accent}1F` }]}>
        <Ionicons name={icon} size={21} color={accent} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={2}>
          {subtitle}
        </Text>
        {meta ? (
          <Text style={[styles.meta, { color: accent }]} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.lg,
  },
  icon: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.text,
    fontSize: font.size.md,
    fontWeight: font.weight.bold as '700',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    lineHeight: 19,
    marginTop: 2,
  },
  meta: {
    fontSize: font.size.xs,
    fontWeight: font.weight.heavy as '800',
    marginTop: spacing.sm,
    letterSpacing: 0.5,
  },
});
