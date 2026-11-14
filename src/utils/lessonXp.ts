/**
 * XP earned for completing a lesson: a base award plus a per-card bonus
 * for each graded card in the lesson.
 */
import { Lesson } from '@/types/content';
import { countGradedCards } from '@/utils/cards';

/** XP earned for completing a lesson. */
export function lessonXp(lesson: Lesson): number {
  return 10 + countGradedCards(lesson.cards) * 5;
}
