import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/ui';
import { useProgress } from '@/context/ProgressContext';
import { getSubject } from '@/data/subjects';
import { colors, font, radius, spacing } from '@/theme/theme';

export default function SubjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const subject = getSubject(id ?? '');
  const { subjectProgress } = useProgress();

  if (!subject) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.missing}>Subject not found.</Text>
      </View>
    );
  }

  const { done } = subjectProgress(subject.id);

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xxxl }}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={subject.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + spacing.md }]}
        >
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
            <Ionicons name="chevron-back" size={22} color={colors.white} />
          </Pressable>

          <View style={styles.heroIcon}>
            <Ionicons name={subject.icon as keyof typeof Ionicons.glyphMap} size={30} color={colors.white} />
          </View>
          <Text style={styles.heroTitle}>{subject.title}</Text>
          <Text style={styles.heroTagline}>{subject.tagline}</Text>
          <Text style={styles.heroDesc}>{subject.description}</Text>

          {done > 0 ? (
            <Text style={styles.heroProgressText}>
              {done} lesson{done === 1 ? '' : 's'} completed in this subject
            </Text>
          ) : null}
        </LinearGradient>

        <View style={styles.body}>
          <Text style={styles.bodyTitle}>Create in this subject</Text>
          <Text style={styles.bodyText}>
            Generate a standalone lesson or build a roadmap focused on {subject.title.toLowerCase()}.
          </Text>
          <PrimaryButton
            label="Open Create"
            icon="sparkles"
            accent={subject.accent}
            onPress={() => router.push({ pathname: '/create', params: { subjectId: subject.id } })}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  missing: { color: colors.textMuted, fontSize: font.size.md },
  hero: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    gap: 6,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  heroTitle: {
    color: colors.white,
    fontSize: font.size.xxxl,
    fontWeight: font.weight.heavy as '800',
  },
  heroTagline: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: font.size.md,
    fontWeight: font.weight.semibold as '600',
  },
  heroDesc: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: font.size.sm,
    lineHeight: 20,
    marginTop: 4,
  },
  heroProgressText: {
    color: colors.white,
    fontWeight: font.weight.bold as '700',
    fontSize: font.size.sm,
    marginTop: spacing.lg,
  },
  body: { padding: spacing.lg, paddingTop: spacing.xl, gap: spacing.md },
  bodyTitle: {
    color: colors.text,
    fontSize: font.size.lg,
    fontWeight: font.weight.bold as '700',
  },
  bodyText: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    lineHeight: 20,
  },
});
