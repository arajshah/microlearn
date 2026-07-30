import {
  LessonCard,
  MatchingCard,
  OrderingCard,
} from '@/types/content';

function hasValidQuizOptions(card: LessonCard): boolean {
  if (
    card.type !== 'quiz' &&
    card.type !== 'fillblank' &&
    card.type !== 'application' &&
    card.type !== 'misconception' &&
    card.type !== 'misconception_check' &&
    card.type !== 'prediction'
  ) {
    return false;
  }
  const options = Array.isArray(card.options) ? card.options : [];
  if (options.length === 0) return false;
  if (typeof card.answerIndex !== 'number') return false;
  return card.answerIndex >= 0 && card.answerIndex < options.length;
}

function hasValidMatching(card: MatchingCard): boolean {
  return Array.isArray(card.pairs) && card.pairs.length > 0;
}

function hasValidOrdering(card: OrderingCard): boolean {
  return Array.isArray(card.items) && card.items.length > 0;
}

/** Cards that require an answer before continuing (only when structurally valid). */
export function isInteractiveCard(card: LessonCard): boolean {
  switch (card.type) {
    case 'quiz':
    case 'fillblank':
    case 'application':
    case 'misconception':
    case 'misconception_check':
    case 'prediction':
      return hasValidQuizOptions(card);
    case 'truefalse':
      return typeof card.statement === 'string' && card.statement.length > 0;
    case 'matching':
      return hasValidMatching(card);
    case 'ordering':
      return hasValidOrdering(card);
    default:
      return false;
  }
}

/** Cards that count toward lesson accuracy and SRS. */
export function isGradedCard(card: LessonCard): boolean {
  return isInteractiveCard(card);
}

export function countGradedCards(cards: LessonCard[]): number {
  return cards.filter(isGradedCard).length;
}

/** Legacy helper: selected index for simple multiple-choice cards. */
export function isAnswerCorrect(card: LessonCard, selected: number | null): boolean {
  if (selected == null) return false;
  if (
    card.type === 'quiz' ||
    card.type === 'fillblank' ||
    card.type === 'application' ||
    card.type === 'misconception' ||
    card.type === 'misconception_check' ||
    card.type === 'prediction'
  ) {
    if (!hasValidQuizOptions(card)) return false;
    return selected === card.answerIndex;
  }
  if (card.type === 'truefalse') return selected === (card.answer ? 1 : 0);
  return false;
}

/** Grade a matching card when right column was shuffled. */
export function isMatchingCorrect(
  card: MatchingCard,
  matches: Record<number, number>,
  rightOrder: number[],
): boolean {
  if (!hasValidMatching(card)) return false;
  return card.pairs.every(
    (_, leftIdx) => rightOrder[matches[leftIdx]] === leftIdx,
  );
}

/** Grade an ordering card: current order must match original items order. */
export function isOrderingCorrect(card: OrderingCard, order: number[]): boolean {
  if (!hasValidOrdering(card)) return false;
  if (order.length !== card.items.length) return false;
  return order.every((itemIdx, pos) => itemIdx === pos);
}

export function cardToSpeech(card: LessonCard): string {
  switch (card.type) {
    case 'concept':
      return [card.title, card.body, card.keyTerm ? `${card.keyTerm}. ${card.keyTermDef ?? ''}` : '']
        .filter(Boolean)
        .join('. ');
    case 'quote':
      return `${card.text}. By ${card.author}.`;
    case 'quiz':
      return `${card.question}. Options: ${(card.options ?? []).join(', ')}.`;
    case 'truefalse':
      return `True or false? ${card.statement}`;
    case 'fillblank':
      return card.sentence.replace('___', 'blank');
    case 'matching':
      return `${card.prompt}. Match: ${(card.pairs ?? []).map((p) => `${p.left} with ${p.right}`).join('; ')}.`;
    case 'ordering':
      return `${card.prompt}. Put in order: ${(card.items ?? []).join(', ')}.`;
    case 'flashcard':
      return `${card.front}. ${card.back}`;
    case 'code':
      return `${card.title}. ${card.caption ?? ''} Code in ${card.language}.`;
    case 'hook':
    case 'explanation':
    case 'example':
      return [card.title, card.body].filter(Boolean).join('. ');
    case 'recall':
      return `${card.prompt}. ${card.body}`;
    case 'summary':
      return (card.points ?? []).join('. ');
    case 'next_connection':
      return card.body;
    case 'misconception':
    case 'misconception_check':
      return `${card.misconception}. ${card.question}. Options: ${(card.options ?? []).join(', ')}.`;
    case 'application':
      return `${card.question}. Options: ${(card.options ?? []).join(', ')}.`;
    case 'prediction':
      return `${card.scenario}. ${card.question}`;
    case 'formula':
      return `${card.title}. ${card.formula}. ${card.plainEnglish}. ${card.body ?? ''}`.trim();
    case 'derivation':
      return `${card.title}. ${card.setup}. ${card.steps.map((s) => s.explanation).join('. ')}. ${card.conclusion}`;
    case 'worked_example':
      return `${card.title}. ${card.problem}. ${card.steps.map((s) => s.explanation).join('. ')}. Answer: ${card.answer}. ${card.insight}`;
    case 'compare_contrast':
      return `${card.title}. ${card.points.map((p) => `${p.left} versus ${p.right}`).join('. ')}. ${card.takeaway}`;
    case 'visual_model':
      return `${card.title}. ${card.visualDescription}. ${card.body}. ${card.takeaway}`;
    default:
      return '';
  }
}

/** Shuffle indices for ordering card initial state. */
export function shuffledIndices(n: number, seed = Date.now()): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  let s = seed;
  for (let i = n - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Shuffle right-side options for matching (returns mapping: displayIndex → originalIndex). */
export function shuffledRights(card: MatchingCard, seed = Date.now()): number[] {
  const len = Array.isArray(card.pairs) ? card.pairs.length : 0;
  return shuffledIndices(len, seed);
}
