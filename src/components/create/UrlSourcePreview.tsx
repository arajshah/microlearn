import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ExtractedUrlSource } from '@/types/urlSource';
import { getDomain } from '@/utils/urlSourceContext';
import { colors, font, radius, spacing } from '@/theme/theme';

interface Props {
  visible: boolean;
  source: ExtractedUrlSource | null;
  loading?: boolean;
  progressMessage?: string;
  onContinue: () => void;
  onRefresh: () => void;
  onCancel: () => void;
}

export function UrlSourcePreview({
  visible,
  source,
  loading,
  progressMessage,
  onContinue,
  onRefresh,
  onCancel,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.handle} />
        {loading || !source ? (
          <View style={styles.loadingWrap}>
            <Text style={styles.progress}>{progressMessage ?? 'Reading source…'}</Text>
          </View>
        ) : (
          <>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: '72%' }}>
              <Text style={styles.kicker}>Source preview</Text>
              <Text style={styles.title}>{source.title}</Text>
              <Text style={styles.meta}>{getDomain(source.originalUrl)}</Text>
              <Text style={styles.summary} numberOfLines={8}>
                {source.summary}
              </Text>

              {source.keyConcepts.length > 0 ? (
                <View style={styles.block}>
                  <Text style={styles.label}>Key concepts</Text>
                  <Text style={styles.chips}>
                    {source.keyConcepts.slice(0, 8).join(' · ')}
                  </Text>
                </View>
              ) : null}

              <Text style={styles.meta}>
                {source.sections.length} section{source.sections.length === 1 ? '' : 's'} extracted
              </Text>

              {source.sourceWarnings.length > 0 ? (
                <View style={styles.warnBox}>
                  <Ionicons name="warning-outline" size={16} color={colors.warning} />
                  <Text style={styles.warnText}>
                    {source.sourceWarnings.slice(0, 3).join(' ')}
                  </Text>
                </View>
              ) : null}

              <Text style={styles.url} numberOfLines={2}>
                {source.originalUrl}
              </Text>
            </ScrollView>

            <View style={styles.actions}>
              <Pressable onPress={onRefresh} style={styles.secondaryBtn}>
                <Ionicons name="refresh" size={16} color={colors.textMuted} />
                <Text style={styles.secondaryText}>Refresh</Text>
              </Pressable>
              <Pressable onPress={onContinue} style={styles.primaryBtn}>
                <Text style={styles.primaryText}>Continue</Text>
                <Ionicons name="arrow-forward" size={16} color={colors.bg} />
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    maxHeight: '88%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  loadingWrap: { paddingVertical: spacing.xxxl, alignItems: 'center' },
  progress: { color: colors.textMuted, fontSize: font.size.md },
  kicker: {
    color: colors.primary,
    fontSize: font.size.xs,
    fontWeight: font.weight.bold as '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  title: {
    color: colors.text,
    fontSize: font.size.xl,
    fontWeight: font.weight.heavy as '800',
    marginTop: spacing.sm,
  },
  meta: { color: colors.textFaint, fontSize: font.size.xs, marginTop: 4 },
  summary: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    lineHeight: 20,
    marginTop: spacing.md,
  },
  block: { marginTop: spacing.lg, gap: 4 },
  label: {
    color: colors.textFaint,
    fontSize: font.size.xs,
    fontWeight: font.weight.bold as '700',
    textTransform: 'uppercase',
  },
  chips: { color: colors.text, fontSize: font.size.sm, lineHeight: 19 },
  warnBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.md,
    alignItems: 'flex-start',
  },
  warnText: { flex: 1, color: colors.textMuted, fontSize: font.size.sm, lineHeight: 18 },
  url: { color: colors.textFaint, fontSize: font.size.xs, marginTop: spacing.md },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  secondaryText: { color: colors.textMuted, fontWeight: font.weight.semibold as '600' },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
  },
  primaryText: {
    color: colors.bg,
    fontWeight: font.weight.heavy as '800',
    fontSize: font.size.md,
  },
});
