import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MASTERY_TIERS, MasteryLevel } from '@/data/mastery';
import { DEPTH_HINTS, DEPTH_LABELS, RoadmapDepth } from '@/types/roadmap';
import { colors, font, radius, spacing } from '@/theme/theme';

export interface RoadmapFormValues {
  topic: string;
  goal: string;
  masteryLevel: MasteryLevel;
  depth: RoadmapDepth;
  preferences: string;
}

interface Props {
  values: RoadmapFormValues;
  onChange: (patch: Partial<RoadmapFormValues>) => void;
  loading: boolean;
  loadingMessage: string;
  error: string | null;
  disabled: boolean;
  onSubmit: () => void;
  onRetry?: () => void;
}

const DEPTHS: RoadmapDepth[] = ['quick', 'standard', 'deep'];

export function RoadmapGenerationForm({
  values,
  onChange,
  loading,
  loadingMessage,
  error,
  disabled,
  onSubmit,
  onRetry,
}: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Learning roadmap</Text>
      <Text style={styles.sub}>
        Generate a structured path of bite-sized lessons toward your goal.
      </Text>

      <Text style={styles.label}>Topic</Text>
      <TextInput
        value={values.topic}
        onChangeText={(topic) => onChange({ topic })}
        placeholder="e.g. Operating Systems"
        placeholderTextColor={colors.textFaint}
        style={styles.input}
        editable={!loading}
      />

      <Text style={styles.label}>Learning goal</Text>
      <TextInput
        value={values.goal}
        onChangeText={(goal) => onChange({ goal })}
        placeholder="What should you be able to understand or do?"
        placeholderTextColor={colors.textFaint}
        style={[styles.input, styles.inputMulti]}
        multiline
        editable={!loading}
      />

      <Text style={styles.label}>Mastery level</Text>
      <View style={styles.masteryRow}>
        {MASTERY_TIERS.map((tier) => {
          const active = values.masteryLevel === tier.level;
          return (
            <Pressable
              key={tier.level}
              onPress={() => onChange({ masteryLevel: tier.level })}
              disabled={loading}
              style={[styles.masteryChip, active && styles.masteryChipActive]}
            >
              <Text style={[styles.masteryNum, active && { color: colors.primary }]}>
                L{tier.level}
              </Text>
              <Text style={[styles.masteryName, active && { color: colors.text }]}>
                {tier.name}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>Depth</Text>
      <View style={styles.depthRow}>
        {DEPTHS.map((d) => {
          const active = values.depth === d;
          return (
            <Pressable
              key={d}
              onPress={() => onChange({ depth: d })}
              disabled={loading}
              style={[styles.depthChip, active && styles.depthChipActive]}
            >
              <Text style={[styles.depthTitle, active && { color: colors.text }]}>
                {DEPTH_LABELS[d]}
              </Text>
              <Text style={styles.depthHint}>{DEPTH_HINTS[d]}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>Preferences (optional)</Text>
      <TextInput
        value={values.preferences}
        onChangeText={(preferences) => onChange({ preferences })}
        placeholder="e.g. More examples and implementation intuition"
        placeholderTextColor={colors.textFaint}
        style={styles.input}
        editable={!loading}
      />

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>{loadingMessage}</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={16} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
          {onRetry ? (
            <Pressable onPress={onRetry} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <Pressable
        onPress={onSubmit}
        disabled={disabled || loading}
        style={[styles.submitBtn, (disabled || loading) && styles.submitDisabled]}
      >
        <Ionicons name="map" size={18} color={disabled || loading ? colors.textFaint : colors.bg} />
        <Text style={[styles.submitText, (disabled || loading) && { color: colors.textFaint }]}>
          Generate Roadmap
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  heading: {
    color: colors.text,
    fontSize: font.size.lg,
    fontWeight: font.weight.heavy as '800',
  },
  sub: { color: colors.textMuted, fontSize: font.size.sm, lineHeight: 19, marginBottom: spacing.sm },
  label: {
    color: colors.textMuted,
    fontSize: font.size.xs,
    fontWeight: font.weight.heavy as '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
  },
  input: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: font.size.md,
  },
  inputMulti: { minHeight: 72, textAlignVertical: 'top' },
  masteryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  masteryChip: {
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.bgElevated,
    minWidth: 64,
  },
  masteryChipActive: { borderColor: colors.primary, backgroundColor: colors.surfaceAlt },
  masteryNum: {
    color: colors.textFaint,
    fontSize: font.size.xs,
    fontWeight: font.weight.heavy as '800',
  },
  masteryName: { color: colors.textMuted, fontSize: 10, fontWeight: font.weight.semibold as '600' },
  depthRow: { gap: spacing.sm },
  depthChip: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.bgElevated,
  },
  depthChipActive: { borderColor: colors.primary, backgroundColor: colors.surfaceAlt },
  depthTitle: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    fontWeight: font.weight.bold as '700',
  },
  depthHint: { color: colors.textFaint, fontSize: font.size.xs, marginTop: 2 },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  loadingText: { color: colors.textMuted, fontSize: font.size.sm, flex: 1 },
  errorBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerDark,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  errorText: { flex: 1, color: colors.danger, fontSize: font.size.sm },
  retryBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  retryText: { color: colors.danger, fontWeight: font.weight.bold as '700' },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: radius.pill,
    marginTop: spacing.lg,
  },
  submitDisabled: { backgroundColor: colors.surfaceAlt },
  submitText: { color: colors.bg, fontSize: font.size.md, fontWeight: font.weight.heavy as '800' },
});
