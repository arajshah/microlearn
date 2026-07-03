import { QuizCard, SubjectId, TrueFalseCard, FillBlankCard } from '@/types/content';
import { addDays, dayKey } from '@/utils/date';

export type ReviewableCard = QuizCard | TrueFalseCard | FillBlankCard;

export interface ReviewItem {
  id: string; // `${lessonId}#${cardIndex}`
  lessonId: string;
  lessonTitle: string;
  subjectId: SubjectId;
  card: ReviewableCard;
  reps: number;
  lapses: number;
  ease: number;
  intervalDays: number;
  due: string; // YYYY-MM-DD
  lastReviewed: string | null;
}

export const MASTERY_INTERVAL_DAYS = 21;
export const MIN_EASE = 1.3;
export const DEFAULT_EASE = 2.5;

export function makeItemId(lessonId: string, cardIndex: number): string {
  return `${lessonId}#${cardIndex}`;
}

/**
 * A compact SM-2-style scheduler. Correct answers push the next review further
 * out; wrong answers reset the interval so the item resurfaces quickly.
 */
export function schedule(
  prev: Pick<ReviewItem, 'reps' | 'lapses' | 'ease' | 'intervalDays'>,
  correct: boolean,
  today: Date = new Date(),
): Pick<ReviewItem, 'reps' | 'lapses' | 'ease' | 'intervalDays' | 'due' | 'lastReviewed'> {
  let { reps, lapses, ease, intervalDays } = prev;

  if (correct) {
    reps += 1;
    ease = Math.min(2.8, ease + 0.05);
    if (reps === 1) intervalDays = 1;
    else if (reps === 2) intervalDays = 3;
    else intervalDays = Math.round(intervalDays * ease);
    intervalDays = Math.max(1, intervalDays);
  } else {
    reps = 0;
    lapses += 1;
    ease = Math.max(MIN_EASE, ease - 0.2);
    intervalDays = 0; // due again today
  }

  return {
    reps,
    lapses,
    ease,
    intervalDays,
    due: dayKey(addDays(today, intervalDays)),
    lastReviewed: dayKey(today),
  };
}

export function freshSchedule(): Pick<
  ReviewItem,
  'reps' | 'lapses' | 'ease' | 'intervalDays'
> {
  return { reps: 0, lapses: 0, ease: DEFAULT_EASE, intervalDays: 0 };
}

export function isDue(item: ReviewItem, today: Date = new Date()): boolean {
  return item.due <= dayKey(today);
}

export function isMastered(item: ReviewItem): boolean {
  return item.intervalDays >= MASTERY_INTERVAL_DAYS;
}
