import type { CardRecord } from './types';

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
  return typeof value === 'string' ? value.trim() : fallback;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

export function normalizeConceptSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function isSupportedCardType(type: unknown): type is SupportedCardType {
  return typeof type === 'string' && (SUPPORTED_CARD_TYPES as readonly string[]).includes(type);
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

export function repairUnsupportedCard(card: unknown, index: number): CardRecord {
  const raw =
    card && typeof card === 'object' ? (card as Record<string, unknown>) : ({} as Record<string, unknown>);
  const type = asString(raw.type, 'unknown');
  const id = asString(raw.id) || `c${index + 1}`;

  if (isSupportedCardType(type)) {
    return { ...raw, type, id };
  }

  return {
    type: 'explanation',
    id,
    title: extractTitle(raw, index),
    body: extractBody(raw),
    conceptTags: stringArray(raw.conceptTags),
    skillTags: stringArray(raw.skillTags),
  };
}

function repairInteractiveCard(card: CardRecord, index: number): CardRecord {
  const interactiveTypes = new Set([
    'quiz',
    'fillblank',
    'application',
    'misconception',
    'misconception_check',
    'prediction',
  ]);
  if (!interactiveTypes.has(card.type)) return card;

  const options = Array.isArray(card.options)
    ? card.options.filter((o): o is string => typeof o === 'string' && o.length > 0)
    : [];
  const answerIndex = typeof card.answerIndex === 'number' ? card.answerIndex : -1;
  const hasValid =
    options.length >= 2 &&
    answerIndex >= 0 &&
    answerIndex < options.length &&
    Boolean(asString(card.explanation));

  if (hasValid) return card;

  return {
    type: 'explanation',
    id: card.id ?? `c${index + 1}`,
    title: asString(card.question) || asString(card.misconception) || 'Review',
    body: asString(card.explanation) || 'This check could not be rendered as a quiz.',
    conceptTags: stringArray(card.conceptTags),
    skillTags: stringArray(card.skillTags),
  };
}

function normalizeLearningTags(card: CardRecord): CardRecord {
  const conceptTags = Array.isArray(card.conceptTags)
    ? [...new Set(card.conceptTags.map((t) => normalizeConceptSlug(String(t))).filter(Boolean))]
    : undefined;
  const skillTags = Array.isArray(card.skillTags)
    ? [...new Set(card.skillTags.filter((t) => typeof t === 'string' && t.length > 0))]
    : undefined;
  return {
    ...card,
    conceptTags: conceptTags?.length ? conceptTags : undefined,
    skillTags: skillTags?.length ? skillTags : undefined,
  };
}

function normalizeV2Card(card: CardRecord): CardRecord | null {
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
    return repairInteractiveCard(card, 0);
  }
  return card;
}

export function repairLessonCards(cards: unknown[]): CardRecord[] {
  const repaired: CardRecord[] = [];
  for (let index = 0; index < cards.length; index++) {
    const item = cards[index];
    if (item == null) continue;
    let card = repairUnsupportedCard(item, index);
    card = { ...card, id: asString(card.id) || `c${index + 1}` };
    card = repairInteractiveCard(card, index);
    card = normalizeLearningTags(card);
    const normalized = normalizeV2Card(card);
    if (!normalized) continue;
    repaired.push(normalized);
  }
  return repaired;
}

export function assignCardIds(cards: CardRecord[]): CardRecord[] {
  return cards.map((card, i) => ({
    ...card,
    id: asString(card.id) || `c${i + 1}`,
  }));
}

export function isInteractiveCard(card: CardRecord): boolean {
  return [
    'quiz',
    'truefalse',
    'fillblank',
    'matching',
    'ordering',
    'application',
    'misconception',
    'misconception_check',
    'prediction',
  ].includes(card.type);
}

export function isExplanationLike(card: CardRecord): boolean {
  return [
    'explanation',
    'concept',
    'example',
    'hook',
    'recall',
    'visual_model',
    'formula',
    'derivation',
    'worked_example',
    'compare_contrast',
  ].includes(card.type);
}

export const SUPPORTED_TYPES_LIST = SUPPORTED_CARD_TYPES.join('|');
