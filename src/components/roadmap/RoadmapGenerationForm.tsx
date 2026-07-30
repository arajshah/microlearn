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
import {
  DEPTH_HINTS,
  ROADMAP_LESSON_PRESETS,
  ROADMAP_SLIDES_PRESETS,
  RoadmapDepth,
} from '@/types/roadmap';
import { colors, font, radius, spacing } from '@/theme/theme';

export interface RoadmapFormValues {
  topic: string;
  goal: string;
  masteryLevel: MasteryLevel;
  depth: RoadmapDepth;
  lessonCount: number;
  slidesPerLesson: number;
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
  showIntro?: boolean;
  submitLabel?: string;
  embedded?: boolean;
  hideTopic?: boolean;
}

const DEPTHS: RoadmapDepth[] = ['quick', 'standard', 'deep'];

const ROADMAP_SIZE_LABELS: Record<RoadmapDepth, string> = {
  quick: 'Short path',
  standard: 'Standard path',
  deep: 'Deep path',
};

function CountStepper({
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (n: number) => void;
}) {
  return (
    <View style={styles.stepperBlock}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.stepperRow}>
        <Pressable
          onPress={() => onChange(Math.max(min, value - 1))}
          disabled={disabled || value <= min}
          style={[styles.stepBtn, (disabled || value <= min) && styles.stepBtnDisabled]}
        >
          <Ionicons name="remove" size={16} color={colors.textMuted} />
        </Pressable>
        <Text style={styles.stepValue}>{value}</Text>
        <Pressable
          onPress={() => onChange(Math.min(max, value + 1))}
          disabled={disabled || value >= max}
          style={[styles.stepBtn, (disabled || value >= max) && styles.stepBtnDisabled]}
        >
          <Ionicons name="add" size={16} color={colors.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

export function RoadmapGenerationForm({
  values,
  onChange,
  loading,
  loadingMessage,
  error,
  disabled,
  onSubmit,
  onRetry,
  showIntro = true,
  submitLabel = 'Generate roadmap',
  embedded = false,
  hideTopic = false,
}: Props) {
  const selectDepth = (d: RoadmapDepth) => {
    onChange({
      depth: d,
      lessonCount: ROADMAP_LESSON_PRESETS[d],
      slidesPerLesson: ROADMAP_SLIDES_PRESETS[d],
    });
  };

  return (
    <View style={embedded ? styles.embedded : styles.card}>
      {showIntro ? (
        <>
          <Text style={styles.heading}>Learning roadmap</Text>
          <Text style={styles.sub}>
            Generate a structured path of bite-sized lessons toward your goal.
          </Text>
        </>
      ) : null}

      {hideTopic ? null : (
        <>
          <Text style={styles.label}>Topic</Text>
          <TextInput
            value={values.topic}
            onChangeText={(topic) => onChange({ topic })}
            placeholder="e.g. Operating Systems"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            editable={!loading}
          />
        </>
      )}

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

      <Text style={styles.label}>Roadmap size</Text>
      <View style={styles.depthRow}>
        {DEPTHS.map((d) => {
          const active = values.depth === d;
          return (
            <Pressable
              key={d}
              onPress={() => selectDepth(d)}
              disabled={loading}
              style={[styles.depthChip, active && styles.depthChipActive]}
            >
              <Text style={[styles.depthTitle, active && { color: colors.text }]}>
                {ROADMAP_SIZE_LABELS[d]}
              </Text>
              <Text style={styles.depthHint}>{DEPTH_HINTS[d]}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.stepperGrid}>
        <CountStepper
          label="Lessons in roadmap"
          value={values.lessonCount}
          min={3}
          max={30}
          disabled={loading}
          onChange={(lessonCount) => onChange({ lessonCount })}
        />
        <CountStepper
          label="Slides per lesson"
          value={values.slidesPerLesson}
          min={3}
          max={15}
          disabled={loading}
          onChange={(slidesPerLesson) => onChange({ slidesPerLesson })}
        />
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
          {submitLabel}
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
  embedded: {
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
  stepperGrid: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  stepperBlock: { flex: 1, minWidth: 0, gap: spacing.xs },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.xs,
  },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  stepBtnDisabled: { opacity: 0.4 },
  stepValue: {
    color: colors.text,
    fontSize: font.size.lg,
    fontWeight: font.weight.bold as '700',
    minWidth: 28,
    textAlign: 'center',
  },
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
