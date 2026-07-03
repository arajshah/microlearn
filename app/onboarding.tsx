import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MASTERY_TIERS, MasteryLevel } from '@/data/mastery';
import { usePreferences } from '@/context/PreferencesContext';
import { subjects } from '@/data/courses';
import { SubjectId } from '@/types/content';
import { colors, font, radius, spacing } from '@/theme/theme';

const LEVEL_ICONS: Record<MasteryLevel, keyof typeof Ionicons.glyphMap> = {
  1: 'leaf',
  2: 'compass',
  3: 'fitness',
  4: 'school',
  5: 'rocket',
};

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { completeOnboarding, skipOnboarding } = usePreferences();

  const [step, setStep] = useState(0);
  const [interests, setInterests] = useState<SubjectId[]>([]);
  const [level, setLevel] = useState<MasteryLevel>(3);

  const finish = () => {
    completeOnboarding(level, interests);
    router.replace('/');
  };

  const toggleInterest = (id: SubjectId) =>
    setInterests((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
      <View style={styles.progressRow}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={[styles.progressDot, i <= step && { backgroundColor: colors.primary }]}
          />
        ))}
      </View>

      {step === 0 ? (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <LinearGradient
            colors={[colors.primary, colors.primaryDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <Ionicons name="bulb" size={44} color={colors.white} />
          </LinearGradient>
          <Text style={styles.bigTitle}>Welcome to Microlearn</Text>
          <Text style={styles.bigSub}>
            Beautiful bite-sized lessons across seven subjects — with spaced
            repetition, daily challenges, and an AI tutor at your side.
          </Text>
        </ScrollView>
      ) : null}

      {step === 1 ? (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={styles.stepTitle}>What are you into?</Text>
          <Text style={styles.stepSub}>Pick any that interest you — we'll bring them to the top.</Text>
          <View style={styles.grid}>
            {subjects.map((s) => {
              const active = interests.includes(s.id);
              return (
                <Pressable
                  key={s.id}
                  onPress={() => toggleInterest(s.id)}
                  style={[styles.subjectCard, active && { borderColor: s.accent, backgroundColor: colors.surfaceAlt }]}
                >
                  <View style={[styles.subjectIcon, { backgroundColor: s.accent }]}>
                    <Ionicons name={s.icon as any} size={20} color={colors.bg} />
                  </View>
                  <Text style={styles.subjectTitle}>{s.title}</Text>
                  <Text style={styles.subjectTag} numberOfLines={2}>{s.tagline}</Text>
                  {active ? (
                    <View style={[styles.check, { backgroundColor: s.accent }]}>
                      <Ionicons name="checkmark" size={13} color={colors.bg} />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      ) : null}

      {step === 2 ? (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={styles.stepTitle}>Your mastery level</Text>
          <Text style={styles.stepSub}>
            This sets lesson depth and length for AI-generated content.
          </Text>
          <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
            {MASTERY_TIERS.map((tier) => {
              const active = level === tier.level;
              return (
                <Pressable
                  key={tier.level}
                  onPress={() => setLevel(tier.level)}
                  style={[styles.levelRow, active && { borderColor: colors.primary, backgroundColor: colors.surfaceAlt }]}
                >
                  <View style={[styles.levelIcon, active && { backgroundColor: colors.primary }]}>
                    <Text style={[styles.levelNum, active && { color: colors.bg }]}>
                      {tier.level}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.levelTitle}>{tier.name}</Text>
                    <Text style={styles.levelSub}>{tier.tagline}</Text>
                  </View>
                  <Ionicons
                    name={LEVEL_ICONS[tier.level]}
                    size={18}
                    color={active ? colors.primary : colors.textFaint}
                  />
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      ) : null}

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {step === 0 ? (
          <Pressable onPress={skipOnboarding} hitSlop={8} style={styles.skip}>
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => setStep((s) => s - 1)} hitSlop={8} style={styles.skip}>
            <Text style={styles.skipText}>Back</Text>
          </Pressable>
        )}
        <Pressable
          onPress={() => (step >= 2 ? finish() : setStep((s) => s + 1))}
          disabled={step === 1 && interests.length === 0}
          style={[
            styles.next,
            step === 1 && interests.length === 0 && { backgroundColor: colors.surfaceAlt },
          ]}
        >
          <Text
            style={[
              styles.nextText,
              step === 1 && interests.length === 0 && { color: colors.textFaint },
            ]}
          >
            {step >= 2 ? 'Start learning' : 'Continue'}
          </Text>
          <Ionicons
            name="arrow-forward"
            size={18}
            color={step === 1 && interests.length === 0 ? colors.textFaint : colors.bg}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  progressRow: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.md },
  progressDot: {
    flex: 1,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  body: { flexGrow: 1, paddingTop: spacing.xl, gap: spacing.md },
  hero: {
    width: 96,
    height: 96,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    marginBottom: spacing.md,
  },
  bigTitle: { color: colors.text, fontSize: font.size.xxxl, fontWeight: font.weight.heavy as '800' },
  bigSub: { color: colors.textMuted, fontSize: font.size.md, lineHeight: 24 },
  stepTitle: { color: colors.text, fontSize: font.size.xxl, fontWeight: font.weight.heavy as '800' },
  stepSub: { color: colors.textMuted, fontSize: font.size.sm, lineHeight: 20, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.lg },
  subjectCard: {
    width: '47%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: 6,
  },
  subjectIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subjectTitle: { color: colors.text, fontSize: font.size.md, fontWeight: font.weight.bold as '700', marginTop: 4 },
  subjectTag: { color: colors.textMuted, fontSize: font.size.xs, lineHeight: 16 },
  check: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.md,
  },
  levelIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelNum: {
    color: colors.textMuted,
    fontSize: font.size.lg,
    fontWeight: font.weight.heavy as '800',
  },
  levelTitle: { color: colors.text, fontSize: font.size.md, fontWeight: font.weight.bold as '700' },
  levelSub: { color: colors.textMuted, fontSize: font.size.xs, marginTop: 2 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  skip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  skipText: { color: colors.textMuted, fontSize: font.size.md, fontWeight: font.weight.semibold as '600' },
  next: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: radius.pill,
  },
  nextText: { color: colors.bg, fontSize: font.size.md, fontWeight: font.weight.heavy as '800' },
});
