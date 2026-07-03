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
  findLesson,
  lessonXp,
  subjects,
  subjectLessons,
  totalLessonCount,
} from '@/data/courses';
import { addDays, dayKey, daysBetween } from '@/utils/date';

const STORAGE_KEY = 'microlearn.progress.v1';
export const DAILY_GOAL_XP = 40;
const MAX_FREEZES = 5;
const FREEZE_EVERY = 7; // earn a streak freeze every N-day milestone

export interface CompletedLesson {
  lessonId: string;
  subjectId: SubjectId;
  xp: number;
  correct: number;
  total: number;
  completedAt: string; // ISO
  dayKey: string;
}

interface ProgressState {
  totalXp: number;
  completed: Record<string, CompletedLesson>;
  /** XP earned per day key, used for the daily goal ring. */
  xpByDay: Record<string, number>;
  streak: number;
  longestStreak: number;
  lastActiveDay: string | null;
  /** Earned "skip a day without losing the streak" tokens. */
  streakFreezes: number;
  hydrated: boolean;
}

/** Advance streak fields for a new active day (idempotent within a day). */
function nextStreak(
  prev: Pick<
    ProgressState,
    'streak' | 'longestStreak' | 'lastActiveDay' | 'streakFreezes'
  >,
  today: string,
): Pick<ProgressState, 'streak' | 'longestStreak' | 'streakFreezes'> {
  if (prev.lastActiveDay === today) {
    return {
      streak: prev.streak,
      longestStreak: prev.longestStreak,
      streakFreezes: prev.streakFreezes,
    };
  }
  let streak: number;
  if (prev.lastActiveDay == null) {
    streak = 1;
  } else {
    const gap = daysBetween(today, prev.lastActiveDay);
    streak = gap === 1 ? prev.streak + 1 : 1;
  }
  const longestStreak = Math.max(prev.longestStreak, streak);
  let streakFreezes = prev.streakFreezes;
  if (streak > prev.streak && streak % FREEZE_EVERY === 0) {
    streakFreezes = Math.min(MAX_FREEZES, streakFreezes + 1);
  }
  return { streak, longestStreak, streakFreezes };
}

interface ProgressContextValue extends ProgressState {
  isLessonComplete: (lessonId: string) => boolean;
  lessonResult: (lessonId: string) => CompletedLesson | undefined;
  completeLesson: (args: {
    lesson: Lesson;
    subjectId: SubjectId;
    correct: number;
    total: number;
  }) => Promise<number>;
  /** Grant XP outside of a lesson (e.g. review sessions); also bumps streak. */
  awardXp: (amount: number) => void;
  subjectProgress: (subjectId: SubjectId) => {
    done: number;
    total: number;
    pct: number;
  };
  todayXp: number;
  goalPct: number;
  completedCount: number;
  totalLessons: number;
  resetAll: () => Promise<void>;
}

const defaultState: ProgressState = {
  totalXp: 0,
  completed: {},
  xpByDay: {},
  streak: 0,
  longestStreak: 0,
  lastActiveDay: null,
  streakFreezes: 2,
  hydrated: false,
};

const ProgressContext = createContext<ProgressContextValue | undefined>(
  undefined,
);

export function ProgressProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ProgressState>(defaultState);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<ProgressState>;
          const merged: ProgressState = { ...defaultState, ...parsed, hydrated: true };
          // If exactly one day was missed and a freeze is available, spend it to
          // keep the streak alive (Duolingo-style streak freeze).
          const today = dayKey();
          if (merged.lastActiveDay && merged.lastActiveDay !== today) {
            const gap = daysBetween(today, merged.lastActiveDay);
            if (gap === 2 && merged.streakFreezes > 0) {
              merged.streakFreezes -= 1;
              merged.lastActiveDay = dayKey(addDays(new Date(), -1));
            }
          }
          setState(merged);
          AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged)).catch(() => {});
        } else {
          setState((s) => ({ ...s, hydrated: true }));
        }
      } catch {
        setState((s) => ({ ...s, hydrated: true }));
      }
    })();
  }, []);

  const persist = useCallback((next: ProgressState) => {
    setState(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const completeLesson: ProgressContextValue['completeLesson'] = useCallback(
    async ({ lesson, subjectId, correct, total }) => {
      const earned = lessonXp(lesson);
      const today = dayKey();

      setState((prev) => {
        const already = prev.completed[lesson.id];
        // Re-completing a lesson grants reduced XP (review credit).
        const grantedXp = already ? Math.round(earned * 0.3) : earned;

        const streakNext = nextStreak(prev, today);

        const record: CompletedLesson = {
          lessonId: lesson.id,
          subjectId,
          xp: earned,
          correct,
          total,
          completedAt: new Date().toISOString(),
          dayKey: today,
        };

        const next: ProgressState = {
          ...prev,
          totalXp: prev.totalXp + grantedXp,
          completed: { ...prev.completed, [lesson.id]: record },
          xpByDay: {
            ...prev.xpByDay,
            [today]: (prev.xpByDay[today] ?? 0) + grantedXp,
          },
          ...streakNext,
          lastActiveDay: today,
          hydrated: true,
        };

        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });

      return earned;
    },
    [],
  );

  const awardXp = useCallback<ProgressContextValue['awardXp']>((amount) => {
    if (!amount) return;
    const today = dayKey();
    setState((prev) => {
      const streakNext = nextStreak(prev, today);
      const next: ProgressState = {
        ...prev,
        totalXp: prev.totalXp + amount,
        xpByDay: { ...prev.xpByDay, [today]: (prev.xpByDay[today] ?? 0) + amount },
        ...streakNext,
        lastActiveDay: today,
        hydrated: true,
      };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const resetAll = useCallback(async () => {
    persist({ ...defaultState, hydrated: true });
    await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  }, [persist]);

  const value = useMemo<ProgressContextValue>(() => {
    const today = dayKey();
    const todayXp = state.xpByDay[today] ?? 0;
    return {
      ...state,
      isLessonComplete: (id) => Boolean(state.completed[id]),
      lessonResult: (id) => state.completed[id],
      completeLesson,
      awardXp,
      subjectProgress: (subjectId) => {
        const subject = subjects.find((s) => s.id === subjectId);
        if (!subject) return { done: 0, total: 0, pct: 0 };
        const lessons = subjectLessons(subject);
        const done = lessons.filter((l) => state.completed[l.id]).length;
        const total = lessons.length;
        return { done, total, pct: total ? done / total : 0 };
      },
      todayXp,
      goalPct: Math.min(1, todayXp / DAILY_GOAL_XP),
      completedCount: Object.keys(state.completed).length,
      totalLessons: totalLessonCount,
      resetAll,
    };
  }, [state, completeLesson, awardXp, resetAll]);

  return (
    <ProgressContext.Provider value={value}>
      {children}
    </ProgressContext.Provider>
  );
}

export function useProgress(): ProgressContextValue {
  const ctx = useContext(ProgressContext);
  if (!ctx) {
    throw new Error('useProgress must be used within a ProgressProvider');
  }
  return ctx;
}

// Re-export so screens can import the helper alongside the hook.
export { findLesson };
