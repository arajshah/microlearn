import { LessonCard } from '@/types/content';

/** Clamps a card index into [0, cardCount - 1], or 0 when there are no cards. */
export function clampCardIndex(index: number, cardCount: number): number {
  if (!Number.isFinite(index) || cardCount <= 0) return 0;
  return Math.max(0, Math.min(Math.trunc(index), cardCount - 1));
}

/** Returns the card at index when in range; otherwise undefined. */
export function getLessonCardAtIndex(
  cards: LessonCard[] | null | undefined,
  index: number,
): LessonCard | undefined {
  if (!Array.isArray(cards) || cards.length === 0) return undefined;
  const clamped = clampCardIndex(index, cards.length);
  return cards[clamped];
}
