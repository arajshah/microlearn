import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Lesson, SubjectId } from '@/types/content';
import {
  freshSchedule,
  isDue,
  isMastered,
  makeItemId,
  ReviewableCard,
  ReviewItem,
  schedule,
} from '@/srs/scheduler';

const STORAGE_KEY = 'microlearn.review.v1';

export interface ReviewStats {
  dueCount: number;
  tracked: number;
  mastered: number;
}

interface ReviewContextValue {
  items: Record<string, ReviewItem>;
  hydrated: boolean;
  /** Add/refresh review items from a finished lesson. */
  ingestLesson: (
    lesson: Lesson,
    subjectId: SubjectId,
    results: { cardIndex: number; correct: boolean }[],
  ) => void;
  /** Grade a single item during a review session. */
  gradeItem: (id: string, correct: boolean) => void;
  /** Add/refresh a single card's review state (used by the Daily Challenge). */
  ingestCard: (
    ref: {
      lessonId: string;
      lessonTitle: string;
      subjectId: SubjectId;
      cardIndex: number;
      card: ReviewableCard;
    },
    correct: boolean,
  ) => void;
  dueItems: () => ReviewItem[];
  stats: ReviewStats;
  resetReviews: () => Promise<void>;
}

const ReviewContext = createContext<ReviewContextValue | undefined>(undefined);

export function ReviewProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Record<string, ReviewItem>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setItems(JSON.parse(raw));
      } catch {
        // ignore
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  const persist = useCallback((next: Record<string, ReviewItem>) => {
    setItems(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const ingestLesson = useCallback<ReviewContextValue['ingestLesson']>(
    (lesson, subjectId, results) => {
      setItems((prev) => {
        const next = { ...prev };
        for (const { cardIndex, correct } of results) {
          const card = lesson.cards[cardIndex];
          if (!card || (card.type !== 'quiz' && card.type !== 'truefalse' && card.type !== 'fillblank')) {
            continue;
          }
          const id = makeItemId(lesson.id, cardIndex);
          const existing = next[id];
          const base = existing ?? {
            id,
            lessonId: lesson.id,
            lessonTitle: lesson.title,
            subjectId,
            card: card as ReviewableCard,
            ...freshSchedule(),
            due: '',
            lastReviewed: null,
          };
          const sched = schedule(base, correct);
          next[id] = {
            ...base,
            card: card as ReviewableCard,
            lessonTitle: lesson.title,
            subjectId,
            ...sched,
          };
        }
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [],
  );

  const ingestCard = useCallback<ReviewContextValue['ingestCard']>(
    (ref, correct) => {
      setItems((prev) => {
        const id = makeItemId(ref.lessonId, ref.cardIndex);
        const existing = prev[id];
        const base = existing ?? {
          id,
          lessonId: ref.lessonId,
          lessonTitle: ref.lessonTitle,
          subjectId: ref.subjectId,
          card: ref.card,
          ...freshSchedule(),
          due: '',
          lastReviewed: null,
        };
        const sched = schedule(base, correct);
        const next = {
          ...prev,
          [id]: {
            ...base,
            card: ref.card,
            lessonTitle: ref.lessonTitle,
            subjectId: ref.subjectId,
            ...sched,
          },
        };
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [],
  );

  const gradeItem = useCallback<ReviewContextValue['gradeItem']>(
    (id, correct) => {
      setItems((prev) => {
        const existing = prev[id];
        if (!existing) return prev;
        const sched = schedule(existing, correct);
        const next = { ...prev, [id]: { ...existing, ...sched } };
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [],
  );

  const resetReviews = useCallback(async () => {
    persist({});
    await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  }, [persist]);

  const value = useMemo<ReviewContextValue>(() => {
    const all = Object.values(items);
    const due = all.filter((i) => isDue(i));
    return {
      items,
      hydrated,
      ingestLesson,
      gradeItem,
      ingestCard,
      dueItems: () =>
        [...due].sort((a, b) =>
          a.due === b.due ? Math.random() - 0.5 : a.due < b.due ? -1 : 1,
        ),
      stats: {
        dueCount: due.length,
        tracked: all.length,
        mastered: all.filter((i) => isMastered(i)).length,
      },
      resetReviews,
    };
  }, [items, hydrated, ingestLesson, gradeItem, ingestCard, resetReviews]);

  return (
    <ReviewContext.Provider value={value}>{children}</ReviewContext.Provider>
  );
}

export function useReview(): ReviewContextValue {
  const ctx = useContext(ReviewContext);
  if (!ctx) throw new Error('useReview must be used within a ReviewProvider');
  return ctx;
}
