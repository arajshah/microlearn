import { ExplanationCard, LessonCard } from '@/types/content';
import { normalizeConceptSlug } from '@/utils/conceptTags';

export const SUPPORTED_CARD_TYPES = [
  'concept',
  'quote',
  'quiz',
  'truefalse',
  'fillblank',
  'matching',
  'ordering',
  'flashcard',
  'code',
  'hook',
  'recall',
  'explanation',
  'example',
  'misconception',
  'application',
  'summary',
  'next_connection',
  'prediction',
  'formula',
  'derivation',
  'worked_example',
  'misconception_check',
  'compare_contrast',
  'visual_model',
] as const;

export type SupportedCardType = (typeof SUPPORTED_CARD_TYPES)[number];

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function cardId(card: Record<string, unknown>, index: number): string {
  const id = asString(card.id);
  return id || `c${index + 1}`;
}

function extractBody(card: Record<string, unknown>): string {
  const parts = [
    asString(card.body),
    asString(card.text),
    asString(card.question),
    asString(card.prompt),
    asString(card.explanation),
    asString(card.visualDescription),
    asString(card.plainEnglish),
    asString(card.problem),
    asString(card.setup),
    asString(card.conclusion),
    asString(card.takeaway),
    asString(card.insight),
    asString(card.formula),
  ].filter(Boolean);
  return parts.join('\n\n') || 'Content from an unsupported slide type.';
}

function extractTitle(card: Record<string, unknown>, index: number): string {
  return (
    asString(card.title) ||
    asString(card.question) ||
    asString(card.misconception) ||
    `Slide ${index + 1}`
  );
}

export function isSupportedCardType(type: unknown): type is SupportedCardType {
  return typeof type === 'string' && (SUPPORTED_CARD_TYPES as readonly string[]).includes(type);
}

export function repairUnsupportedCard(card: unknown, index: number): LessonCard {
  const raw =
    card && typeof card === 'object' ? (card as Record<string, unknown>) : ({} as Record<string, unknown>);
  const type = asString(raw.type, 'unknown');
  const id = cardId(raw, index);

  if (isSupportedCardType(type)) {
    return { ...raw, type, id } as LessonCard;
  }

  console.warn('[content-v2] repaired unsupported card type', { type, id, index });

  const repaired: ExplanationCard = {
    type: 'explanation',
    id,
    title: extractTitle(raw, index),
    body: extractBody(raw),
    conceptTags: stringArray(raw.conceptTags),
    skillTags: stringArray(raw.skillTags),
  };
  return repaired;
}

function repairInteractiveCard(card: LessonCard, index: number): LessonCard {
  const interactiveTypes = new Set([
    'quiz',
    'fillblank',
    'application',
    'misconception',
    'misconception_check',
    'prediction',
  ]);

  if (!interactiveTypes.has(card.type)) return card;

  const mc = card as {
    type: string;
    id?: string;
    question?: string;
    options?: string[];
    answerIndex?: number;
    explanation?: string;
    misconception?: string;
  };

  const options = Array.isArray(mc.options)
    ? mc.options.filter((o): o is string => typeof o === 'string' && o.length > 0)
    : [];
  const answerIndex = typeof mc.answerIndex === 'number' ? mc.answerIndex : -1;
  const hasValid =
    options.length >= 2 &&
    answerIndex >= 0 &&
    answerIndex < options.length &&
    Boolean(asString(mc.explanation));

  if (hasValid) return card;

  console.warn('[content-v2] repaired invalid interactive card', { type: card.type, id: card.id, index });

  return {
    type: 'explanation',
    id: card.id ?? `c${index + 1}`,
    title: asString(mc.question) || asString(mc.misconception) || 'Review',
    body: asString(mc.explanation) || 'This check could not be rendered as a quiz.',
    conceptTags: card.conceptTags,
    skillTags: card.skillTags,
  };
}

/** Canonicalizes adaptive-learning tags so mastery aggregation matches across cards. */
function normalizeLearningTags(card: LessonCard): LessonCard {
  const conceptTags = Array.isArray(card.conceptTags)
    ? [...new Set(card.conceptTags.map(normalizeConceptSlug).filter(Boolean))]
    : undefined;
  const skillTags = Array.isArray(card.skillTags)
    ? [...new Set(card.skillTags.filter((t) => typeof t === 'string' && t.length > 0))]
    : undefined;
  const weaknessTags = Array.isArray(card.weaknessTags)
    ? [...new Set(card.weaknessTags.filter((t) => typeof t === 'string' && t.length > 0))]
    : undefined;

  return {
    ...card,
    conceptTags: conceptTags && conceptTags.length > 0 ? conceptTags : undefined,
    skillTags: skillTags && skillTags.length > 0 ? skillTags : undefined,
    weaknessTags: weaknessTags && weaknessTags.length > 0 ? weaknessTags : undefined,
  };
}

function normalizeV2Card(card: LessonCard, index: number): LessonCard | null {
  if (card.type === 'formula') {
    if (!asString(card.title) || !asString(card.formula) || !asString(card.plainEnglish)) return null;
    return card;
  }
  if (card.type === 'derivation') {
    if (!asString(card.title) || !asString(card.setup) || !asString(card.conclusion)) return null;
    if (!Array.isArray(card.steps) || card.steps.length === 0) return null;
    return card;
  }
  if (card.type === 'worked_example') {
    if (!asString(card.title) || !asString(card.problem) || !asString(card.answer)) return null;
    if (!Array.isArray(card.steps) || card.steps.length === 0) return null;
    return card;
  }
  if (card.type === 'compare_contrast') {
    if (!asString(card.title) || !asString(card.leftLabel) || !asString(card.rightLabel)) return null;
    if (!Array.isArray(card.points) || card.points.length === 0) return null;
    return card;
  }
  if (card.type === 'visual_model') {
    if (!asString(card.title) || !asString(card.visualDescription) || !asString(card.body)) return null;
    return card;
  }
  if (card.type === 'misconception_check') {
    return repairInteractiveCard(card, index);
  }
  return card;
}

export function repairLessonCards(cards: unknown[], _targetSlideCount?: number): LessonCard[] {
  const repaired: LessonCard[] = [];

  for (let index = 0; index < cards.length; index++) {
    const item = cards[index];
    if (item == null) continue;

    let card = repairUnsupportedCard(item, index);
    card = { ...card, id: card.id ?? `c${index + 1}` };
    card = repairInteractiveCard(card, index);
    card = normalizeLearningTags(card);

    const normalized = normalizeV2Card(card, index);
    if (!normalized) {
      console.warn('[content-v2] dropped invalid card', { type: card.type, index });
      continue;
    }

    repaired.push(normalized);
  }

  return repaired;
}

const ROMAN_SUFFIXES = ['', '', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

function romanSuffix(count: number): string {
  return ROMAN_SUFFIXES[count] ?? `${count}`;
}

export function ensureUniqueSlideTitles(cards: LessonCard[]): LessonCard[] {
  const seen = new Map<string, number>();
  return cards.map((card) => {
    if (!('title' in card) || typeof card.title !== 'string') return card;
    const title = card.title.replace(/\s+/g, ' ').trim();
    if (!title) return card;
    const key = title.toLowerCase();
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    if (count === 0) {
      return title === card.title ? card : { ...card, title };
    }
    return { ...card, title: `${title} ${romanSuffix(count + 1)}` };
  });
}
