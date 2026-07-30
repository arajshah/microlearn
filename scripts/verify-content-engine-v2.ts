#!/usr/bin/env npx tsx
import { cardToSpeech } from '@/utils/cards';
import { isSupportedCardType, repairLessonCards, SUPPORTED_CARD_TYPES } from '@/utils/contentEngineV2';
import { runContentEngineV2SelfCheck, validateLessonContent } from '@/utils/contentQuality';
import { isInteractiveCard } from '@/utils/cards';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const v2Types = [
  'formula',
  'derivation',
  'worked_example',
  'misconception_check',
  'compare_contrast',
  'visual_model',
] as const;

for (const type of v2Types) {
  assert(isSupportedCardType(type), `missing supported type: ${type}`);
}

const repaired = repairLessonCards([{ type: 'orientation', title: 'Bad', body: 'Fix me' }]);
assert(repaired.length === 1 && repaired[0].type === 'explanation', 'repair unsupported failed');

const invalidQuiz = repairLessonCards([
  {
    type: 'misconception_check',
    misconception: 'x',
    question: 'q',
    options: ['only'],
    answerIndex: 9,
    explanation: '',
  },
]);
assert(invalidQuiz[0]?.type === 'explanation', 'invalid interactive should repair');

const validation = validateLessonContent(
  {
    title: 'Test',
    topic: 'Fourier analysis',
    cards: repaired,
  },
  { targetSlideCount: 1 },
);
assert(validation.ok, 'validation should pass after repair');

const interactive = {
  type: 'misconception_check' as const,
  id: 'c1',
  misconception: 'm',
  question: 'q',
  options: ['a', 'b'],
  answerIndex: 0,
  explanation: 'e',
};
assert(isInteractiveCard(interactive), 'misconception_check should be interactive');

assert(cardToSpeech(interactive).length > 0, 'cardToSpeech should not crash');
assert(cardToSpeech({ type: 'formula', id: 'c2', title: 't', formula: 'x', plainEnglish: 'y' }).length > 0, 'formula speech');

assert(runContentEngineV2SelfCheck(), 'self check failed');

console.log('Content Engine v2 verification passed.');
console.log(`Supported types: ${SUPPORTED_CARD_TYPES.length}`);
