import { GeneratedLesson, LessonCard } from '@/types/content';
import {
  ensureUniqueSlideTitles,
  isSupportedCardType,
  repairLessonCards,
  SUPPORTED_CARD_TYPES,
} from '@/utils/contentEngineV2';
import { countGradedCards, isInteractiveCard } from '@/utils/cards';

export interface ContentQualityOptions {
  targetSlideCount?: number;
  minInteractiveCards?: number;
  requireWorkedExample?: boolean;
  requireMisconception?: boolean;
  requireFormulaForMath?: boolean;
  topic?: string;
  isDeepLesson?: boolean;
  isFinalLesson?: boolean;
}

export interface ContentQualityStats {
  slideCount: number;
  explanationCount: number;
  interactiveCount: number;
  workedExampleCount: number;
  formulaCount: number;
  derivationCount: number;
  misconceptionCount: number;
  unsupportedCount: number;
  duplicateTitleCount: number;
}

export interface ContentValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  stats: ContentQualityStats;
}

const MATH_TOPIC_PATTERN =
  /fourier|probability|optimization|linear algebra|calculus|matrix|tensor|statistics|math|algebra|derivative|integral/i;

function cardTitle(card: LessonCard): string {
  if ('title' in card && typeof card.title === 'string') return card.title;
  if (card.type === 'quiz' || card.type === 'application') return card.question;
  if (card.type === 'misconception' || card.type === 'misconception_check') return card.question;
  return '';
}

function isExplanationLike(card: LessonCard): boolean {
  return (
    card.type === 'explanation' ||
    card.type === 'concept' ||
    card.type === 'example' ||
    card.type === 'hook' ||
    card.type === 'recall' ||
    card.type === 'visual_model' ||
    card.type === 'formula'
  );
}

export function validateLessonContent(
  lesson: Pick<GeneratedLesson, 'cards' | 'title' | 'topic'>,
  opts: ContentQualityOptions = {},
): ContentValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const cards = lesson.cards ?? [];
  const topic = opts.topic ?? lesson.topic ?? lesson.title ?? '';

  let unsupportedCount = 0;
  for (const card of cards) {
    if (!isSupportedCardType(card.type)) unsupportedCount += 1;
  }
  if (unsupportedCount > 0) {
    errors.push(`${unsupportedCount} unsupported card type(s)`);
  }

  const ids = cards.map((c, i) => c.id ?? `c${i + 1}`);
  if (new Set(ids).size !== ids.length) errors.push('Duplicate slide ids');

  const titles = cards.map(cardTitle).filter(Boolean);
  const duplicateTitleCount = titles.filter((t, i) => titles.indexOf(t) !== i).length;
  if (duplicateTitleCount > 0) warnings.push(`${duplicateTitleCount} duplicate slide title(s)`);

  const stats: ContentQualityStats = {
    slideCount: cards.length,
    explanationCount: cards.filter(isExplanationLike).length,
    interactiveCount: cards.filter(isInteractiveCard).length,
    workedExampleCount: cards.filter((c) => c.type === 'worked_example').length,
    formulaCount: cards.filter((c) => c.type === 'formula').length,
    derivationCount: cards.filter((c) => c.type === 'derivation').length,
    misconceptionCount: cards.filter(
      (c) => c.type === 'misconception' || c.type === 'misconception_check',
    ).length,
    unsupportedCount,
    duplicateTitleCount,
  };

  if (opts.targetSlideCount != null) {
    const delta = Math.abs(cards.length - opts.targetSlideCount);
    if (delta > 2) {
      warnings.push(
        `Slide count ${cards.length} differs from target ${opts.targetSlideCount}`,
      );
    }
  }

  const minInteractive = opts.minInteractiveCards ?? (cards.length >= 8 ? 1 : 0);
  if (minInteractive > 0 && stats.interactiveCount < minInteractive) {
    warnings.push(`Expected at least ${minInteractive} interactive card(s)`);
  }

  const deep = opts.isDeepLesson ?? cards.length >= 10;
  if (deep) {
    if (opts.requireWorkedExample !== false && stats.workedExampleCount === 0) {
      warnings.push('Deep lesson missing worked_example');
    }
    if (
      opts.requireMisconception !== false &&
      stats.misconceptionCount === 0
    ) {
      warnings.push('Deep lesson missing misconception check');
    }
    if (!cards.some((c) => c.type === 'summary')) {
      warnings.push('Deep lesson missing summary');
    }
    if (!opts.isFinalLesson && !cards.some((c) => c.type === 'next_connection')) {
      warnings.push('Deep lesson missing next_connection');
    }
  }

  const mathish = opts.requireFormulaForMath ?? MATH_TOPIC_PATTERN.test(topic);
  if (
    mathish &&
    stats.formulaCount === 0 &&
    stats.derivationCount === 0 &&
    stats.workedExampleCount === 0
  ) {
    warnings.push('Math topic missing formula, derivation, or worked_example');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats,
  };
}

export function repairAndValidateLesson(
  lesson: GeneratedLesson,
  opts: ContentQualityOptions = {},
): { lesson: GeneratedLesson; validation: ContentValidationResult } {
  const repairedCards = ensureUniqueSlideTitles(
    repairLessonCards(lesson.cards ?? [], opts.targetSlideCount),
  );
  const repaired: GeneratedLesson = { ...lesson, cards: repairedCards };
  const validation = validateLessonContent(repaired, opts);

  if (validation.warnings.length > 0) {
    console.warn('[content-v2] lesson quality warnings', {
      lessonId: lesson.id,
      warnings: validation.warnings,
    });
  }

  return { lesson: repaired, validation };
}

/** Dev helper — returns true when all checks pass. */
export function runContentEngineV2SelfCheck(): boolean {
  const repaired = repairLessonCards([
    { type: 'orientation', title: 'Bad', body: 'Should repair' },
    {
      type: 'misconception_check',
      misconception: 'x',
      question: 'q',
      options: ['only one'],
      answerIndex: 5,
      explanation: '',
    },
  ]);
  const okRepair =
    repaired.length === 2 &&
    repaired[0].type === 'explanation' &&
    repaired[1].type === 'explanation';

  const stats = validateLessonContent(
    {
      title: 'Test',
      topic: 'Fourier analysis',
      cards: repaired,
    },
    { targetSlideCount: 2, isDeepLesson: false },
  );

  const okTypes = SUPPORTED_CARD_TYPES.includes('formula');
  const okInteractive = countGradedCards(
    [
      {
        type: 'misconception_check',
        id: 'c1',
        misconception: 'm',
        question: 'q',
        options: ['a', 'b'],
        answerIndex: 0,
        explanation: 'e',
      },
    ],
  ) === 1;

  return okRepair && okTypes && okInteractive && stats.ok;
}
