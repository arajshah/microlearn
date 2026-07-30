export { subjects, getSubject, subjectProgressFromCompleted } from '@/data/subjects';
export { lessonXp } from '@/utils/lessonXp';

/** @deprecated Static built-in lessons removed. Always returns empty. */
export function allLessons(): never[] {
  return [];
}

/** @deprecated Static built-in lessons removed. */
export function findLesson(_lessonId: string): undefined {
  return undefined;
}

/** @deprecated Static built-in lessons removed. */
export function subjectLessons(): never[] {
  return [];
}

export const totalLessonCount = 0;

export const TRACK_LABELS = {
  beginner: 'Foundations',
  intermediate: 'Core',
  advanced: 'Advanced',
} as const;
