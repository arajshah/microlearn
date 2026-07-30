import {
  GeneratedLesson,
  Lesson,
  LessonCard,
  MatchingCard,
  OrderingCard,
} from '@/types/content';
import { repairLessonCards } from '@/utils/contentEngineV2';

function stableCardId(card: Record<string, unknown>, index: number): string {
  if (typeof card.id === 'string' && card.id.trim()) return card.id;
  return `c${index + 1}`;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function validOptions(card: Record<string, unknown>): string[] {
  return stringArray(card.options);
}

function validAnswerIndex(options: string[], answerIndex: unknown): number {
  if (typeof answerIndex !== 'number' || !Number.isInteger(answerIndex)) return 0;
  if (answerIndex < 0 || answerIndex >= options.length) return 0;
  return answerIndex;
}

function toRecallCard(
  id: string,
  prompt: string,
  body: string,
): LessonCard {
  return { type: 'recall', id, prompt, body };
}

function normalizeMatchingPairs(raw: unknown): MatchingCard['pairs'] {
  if (!Array.isArray(raw)) return [];
  const pairs: MatchingCard['pairs'] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const left = asString((item as { left?: unknown }).left);
    const right = asString((item as { right?: unknown }).right);
    if (left && right) pairs.push({ left, right });
  }
  return pairs;
}

/** Unwrap nested `{ lesson: { cards } }` shapes from backend storage. */
export function unwrapLessonPayload(raw: unknown): Partial<GeneratedLesson> {
  if (!raw || typeof raw !== 'object') return {};
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.cards)) return obj as Partial<GeneratedLesson>;
  if (obj.lesson && typeof obj.lesson === 'object') {
    const inner = obj.lesson as Record<string, unknown>;
    if (Array.isArray(inner.cards)) return inner as Partial<GeneratedLesson>;
    if (inner.lesson && typeof inner.lesson === 'object') {
      const nested = inner.lesson as Record<string, unknown>;
      if (Array.isArray(nested.cards)) return nested as Partial<GeneratedLesson>;
    }
  }
  return obj as Partial<GeneratedLesson>;
}

export function normalizeLessonCard(raw: unknown, index: number): LessonCard {
  if (!raw || typeof raw !== 'object') {
    return { type: 'concept', id: stableCardId({}, index), title: 'Slide', body: 'Content unavailable.' };
  }

  const card = raw as Record<string, unknown>;
  const id = stableCardId(card, index);
  const type = asString(card.type, 'concept');

  if (type === 'summary') {
    return {
      type: 'summary',
      id,
      title: asString(card.title) || undefined,
      points: stringArray(card.points),
    };
  }

  if (type === 'matching') {
    const pairs = normalizeMatchingPairs(card.pairs);
    if (pairs.length === 0) {
      return toRecallCard(
        id,
        asString(card.prompt, 'Matching activity'),
        'This matching check could not be rendered correctly.',
      );
    }
    return {
      type: 'matching',
      id,
      prompt: asString(card.prompt, 'Match the pairs'),
      pairs,
      explanation: asString(card.explanation, ''),
    };
  }

  if (type === 'ordering') {
    const items = stringArray(card.items);
    if (items.length === 0) {
      return toRecallCard(
        id,
        asString(card.prompt, 'Ordering activity'),
        'This ordering check could not be rendered correctly.',
      );
    }
    return {
      type: 'ordering',
      id,
      prompt: asString(card.prompt, 'Put in order'),
      items,
      explanation: asString(card.explanation, ''),
    };
  }

  const optionTypes = new Set([
    'quiz',
    'fillblank',
    'misconception',
    'misconception_check',
    'application',
    'prediction',
  ]);
  if (optionTypes.has(type)) {
    const options = validOptions(card);
    if (options.length === 0) {
      const prompt =
        asString(card.question) ||
        asString(card.scenario) ||
        asString(card.misconception) ||
        'Review';
      return toRecallCard(
        id,
        prompt,
        asString(card.explanation, 'This check could not be rendered correctly.'),
      );
    }
    const answerIndex = validAnswerIndex(options, card.answerIndex);
    const base = { ...card, type, id, options, answerIndex };
    return base as LessonCard;
  }

  if (type === 'truefalse') {
    if (!asString(card.statement)) {
      return toRecallCard(id, 'True or false', 'This check could not be rendered correctly.');
    }
    return { ...(card as object), type: 'truefalse', id } as LessonCard;
  }

  return { ...(card as object), id } as LessonCard;
}

export function normalizeLessonCards(cards: unknown): LessonCard[] {
  if (!Array.isArray(cards)) return [];
  const normalized = cards.map((card, index) => normalizeLessonCard(card, index));
  return repairLessonCards(normalized);
}

export function normalizeGeneratedLesson(lesson: GeneratedLesson): GeneratedLesson {
  const unwrapped = unwrapLessonPayload(lesson);
  const merged: GeneratedLesson = {
    ...lesson,
    ...unwrapped,
    id: lesson.id || unwrapped.id || 'unknown-lesson',
    title: lesson.title ?? unwrapped.title ?? 'Untitled lesson',
    subtitle: lesson.subtitle ?? unwrapped.subtitle ?? '',
    topic: lesson.topic ?? unwrapped.topic ?? '',
    minutes: lesson.minutes ?? unwrapped.minutes ?? 4,
    subjectId: lesson.subjectId ?? unwrapped.subjectId ?? 'computer-science',
    cards: normalizeLessonCards(lesson.cards ?? unwrapped.cards),
    generated: lesson.generated ?? unwrapped.generated ?? true,
  };
  return merged;
}

export function normalizeLesson(lesson: Lesson): Lesson {
  return normalizeGeneratedLesson(lesson as GeneratedLesson);
}

export function normalizeGeneratedLessons(lessons: GeneratedLesson[]): GeneratedLesson[] {
  return lessons.map(normalizeGeneratedLesson);
}
