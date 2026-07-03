import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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

  const { context, contextLabel } = useMemo(() => {
    if (!lessonId) return { context: undefined, contextLabel: null };
    const loc = resolveLesson(lessonId);
    if (!loc) return { context: undefined, contextLabel: null };
    const idx = cardIndex ? parseInt(cardIndex, 10) : 0;
    const card = loc.lesson.cards[idx];
    const header = `${loc.subject.title} — ${loc.lesson.title}`;
    return {
      context: card ? `${header}\n${cardToTutorContext(card)}` : header,
      contextLabel: loc.lesson.title,
    };
  }, [lessonId, cardIndex, resolveLesson]);

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={insets.top}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="close" size={24} color={colors.textMuted} />
        </Pressable>
        <Text style={styles.headerTitle}>Ask the tutor</Text>
        <View style={{ width: 32 }} />
      </View>
      <TutorPanel
        context={context}
        contextLabel={contextLabel}
        variant="fullscreen"
      />
    </KeyboardAvoidingView>
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
  backBtn: { padding: 4 },
  headerTitle: {
    color: colors.text,
    fontSize: font.size.md,
    fontWeight: font.weight.bold as '700',
  },
});
