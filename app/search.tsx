import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppRefreshScrollView } from '@/components/ui';
import { useLibrary } from '@/context/LibraryContext';
import { useProgress } from '@/context/ProgressContext';
import { useRoadmaps } from '@/context/RoadmapContext';
import { getSubject, subjects } from '@/data/subjects';
import { GeneratedLesson, Lesson, SubjectId } from '@/types/content';
import { colors, font, radius, spacing } from '@/theme/theme';
import { useScreenRefresh } from '@/hooks/useScreenRefresh';

interface Entry {
  id: string;
  kind: 'lesson' | 'roadmap';
  title: string;
  subtitle: string;
  subjectId?: SubjectId;
  subjectTitle: string;
  accent: string;
  icon: string;
  minutes?: number;
  cardCount?: number;
  haystack: string;
}

function cardText(lesson: Lesson): string {
  return lesson.cards
    .map((c) => {
      switch (c.type) {
        case 'concept':
          return `${c.title} ${c.body} ${c.keyTerm ?? ''}`;
        case 'quiz':
          return `${c.question} ${c.options.join(' ')}`;
        case 'truefalse':
          return c.statement;
        case 'fillblank':
          return c.sentence;
        case 'matching':
          return `${c.prompt} ${c.pairs.map((p) => p.left).join(' ')}`;
        case 'ordering':
          return `${c.prompt} ${c.items.join(' ')}`;
        case 'flashcard':
          return `${c.front} ${c.back}`;
        case 'code':
          return `${c.title} ${c.code}`;
        case 'quote':
          return `${c.text} ${c.author}`;
        default:
          return '';
      }
    })
    .join(' ');
}

function lessonEntry(lesson: GeneratedLesson): Entry {
  const subject = getSubject(lesson.subjectId);
  return {
    id: lesson.id,
    kind: 'lesson',
    title: lesson.title,
    subtitle: lesson.subtitle || lesson.topic,
    subjectId: lesson.subjectId,
    subjectTitle: subject?.title ?? 'AI',
    accent: subject?.accent ?? colors.primary,
    icon: subject?.icon ?? 'sparkles',
    minutes: lesson.minutes,
    cardCount: lesson.cards.length,
    haystack: `${lesson.title} ${lesson.subtitle} ${lesson.topic} ${cardText(lesson)}`.toLowerCase(),
  };
}

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { generatedLessons, refreshFromBackend } = useLibrary();
  const { roadmaps, refreshRoadmaps } = useRoadmaps();
  const { isLessonComplete } = useProgress();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SubjectId | 'all' | 'roadmaps'>('all');

  const refreshSearchData = useCallback(async () => {
    await Promise.all([refreshFromBackend(), refreshRoadmaps()]);
  }, [refreshFromBackend, refreshRoadmaps]);
  const { refreshing, refresh } = useScreenRefresh(refreshSearchData);

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = generatedLessons.map(lessonEntry);
    for (const rm of roadmaps) {
      out.push({
        id: rm.id,
        kind: 'roadmap',
        title: rm.title,
        subtitle: rm.topic,
        subjectTitle: 'Roadmap',
        accent: colors.paths,
        icon: 'map',
        haystack: `${rm.title} ${rm.topic} ${rm.goal}`.toLowerCase(),
      });
    }
    return out;
  }, [generatedLessons, roadmaps]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (filter === 'roadmaps') return e.kind === 'roadmap' && (q === '' || e.haystack.includes(q));
      if (filter !== 'all' && e.subjectId !== filter) return false;
      return q === '' || e.haystack.includes(q);
    });
  }, [entries, query, filter]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <View style={styles.searchRow}>
          <Ionicons name="search" size={18} color={colors.textFaint} />
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder="Search lessons & roadmaps…"
            placeholderTextColor={colors.textFaint}
            autoFocus
            returnKeyType="search"
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textFaint} />
            </Pressable>
          ) : null}
        </View>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {(['all', 'roadmaps', ...subjects.map((s) => s.id)] as (SubjectId | 'all' | 'roadmaps')[]).map(
          (id) => {
            const active = filter === id;
            const label =
              id === 'all' ? 'All' : id === 'roadmaps' ? 'Roadmaps' : getSubject(id)?.title ?? id;
            return (
              <Pressable
                key={id}
                onPress={() => setFilter(id)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && { color: colors.bg }]}>
                  {label}
                </Text>
              </Pressable>
            );
          },
        )}
      </ScrollView>

      <AppRefreshScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refresh={{
          refreshing,
          onRefresh: refresh,
          accent: colors.primary,
          indicatorTopOffset: spacing.sm,
        }}
      >
        <Text style={styles.resultMeta}>
          {results.length} result{results.length === 1 ? '' : 's'}
          {query ? ` matching “${query.trim()}”` : ''}
        </Text>
        {results.map((e) => (
          <Pressable
            key={`${e.kind}-${e.id}`}
            onPress={() =>
              e.kind === 'roadmap'
                ? router.push(`/roadmap/${e.id}`)
                : router.push(`/lesson/${e.id}`)
            }
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
          >
            <View style={[styles.rowIcon, { backgroundColor: e.accent }]}>
              <Ionicons name={e.icon as keyof typeof Ionicons.glyphMap} size={16} color={colors.bg} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.rowTitleRow}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {e.title}
                </Text>
                {e.kind === 'lesson' ? (
                  <View style={styles.aiTag}>
                    <Ionicons name="sparkles" size={10} color={colors.primary} />
                    <Text style={styles.aiTagText}>AI</Text>
                  </View>
                ) : null}
                {e.kind === 'lesson' && isLessonComplete(e.id) ? (
                  <Ionicons name="checkmark-circle" size={15} color={colors.success} />
                ) : null}
              </View>
              <Text style={styles.rowSub} numberOfLines={1}>
                {e.kind === 'roadmap'
                  ? `${e.subtitle} · Roadmap`
                  : `${e.subjectTitle} · ${e.minutes} min · ${e.cardCount} slides`}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        ))}
        {results.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="telescope-outline" size={40} color={colors.textFaint} />
            <Text style={styles.emptyText}>
              No results found. Create a lesson or roadmap to start learning.
            </Text>
          </View>
        ) : null}
      </AppRefreshScrollView>
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
  },
  searchRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  input: { flex: 1, color: colors.text, fontSize: font.size.md },
  cancel: { color: colors.primary, fontSize: font.size.sm, fontWeight: font.weight.bold as '700' },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontSize: font.size.sm, fontWeight: font.weight.semibold as '600' },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.sm },
  resultMeta: {
    color: colors.textFaint,
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold as '600',
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowTitle: { color: colors.text, fontSize: font.size.md, fontWeight: font.weight.bold as '700', flexShrink: 1 },
  rowSub: { color: colors.textMuted, fontSize: font.size.xs, marginTop: 2 },
  aiTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  aiTagText: { color: colors.primary, fontSize: 10, fontWeight: font.weight.bold as '700' },
  empty: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.xxxl },
  emptyText: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 20,
  },
});
