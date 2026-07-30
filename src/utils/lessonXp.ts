import { Lesson } from '@/types/content';
import { countGradedCards } from '@/utils/cards';

/** XP earned for completing a lesson. */
export function lessonXp(lesson: Lesson): number {
  return 10 + countGradedCards(lesson.cards) * 5;
}
