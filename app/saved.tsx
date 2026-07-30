import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CardContent, Explanation } from '@/components/CardView';
import { Bookmark, useBookmarks } from '@/context/BookmarksContext';
import { getSubject } from '@/data/courses';
import { colors, font, radius, spacing } from '@/theme/theme';

function revealedSelection(b: Bookmark): number | null {
  if (b.card.type === 'quiz') return b.card.answerIndex;
  if (b.card.type === 'truefalse') return b.card.answer ? 1 : 0;
  return null;
}

export default function SavedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { bookmarks, remove } = useBookmarks();

  const isQuestion = (b: Bookmark) =>
    b.card.type === 'quiz' || b.card.type === 'truefalse';

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.closeBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.textMuted} />
        </Pressable>
        <Text style={styles.title}>Saved</Text>
        <Text style={styles.count}>{bookmarks.length}</Text>
      </View>

      {bookmarks.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="bookmark-outline" size={44} color={colors.textFaint} />
          <Text style={styles.emptyTitle}>No saved slides yet</Text>
          <Text style={styles.emptyText}>
            Tap the bookmark icon on any slide while learning to keep it here for
            quick review.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        >
          {bookmarks.map((b) => {
            const subject = getSubject(b.subjectId);
            const accent = subject?.accent ?? colors.primary;
            return (
              <View key={b.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <Pressable
                    style={styles.cardHeadLeft}
                    onPress={() => router.push(`/lesson/${b.lessonId}`)}
                  >
                    <View style={[styles.dot, { backgroundColor: accent }]} />
                    <Text style={styles.cardLesson} numberOfLines={1}>
                      {b.lessonTitle}
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => remove(b.id)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={18} color={colors.textFaint} />
                  </Pressable>
                </View>

                <CardContent
                  card={b.card}
                  accent={accent}
                  selected={revealedSelection(b)}
                  revealed
                  onSelect={() => {}}
                />

                {isQuestion(b) ? <Explanation card={b.card} correct /> : null}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  closeBtn: { padding: 2 },
  title: {
    flex: 1,
    color: colors.text,
    fontSize: font.size.xl,
    fontWeight: font.weight.heavy as '800',
  },
  count: {
    color: colors.textMuted,
    fontSize: font.size.md,
    fontWeight: font.weight.bold as '700',
  },
  list: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  cardHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  dot: { width: 10, height: 10, borderRadius: radius.pill },
  cardLesson: {
    color: colors.textMuted,
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold as '600',
    flexShrink: 1,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  emptyTitle: { color: colors.text, fontSize: font.size.lg, fontWeight: font.weight.bold as '700' },
  emptyText: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 300,
  },
});
