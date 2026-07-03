import {
  ApplicationCard,
  GradedCard,
  LessonCard,
  MisconceptionCard,
  PredictionCard,
  QuizCard,
} from '@/types/content';
import {
  BLUEPRINT_VERSION,
  LessonBlueprint,
  LessonInteractionPlan,
  MisconceptionCheck,
} from '@/types/lessonBlueprint';
import { asNum, asString, asStringArray } from '@/ai/jsonExtract';

const INTERACTION_TYPES: LessonInteractionPlan['type'][] = [
  'multiple_choice',
  'true_false',
  'short_answer',
  'prediction',
  'ordering',
  'classification',
];

function normalizeObjective(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function objectivesAlign(a: string, b: string): boolean {
  const na = normalizeObjective(a);
  const nb = normalizeObjective(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

function parseInteractionPlan(input: unknown): LessonInteractionPlan[] {
  if (!Array.isArray(input)) return [];
  const out: LessonInteractionPlan[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const type = asString(r.type) as LessonInteractionPlan['type'];
    if (!INTERACTION_TYPES.includes(type)) continue;
    const purpose = asString(r.purpose);
    const conceptTested = asString(r.conceptTested);
    if (!purpose || !conceptTested) continue;
    out.push({ type, purpose, conceptTested });
  }
  return out;
}

function parseMisconceptionChecks(input: unknown): MisconceptionCheck[] {
  if (!Array.isArray(input)) return [];
  const out: MisconceptionCheck[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const misconception = asString(r.misconception);
    const diagnosticQuestion = asString(r.diagnosticQuestion);
    const correctionGoal = asString(r.correctionGoal);
    if (!misconception || !diagnosticQuestion) continue;
    out.push({ misconception, diagnosticQuestion, correctionGoal });
  }
  return out;
}

export function parseBlueprintObject(
  obj: Record<string, unknown>,
  ctx: {
    roadmapId: string;
    roadmapNodeId: string;
    expectedObjective: string;
    expectedTitle: string;
  },
): { blueprint: LessonBlueprint; errors: string[] } {
  const errors: string[] = [];
  const title = asString(obj.title) || ctx.expectedTitle;
  const primaryObjective = asString(obj.primaryObjective);
  if (!primaryObjective) errors.push('Missing primaryObjective');
  if (primaryObjective && !objectivesAlign(primaryObjective, ctx.expectedObjective)) {
    errors.push('primaryObjective does not match roadmap node objective');
  }

  const keyIdeas = asStringArray(obj.keyIdeas);
  if (keyIdeas.length === 0) errors.push('keyIdeas must not be empty');

  const explanationPlan = asStringArray(obj.explanationPlan);
  const examplePlan = asStringArray(obj.examplePlan);
  const interactionPlan = parseInteractionPlan(obj.interactionPlan);
  const misconceptionChecks = parseMisconceptionChecks(obj.misconceptionChecks);
  const applicationPlan = asStringArray(obj.applicationPlan);
  const summaryPoints = asStringArray(obj.summaryPoints);
  const prerequisiteRecall = asStringArray(obj.prerequisiteRecall);

  if (explanationPlan.length === 0) errors.push('explanationPlan must not be empty');
  if (examplePlan.length === 0) errors.push('examplePlan must not be empty');
  if (interactionPlan.length === 0) errors.push('interactionPlan must not be empty');
  if (applicationPlan.length === 0) errors.push('applicationPlan must not be empty');
  if (summaryPoints.length === 0) errors.push('summaryPoints must not be empty');

  const estimatedMinutes = asNum(obj.estimatedMinutes, 5);
  if (estimatedMinutes < 3 || estimatedMinutes > 8) {
    errors.push(`estimatedMinutes out of range (${estimatedMinutes})`);
  }

  const allSections = [
    ...explanationPlan,
    ...examplePlan,
    ...interactionPlan.map((i) => i.conceptTested),
    ...applicationPlan,
    ...summaryPoints,
  ];
  const dupes = allSections.filter(
    (s, i) => allSections.indexOf(s) !== i && s.length > 20,
  );
  if (dupes.length > 0) errors.push('Obvious duplication across blueprint sections');

  const blueprint: LessonBlueprint = {
    id: asString(obj.id) || '',
    roadmapId: ctx.roadmapId,
    roadmapNodeId: ctx.roadmapNodeId,
    version: BLUEPRINT_VERSION,
    title,
    primaryObjective: primaryObjective || ctx.expectedObjective,
    prerequisiteRecall,
    keyIdeas,
    explanationPlan,
    examplePlan,
    interactionPlan,
    misconceptionChecks,
    applicationPlan,
    summaryPoints,
    previousLessonConnection: asString(obj.previousLessonConnection) || undefined,
    nextLessonConnection: asString(obj.nextLessonConnection) || undefined,
    estimatedMinutes: Math.min(8, Math.max(3, estimatedMinutes)),
    createdAt: new Date().toISOString(),
  };

  return { blueprint, errors };
}

export function validateBlueprint(
  blueprint: LessonBlueprint,
  expectedObjective: string,
): string[] {
  const errors: string[] = [];
  if (!blueprint.primaryObjective.trim()) errors.push('Missing primary objective');
  if (!objectivesAlign(blueprint.primaryObjective, expectedObjective)) {
    errors.push('Objective mismatch with roadmap node');
  }
  if (blueprint.keyIdeas.length === 0) errors.push('No key ideas');
  if (blueprint.interactionPlan.length === 0) errors.push('No interactions planned');
  if (blueprint.explanationPlan.length === 0) errors.push('No explanation plan');
  if (blueprint.examplePlan.length === 0) errors.push('No example plan');
  if (blueprint.summaryPoints.length === 0) errors.push('No summary points');
  if (blueprint.estimatedMinutes < 3 || blueprint.estimatedMinutes > 8) {
    errors.push('Invalid estimated minutes');
  }
  return errors;
}

type LessonStage =
  | 'hook'
  | 'recall'
  | 'explanation'
  | 'example'
  | 'interaction'
  | 'misconception'
  | 'application'
  | 'summary'
  | 'next_connection';

function cardStage(card: LessonCard): LessonStage | null {
  switch (card.type) {
    case 'hook':
      return 'hook';
    case 'recall':
      return 'recall';
    case 'explanation':
    case 'concept':
      return 'explanation';
    case 'example':
    case 'code':
      return 'example';
    case 'quiz':
    case 'truefalse':
    case 'fillblank':
    case 'matching':
    case 'ordering':
    case 'prediction':
      return 'interaction';
    case 'misconception':
      return 'misconception';
    case 'application':
      return 'application';
    case 'summary':
      return 'summary';
    case 'next_connection':
      return 'next_connection';
    default:
      return null;
  }
}

function isGradedCardType(card: LessonCard): card is GradedCard {
  return (
    card.type === 'quiz' ||
    card.type === 'truefalse' ||
    card.type === 'fillblank' ||
    card.type === 'matching' ||
    card.type === 'ordering' ||
    card.type === 'misconception' ||
    card.type === 'application' ||
    card.type === 'prediction'
  );
}

function validateGradedCard(card: GradedCard): string[] {
  const errors: string[] = [];
  if (card.type === 'quiz' || card.type === 'application' || card.type === 'prediction') {
    const c = card as QuizCard | ApplicationCard | PredictionCard;
    if (!c.question?.trim()) errors.push('Missing question');
    if (c.options.length < 2) errors.push('Need at least 2 options');
    if (c.answerIndex < 0 || c.answerIndex >= c.options.length) {
      errors.push('Invalid answerIndex');
    }
    if (!c.explanation?.trim()) errors.push('Missing explanation');
  } else if (card.type === 'misconception') {
    const c = card as MisconceptionCard;
    if (!c.question?.trim() || c.options.length < 2) errors.push('Invalid misconception card');
    if (c.answerIndex < 0 || c.answerIndex >= c.options.length) {
      errors.push('Invalid misconception answerIndex');
    }
    if (!c.explanation?.trim()) errors.push('Missing misconception explanation');
  } else if (card.type === 'truefalse') {
    if (!card.statement?.trim() || !card.explanation?.trim()) {
      errors.push('Invalid true/false card');
    }
  } else if (card.type === 'fillblank') {
    if (!card.sentence.includes('___') || card.options.length < 2) {
      errors.push('Invalid fill-blank card');
    }
    if (card.answerIndex < 0 || card.answerIndex >= card.options.length) {
      errors.push('Invalid fill-blank answerIndex');
    }
  } else if (card.type === 'matching') {
    if (card.pairs.length < 2) errors.push('Matching needs at least 2 pairs');
  } else if (card.type === 'ordering') {
    if (card.items.length < 2) errors.push('Ordering needs at least 2 items');
  }
  return errors;
}

export function validateMaterializedLesson(
  cards: LessonCard[],
  blueprint: LessonBlueprint,
): string[] {
  const errors: string[] = [];

  if (cards.length < 6 || cards.length > 12) {
    errors.push(`Expected 6–10 cards, got ${cards.length}`);
  }

  const ids = cards.map((c, i) => c.id ?? `c${i + 1}`);
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) errors.push('Duplicate card IDs');

  for (const card of cards) {
    if (isGradedCardType(card)) {
      errors.push(...validateGradedCard(card));
    }
    if (card.type === 'hook' && !card.body.trim()) errors.push('Empty hook card');
    if (card.type === 'recall' && !card.body.trim()) errors.push('Empty recall card');
    if (card.type === 'summary' && card.points.length === 0) {
      errors.push('Empty summary card');
    }
  }

  const stages = new Set(cards.map(cardStage).filter(Boolean));
  const required: LessonStage[] = [
    'recall',
    'explanation',
    'example',
    'interaction',
    'application',
    'summary',
  ];
  for (const stage of required) {
    if (!stages.has(stage)) errors.push(`Missing stage: ${stage}`);
  }

  if (
    blueprint.misconceptionChecks.length > 0 &&
    !stages.has('misconception') &&
    !cards.some((c) => c.type === 'quiz' || c.type === 'truefalse')
  ) {
    errors.push('Missing misconception check');
  }

  return errors;
}

export function assignCardIds(cards: LessonCard[]): LessonCard[] {
  return cards.map((card, i) => ({
    ...card,
    id: card.id?.trim() || `c${i + 1}`,
  }));
}
