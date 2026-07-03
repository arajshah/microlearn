import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { UrlExtractionErrorCode } from '@/types/urlSource';
import { colors, font, radius, spacing } from '@/theme/theme';

const MESSAGES: Record<UrlExtractionErrorCode, string> = {
  INVALID_URL: 'Enter a complete public URL beginning with http:// or https://.',
  PRIVATE_URL: 'Local and private network URLs cannot be read. Paste the text directly instead.',
  UNSUPPORTED_SOURCE: 'This type of link is not supported. Try a public webpage or direct PDF link.',
  LOGIN_REQUIRED:
    'This page cannot be read because it requires access or a subscription. Paste the relevant text instead.',
  PAYWALL:
    'This page cannot be read because it requires access or a subscription. Paste the relevant text instead.',
  UNSAFE_URL: 'This source could not be processed by the content safety check.',
  NOT_FOUND: 'This page could not be found or accessed. Check the URL or paste the text directly.',
  RATE_LIMITED:
    'The URL-reading limit has been reached temporarily. Try again later or paste the source text.',
  TIMEOUT: 'The source took too long to read. Try again or paste the text directly.',
  NETWORK_ERROR: 'Could not reach the source reader. Check your connection or paste the text directly.',
  AUTH_ERROR: 'Add your Google AI API key in Settings to read URLs.',
  MALFORMED_RESPONSE: 'The source could not be structured reliably. Try again or paste the text directly.',
  EMPTY_CONTENT: 'No readable educational content was found. Paste the text directly instead.',
  UNKNOWN: 'Could not read that URL. Try again or paste the text directly.',
};

interface Props {
  code?: UrlExtractionErrorCode;
  message?: string;
  onRetry?: () => void;
  onPasteInstead?: () => void;
  onContinueWithout?: () => void;
  onCancel?: () => void;
}

export function UrlSourceError({
  code,
  message,
  onRetry,
  onPasteInstead,
  onContinueWithout,
  onCancel,
}: Props) {
  const text = message ?? (code ? MESSAGES[code] : MESSAGES.UNKNOWN);

  return (
    <View style={styles.box}>
      <View style={styles.head}>
        <Ionicons name="alert-circle" size={18} color={colors.danger} />
        <Text style={styles.text}>{text}</Text>
      </View>
      <View style={styles.actions}>
        {onRetry ? (
          <Pressable onPress={onRetry} style={styles.btn}>
            <Text style={styles.btnText}>Retry</Text>
          </Pressable>
        ) : null}
        {onPasteInstead ? (
          <Pressable onPress={onPasteInstead} style={styles.btn}>
            <Text style={styles.btnText}>Paste text</Text>
          </Pressable>
        ) : null}
        {onContinueWithout ? (
          <Pressable onPress={onContinueWithout} style={styles.btn}>
            <Text style={styles.btnText}>Continue without source</Text>
          </Pressable>
        ) : null}
        {onCancel ? (
          <Pressable onPress={onCancel} style={styles.btnGhost}>
            <Text style={styles.btnGhostText}>Cancel</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.dangerDark,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
    padding: spacing.md,
    gap: spacing.sm,
  },
  head: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  text: { flex: 1, color: colors.danger, fontSize: font.size.sm, lineHeight: 19 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  btn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
  },
  btnText: { color: colors.danger, fontWeight: font.weight.bold as '700', fontSize: font.size.xs },
  btnGhost: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  btnGhostText: { color: colors.textMuted, fontSize: font.size.xs },
});
