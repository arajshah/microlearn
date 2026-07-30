import { CognitiveLevel, EstimatedDifficulty, LessonCard } from '@/types/content';

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'on', 'with', 'is', 'are',
  'this', 'that', 'it', 'its', 'be', 'as', 'by', 'from', 'at', 'how', 'what', 'why',
  'when', 'which', 'you', 'your', 'we', 'intro', 'introduction', 'basics', 'overview',
]);

const COGNITIVE_LEVELS: CognitiveLevel[] = [
  'recall',
  'understand',
  'apply',
  'analyze',
  'synthesize',
];

/**
 * Canonical concept identifier: lowercase, hyphenated, punctuation stripped.
 * Must stay in sync with the server implementation in server/src/adaptive/concepts.ts.
 */
export function normalizeConceptSlug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Default weakness tag implied by a card type when the generator omits one. */
export function weaknessTagForCardType(cardType: string): string {
  switch (cardType) {
    case 'formula':
      return 'formula_interpretation';
    case 'derivation':
      return 'derivation_steps';
    case 'worked_example':
      return 'procedural_application';
    case 'misconception':
    case 'misconception_check':
      return 'misconception';
    case 'compare_contrast':
      return 'conceptual_distinction';
    case 'application':
      return 'transfer';
    case 'prediction':
      return 'causal_prediction';
    case 'matching':
      return 'vocabulary';
    case 'ordering':
      return 'sequence_process';
    case 'quiz':
    case 'truefalse':
    case 'fillblank':
      return 'recall_or_concept_check';
    default:
      return 'general_understanding';
  }
}

/** Cognitive level implied by a card type, used when the generator omits one. */
export function cognitiveLevelForCardType(cardType: string): CognitiveLevel {
  switch (cardType) {
    case 'recall':
    case 'flashcard':
    case 'matching':
    case 'truefalse':
    case 'fillblank':
      return 'recall';
    case 'hook':
    case 'concept':
    case 'explanation':
    case 'formula':
    case 'visual_model':
    case 'quiz':
      return 'understand';
    case 'example':
    case 'worked_example':
    case 'application':
    case 'ordering':
      return 'apply';
    case 'derivation':
    case 'compare_contrast':
    case 'misconception':
    case 'misconception_check':
    case 'prediction':
      return 'analyze';
    case 'summary':
    case 'next_connection':
      return 'synthesize';
    default:
      return 'understand';
  }
}

function keywordSlugs(text: string, limit: number): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));

  const seen = new Set<string>();
  const out: string[] = [];
  for (const word of words) {
    const slug = normalizeConceptSlug(word);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
    if (out.length >= limit) break;
  }
  return out;
}

function cardText(card: LessonCard): string {
  const raw = card as unknown as Record<string, unknown>;
  const fields = ['title', 'question', 'prompt', 'misconception', 'statement', 'sentence', 'body'];
  return fields
    .map((f) => (typeof raw[f] === 'string' ? (raw[f] as string) : ''))
    .filter(Boolean)
    .join(' ');
}

/** Concept tags for a card, falling back to lesson tags then card keywords. */
export function resolveCardConceptTags(
  card: LessonCard,
  lessonConceptTags: string[] = [],
  lessonTitle = '',
): string[] {
  const explicit = Array.isArray(card.conceptTags)
    ? card.conceptTags.map(normalizeConceptSlug).filter(Boolean)
    : [];
  if (explicit.length > 0) return [...new Set(explicit)];

  const fromLesson = lessonConceptTags.map(normalizeConceptSlug).filter(Boolean);
  if (fromLesson.length > 0) return [...new Set(fromLesson)].slice(0, 3);

  const inferred = keywordSlugs(`${cardText(card)} ${lessonTitle}`, 2);
  return inferred.length > 0 ? inferred : ['general'];
}

/** Weakness tags for a card, inferring from card type when absent. */
export function resolveCardWeaknessTags(card: LessonCard): string[] {
  const explicit = Array.isArray(card.weaknessTags)
    ? card.weaknessTags.filter((t) => typeof t === 'string' && t.length > 0)
    : [];
  if (explicit.length > 0) return [...new Set(explicit)];
  return [weaknessTagForCardType(card.type)];
}

export function resolveCardSkillTags(card: LessonCard, lessonSkillTags: string[] = []): string[] {
  const explicit = Array.isArray(card.skillTags)
    ? card.skillTags.filter((t) => typeof t === 'string' && t.length > 0)
    : [];
  if (explicit.length > 0) return [...new Set(explicit)];
  return [...new Set(lessonSkillTags)].slice(0, 3);
}

export function coerceCognitiveLevel(value: unknown, cardType: string): CognitiveLevel {
  return COGNITIVE_LEVELS.includes(value as CognitiveLevel)
    ? (value as CognitiveLevel)
    : cognitiveLevelForCardType(cardType);
}

export function coerceEstimatedDifficulty(value: unknown): EstimatedDifficulty | undefined {
  const n = typeof value === 'number' ? Math.round(value) : Number.NaN;
  if (!Number.isFinite(n) || n < 1 || n > 5) return undefined;
  return n as EstimatedDifficulty;
}

/** Extract adaptive metadata from a raw AI card payload without dropping unknown shapes. */
export function extractLearningMetadata(raw: Record<string, unknown>, cardType: string) {
  const strings = (v: unknown): string[] | undefined => {
    if (!Array.isArray(v)) return undefined;
    const list = v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
    return list.length > 0 ? list : undefined;
  };

  const conceptTags = strings(raw.conceptTags)?.map(normalizeConceptSlug).filter(Boolean);
  return {
    conceptTags: conceptTags && conceptTags.length > 0 ? conceptTags : undefined,
    skillTags: strings(raw.skillTags),
    weaknessTags: strings(raw.weaknessTags),
    cognitiveLevel: COGNITIVE_LEVELS.includes(raw.cognitiveLevel as CognitiveLevel)
      ? (raw.cognitiveLevel as CognitiveLevel)
      : cognitiveLevelForCardType(cardType),
    estimatedDifficulty: coerceEstimatedDifficulty(raw.estimatedDifficulty),
  };
}
