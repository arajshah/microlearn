#!/usr/bin/env npx tsx
import { cardToTutorContext } from '../src/utils/tutorContext';
import { clampCardIndex, getLessonCardAtIndex } from '../src/utils/lessonPlayerState';
import type { LessonCard } from '../src/types/content';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const sampleCard: LessonCard = {
  type: 'concept',
  id: 'c1',
  title: 'Sample',
  body: 'Body',
};

function main(): void {
  assert(cardToTutorContext(undefined) === '', 'undefined card returns empty tutor context');
  assert(cardToTutorContext(null) === '', 'null card returns empty tutor context');
  assert(cardToTutorContext(sampleCard).includes('Sample'), 'valid card returns context');

  assert(clampCardIndex(5, 3) === 2, 'index past end clamps down');
  assert(clampCardIndex(-1, 3) === 0, 'negative index clamps up');
  assert(clampCardIndex(1, 0) === 0, 'empty lesson clamps to zero');

  const cards: LessonCard[] = [sampleCard, { type: 'summary', id: 'c2', points: ['Done'] }];
  assert(getLessonCardAtIndex(cards, 99)?.id === 'c2', 'out-of-range card resolves to last card');
  assert(getLessonCardAtIndex([], 0) === undefined, 'empty cards returns undefined');
  assert(getLessonCardAtIndex(undefined, 0) === undefined, 'missing cards returns undefined');

  console.log('verify-lesson-lifecycle: all checks passed');
}

main();
