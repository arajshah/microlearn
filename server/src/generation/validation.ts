import type {
  CardRecord,
  LessonBlueprint,
  LessonInteractionPlan,
  MisconceptionCheck,
} from './types';
import { asNumber, asString, asStringArray } from './json';
import { isInteractiveCard, isExplanationLike } from './cards';

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

export function objectivesAlign(a: string, b: string): boolean {
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

  const estimatedMinutes = asNumber(obj.estimatedMinutes, 5);
  if (estimatedMinutes < 3 || estimatedMinutes > 12) {
    errors.push(`estimatedMinutes out of range (${estimatedMinutes})`);
  }

  const blueprint: LessonBlueprint = {
    id: asString(obj.id) || '',
    roadmapId: ctx.roadmapId,
    roadmapNodeId: ctx.roadmapNodeId,
    version: 2,
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
    estimatedMinutes: Math.min(12, Math.max(3, estimatedMinutes)),
    createdAt: new Date().toISOString(),
    coreMentalModel: asString(obj.coreMentalModel) || undefined,
    formalDefinition: asString(obj.formalDefinition) || undefined,
    notation: Array.isArray(obj.notation)
      ? obj.notation
          .map((n) => {
            if (!n || typeof n !== 'object') return null;
            const r = n as Record<string, unknown>;
            const symbol = asString(r.symbol);
            const meaning = asString(r.meaning);
            return symbol && meaning ? { symbol, meaning } : null;
          })
          .filter(Boolean) as { symbol: string; meaning: string }[]
      : undefined,
    workedExamplePlan: asString(obj.workedExamplePlan) || undefined,
    misconceptionTargets: asStringArray(obj.misconceptionTargets),
    visualModel: asString(obj.visualModel) || undefined,
    practiceCheck: asString(obj.practiceCheck) || undefined,
    nextBridge: asString(obj.nextBridge) || undefined,
    conceptTags: asStringArray(obj.conceptTags),
    skillTags: asStringArray(obj.skillTags),
    prerequisiteConcepts: asStringArray(obj.prerequisiteConcepts),
  };

  return { blueprint, errors };
}

export function validateBlueprint(blueprint: LessonBlueprint, expectedObjective: string): string[] {
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

function cardStage(card: CardRecord): LessonStage | null {
  switch (card.type) {
    case 'hook':
      return 'hook';
    case 'recall':
      return 'recall';
    case 'explanation':
    case 'concept':
    case 'formula':
    case 'derivation':
    case 'visual_model':
    case 'compare_contrast':
      return 'explanation';
    case 'example':
    case 'code':
    case 'worked_example':
      return 'example';
    case 'quiz':
    case 'truefalse':
    case 'fillblank':
    case 'matching':
    case 'ordering':
    case 'prediction':
      return 'interaction';
    case 'misconception':
    case 'misconception_check':
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

function validateGradedCard(card: CardRecord): string[] {
  const errors: string[] = [];
  if (card.type === 'quiz' || card.type === 'application' || card.type === 'prediction') {
    const options = Array.isArray(card.options)
      ? card.options.filter((o): o is string => typeof o === 'string')
      : [];
    if (!asString(card.question)) errors.push('Missing question');
    if (options.length < 2) errors.push('Need at least 2 options');
    const answerIndex = typeof card.answerIndex === 'number' ? card.answerIndex : -1;
    if (answerIndex < 0 || answerIndex >= options.length) errors.push('Invalid answerIndex');
    if (!asString(card.explanation)) errors.push('Missing explanation');
  } else if (card.type === 'misconception' || card.type === 'misconception_check') {
    const options = Array.isArray(card.options)
      ? card.options.filter((o): o is string => typeof o === 'string')
      : [];
    if (!asString(card.question) || options.length < 2) errors.push('Invalid misconception card');
  } else if (card.type === 'truefalse') {
    if (!asString(card.statement) || !asString(card.explanation)) errors.push('Invalid true/false card');
  }
  return errors;
}

export function validateMaterializedLesson(
  cards: CardRecord[],
  blueprint: LessonBlueprint,
  targetSlideCount?: number,
): string[] {
  const errors: string[] = [];
  const minSlides = targetSlideCount ? Math.max(3, targetSlideCount - 2) : 6;
  const maxSlides = targetSlideCount ? Math.min(20, targetSlideCount + 2) : 14;

  if (cards.length < minSlides || cards.length > maxSlides) {
    errors.push(
      targetSlideCount
        ? `Expected ~${targetSlideCount} slides, got ${cards.length}`
        : `Expected ${minSlides}-${maxSlides} slides, got ${cards.length}`,
    );
  }

  const ids = cards.map((c, i) => asString(c.id) || `c${i + 1}`);
  if (new Set(ids).size !== ids.length) errors.push('Duplicate card IDs');

  for (const card of cards) {
    if (isInteractiveCard(card) || ['quiz', 'application', 'prediction', 'misconception', 'misconception_check', 'truefalse'].includes(card.type)) {
      errors.push(...validateGradedCard(card));
    }
    if (card.type === 'summary') {
      const points = Array.isArray(card.points) ? card.points : [];
      if (points.length === 0) errors.push('Empty summary card');
    }
  }

  const stages = new Set(cards.map(cardStage).filter(Boolean));
  for (const stage of ['recall', 'explanation', 'example', 'interaction', 'application', 'summary'] as LessonStage[]) {
    if (!stages.has(stage)) errors.push(`Missing stage: ${stage}`);
  }

  if (
    blueprint.misconceptionChecks.length > 0 &&
    !stages.has('misconception') &&
    !cards.some((c) => ['quiz', 'truefalse', 'misconception_check'].includes(c.type))
  ) {
    errors.push('Missing misconception check');
  }

  return errors;
}

export function depthUnitRange(lessonCount: number): [number, number] {
  const units = Math.max(2, Math.min(8, Math.ceil(lessonCount / 3)));
  return [Math.max(2, units - 1), units + 1];
}

export function validateLessonCount(target: number, actual: number): string[] {
  const tolerance = Math.max(2, Math.round(target * 0.2));
  if (actual < target - tolerance || actual > target + tolerance) {
    return [`Expected ~${target} lessons, got ${actual}`];
  }
  return [];
}

export interface RoadmapLessonBuild {
  id: string;
  unitId: string;
  title: string;
  shortDescription: string;
  learningObjective: string;
  estimatedMinutes: number;
  difficulty: number;
  order: number;
  prerequisiteIds: string[];
  keyIdeas: string[];
  status: 'locked' | 'available';
  aliases: string[];
}

export interface RoadmapUnitBuild {
  id: string;
  title: string;
  description: string;
  order: number;
  lessons: RoadmapLessonBuild[];
}

export function validateRoadmapStructure(
  units: RoadmapUnitBuild[],
  input: { lessonCount: number },
): string[] {
  const errors: string[] = [];
  const flat = units.flatMap((u) => u.lessons);
  const unitRange = depthUnitRange(input.lessonCount);

  if (units.length < unitRange[0] || units.length > unitRange[1] + 1) {
    errors.push(`Expected ${unitRange[0]}-${unitRange[1]} units, got ${units.length}`);
  }
  errors.push(...validateLessonCount(input.lessonCount, flat.length));

  const unitIds = new Set(units.map((u) => u.id));
  if (unitIds.size !== units.length) errors.push('Duplicate unit IDs');

  const lessonIds = new Set<string>();
  for (const l of flat) {
    if (lessonIds.has(l.id)) errors.push(`Duplicate lesson id: ${l.id}`);
    lessonIds.add(l.id);
    if (!l.learningObjective.trim()) errors.push(`Lesson ${l.id} missing objective`);
  }

  const orderMap = new Map(flat.map((l, i) => [l.id, i]));
  for (const l of flat) {
    for (const pid of l.prerequisiteIds) {
      if (!lessonIds.has(pid)) errors.push(`Lesson ${l.id} references unknown prerequisite ${pid}`);
      else if ((orderMap.get(pid) ?? 0) >= (orderMap.get(l.id) ?? 0)) {
        errors.push(`Lesson ${l.id} has forward prerequisite ${pid}`);
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  function dfs(id: string): boolean {
    if (visited.has(id)) return false;
    if (visiting.has(id)) return true;
    visiting.add(id);
    const node = flat.find((l) => l.id === id);
    for (const p of node?.prerequisiteIds ?? []) {
      if (dfs(p)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  for (const l of flat) {
    if (dfs(l.id)) {
      errors.push('Circular prerequisite dependency detected');
      break;
    }
  }

  return errors;
}

export function countCardVariety(cards: CardRecord[]): number {
  return new Set(cards.map((c) => c.type)).size;
}

export function countExplanationCards(cards: CardRecord[]): number {
  return cards.filter(isExplanationLike).length;
}

export function countInteractiveCards(cards: CardRecord[]): number {
  return cards.filter(isInteractiveCard).length;
}
