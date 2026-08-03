import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TutorPanel } from '@/components/TutorPanel';
import { useLibrary } from '@/context/LibraryContext';
import { cardToTutorContext } from '@/utils/tutorContext';
import { colors, font, spacing } from '@/theme/theme';

export default function TutorScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { resolveLesson } = useLibrary();
  const { lessonId, cardIndex } = useLocalSearchParams<{
    lessonId?: string;
    cardIndex?: string;
  }>();

  const { context, contextLabel, cardLabel, sessionKey } = useMemo(() => {
    if (!lessonId) {
      return {
        context: undefined,
        contextLabel: null,
        cardLabel: null,
        sessionKey: 'tutor-standalone',
      };
    }
    const loc = resolveLesson(lessonId);
    if (!loc) {
      return {
        context: undefined,
        contextLabel: null,
        cardLabel: null,
        sessionKey: `tutor-${lessonId}`,
      };
    }
    const idx = cardIndex ? parseInt(cardIndex, 10) : 0;
    const card = loc.lesson.cards[idx];
    const header = `${loc.subject.title} — ${loc.lesson.title}`;
    const title =
      card && 'title' in card && typeof card.title === 'string' && card.title.trim()
        ? card.title.trim()
        : `Card ${idx + 1}`;
    return {
      context: card ? `${header}\n${cardToTutorContext(card)}` : header,
      contextLabel: loc.lesson.title,
      cardLabel: title,
      sessionKey: `tutor-${lessonId}`,
    };
  }, [lessonId, cardIndex, resolveLesson]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Close tutor"
        >
          <Ionicons name="close" size={24} color={colors.textMuted} />
        </Pressable>
        <Text style={styles.headerTitle}>Ask the tutor</Text>
        <View style={{ width: 44 }} />
      </View>
      {/* TutorPanel owns keyboard avoidance for this route — no nested KAV. */}
      <TutorPanel
        context={context}
        contextLabel={contextLabel}
        cardLabel={cardLabel}
        variant="fullscreen"
        sessionKey={sessionKey}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  backBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: colors.text,
    fontSize: font.size.md,
    fontWeight: font.weight.bold as '700',
  },
});
