import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { ServerSourceDocument } from '@/services/microlearnServer';
import { colors, font, radius, spacing } from '@/theme/theme';

type Props = {
  source: ServerSourceDocument | null;
  loading?: boolean;
  error?: string | null;
  onClear?: () => void;
  onRetry?: () => void;
  accent?: string;
};

export function ServerSourcePreview({
  source,
  loading,
  error,
  onClear,
  onRetry,
  accent = colors.create,
}: Props) {
  if (loading) {
    return (
      <View style={styles.box}>
        <ActivityIndicator color={accent} />
        <Text style={styles.loadingText}>Extracting document…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.box, styles.errorBox]}>
        <Ionicons name="alert-circle" size={18} color={colors.danger} />
        <Text style={styles.errorText}>{error}</Text>
        {onRetry ? (
          <Pressable onPress={onRetry} style={styles.retryBtn}>
            <Text style={[styles.retryText, { color: accent }]}>Retry</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (!source) return null;

  if (source.status === 'failed') {
    return (
      <View style={[styles.box, styles.errorBox]}>
        <Ionicons name="close-circle" size={18} color={colors.danger} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.errorText}>
            {source.errorMessage ?? 'Could not extract this document. Try another link or paste the text.'}
          </Text>
        </View>
        {onRetry ? (
          <Pressable onPress={onRetry} hitSlop={8}>
            <Text style={[styles.retryText, { color: accent }]}>Retry</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.box, styles.readyBox]}>
      <View style={styles.readyTop}>
        <Ionicons name="checkmark-circle" size={18} color={colors.success} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={2}>
            {source.title ?? 'Extracted document'}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {source.summary?.wordCount != null
              ? `${source.summary.wordCount} words ready`
              : 'Document ready'}
          </Text>
        </View>
        {onClear ? (
          <Pressable onPress={onClear} hitSlop={8}>
            <Ionicons name="close-circle" size={20} color={colors.textFaint} />
          </Pressable>
        ) : null}
      </View>
      {source.summary?.preview ? (
        <Text style={styles.preview} numberOfLines={4}>
          {source.summary.preview}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.bgElevated,
    padding: spacing.md,
    gap: spacing.sm,
  },
  loadingText: { color: colors.textMuted, fontSize: font.size.sm },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  errorText: { color: colors.text, fontSize: font.size.sm, flex: 1, lineHeight: 19 },
  retryBtn: { paddingHorizontal: spacing.sm },
  retryText: { fontWeight: font.weight.bold as '700', fontSize: font.size.sm },
  readyBox: { gap: spacing.sm },
  readyTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  title: { color: colors.text, fontSize: font.size.sm, fontWeight: font.weight.bold as '700' },
  meta: { color: colors.textMuted, fontSize: font.size.xs, marginTop: 2 },
  preview: { color: colors.textFaint, fontSize: font.size.xs, lineHeight: 17 },
});
