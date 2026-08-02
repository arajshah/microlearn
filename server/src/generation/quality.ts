import type { CardRecord, GeneratedLessonDraft, LessonBlueprint, LessonGenerationContext, LessonQualityReport } from './types';
import { isHardTopic, isMathHeavy } from './strategy';
import {
  countCardVariety,
  countExplanationCards,
  countInteractiveCards,
  validateMaterializedLesson,
} from './validation';

export interface QualityEvaluationInput {
  draft: GeneratedLessonDraft;
  blueprint: LessonBlueprint;
  ctx: LessonGenerationContext;
  structuralErrors?: string[];
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function evaluateLessonQuality(input: QualityEvaluationInput): LessonQualityReport {
  const { draft, blueprint, ctx, structuralErrors = [] } = input;
  const cards = draft.cards;
  const issues: string[] = [...structuralErrors];
  const warnings: string[] = [];

  const variety = countCardVariety(cards);
  const interactive = countInteractiveCards(cards);
  const explanations = countExplanationCards(cards);
  const workedExamples = cards.filter((c) => c.type === 'worked_example').length;
  const formulas = cards.filter((c) => c.type === 'formula' || c.type === 'derivation').length;
  const misconceptions = cards.filter((c) =>
    ['misconception', 'misconception_check'].includes(c.type),
  ).length;
  const applications = cards.filter((c) => c.type === 'application').length;
  const summaries = cards.filter((c) => c.type === 'summary').length;

  const target = ctx.slidesPerLesson ?? 8;
  const hard = isHardTopic('', `${ctx.currentLessonTitle} ${ctx.roadmapTitle}`);
  const math = isMathHeavy('', ctx.currentLessonTitle);

  if (interactive < 1) issues.push('Missing active check');
  if (explanations < 2) issues.push('Too few explanation cards');
  if (summaries < 1) issues.push('Missing summary');
  if (applications < 1 && target >= 8) warnings.push('Missing application card');
  if (misconceptions < 1 && blueprint.misconceptionChecks.length > 0) {
    warnings.push('Blueprint planned misconceptions but lesson lacks them');
  }
  if (hard && workedExamples < 1 && target >= 8) warnings.push('Technical topic missing worked example');
  if (math && formulas < 1 && target >= 8) warnings.push('Math topic missing formula or derivation');
  if (variety < 4 && cards.length >= 8) warnings.push('Low card variety');

  const objectiveCoverage =
    draft.primaryObjective && objectivesMentioned(draft.primaryObjective, cards) ? 85 : 55;
  const technicalDepth = clampScore(
    (workedExamples > 0 ? 25 : 0) +
      (formulas > 0 ? 25 : 0) +
      (explanations >= 2 ? 25 : 10) +
      (hard ? 25 : 15),
  );
  const activeRecall = clampScore(interactive >= 2 ? 90 : interactive >= 1 ? 70 : 30);
  const applicationCoverage = clampScore(applications > 0 ? 85 : 40);
  const misconceptionCoverage = clampScore(
    misconceptions > 0 ? 85 : blueprint.misconceptionChecks.length > 0 ? 35 : 60,
  );
  const cardVariety = clampScore((variety / Math.max(6, Math.min(10, target))) * 100);
  const sourceGrounding = ctx.sourceExcerpt
    ? clampScore(hasSourceTerminology(cards, ctx.sourceExcerpt) ? 80 : 50)
    : 70;
  const structuralValidity = clampScore(
    structuralErrors.length === 0 ? 95 : Math.max(20, 95 - structuralErrors.length * 15),
  );

  const score = clampScore(
    objectiveCoverage * 0.15 +
      technicalDepth * 0.15 +
      activeRecall * 0.15 +
      applicationCoverage * 0.1 +
      misconceptionCoverage * 0.1 +
      cardVariety * 0.1 +
      sourceGrounding * 0.1 +
      structuralValidity * 0.15,
  );

  const accepted = score >= 60 && issues.length === 0 && cards.length >= 3;

  return {
    score,
    accepted,
    issues,
    warnings,
    dimensions: {
      objectiveCoverage,
      technicalDepth,
      activeRecall,
      applicationCoverage,
      misconceptionCoverage,
      cardVariety: cardVariety,
      sourceGrounding,
      structuralValidity,
    },
  };
}

function objectivesMentioned(objective: string, cards: CardRecord[]): boolean {
  const words = objective
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 4)
    .slice(0, 6);
  const text = cards
    .map((c) => JSON.stringify(c))
    .join(' ')
    .toLowerCase();
  return words.some((w) => text.includes(w));
}

function hasSourceTerminology(cards: CardRecord[], excerpt: string): boolean {
  const terms = excerpt
    .split(/[^a-zA-Z0-9]+/)
    .filter((w) => w.length > 5)
    .slice(0, 12)
    .map((w) => w.toLowerCase());
  const text = cards.map((c) => JSON.stringify(c)).join(' ').toLowerCase();
  return terms.some((t) => text.includes(t));
}

export function repairLessonDraft(draft: GeneratedLessonDraft, blueprint: LessonBlueprint): GeneratedLessonDraft {
  const cards = draft.cards.map((card, index) => ({
    ...card,
    id: typeof card.id === 'string' && card.id.trim() ? card.id : `c${index + 1}`,
  }));

  const minutes = Number.isFinite(draft.minutes)
    ? Math.min(20, Math.max(3, Math.round(draft.minutes)))
    : Math.min(12, Math.max(4, Math.ceil(cards.length * 0.75)));

  return {
    ...draft,
    title: draft.title.trim() || blueprint.title,
    subtitle: draft.subtitle.trim() || blueprint.primaryObjective,
    minutes,
    primaryObjective: draft.primaryObjective.trim() || blueprint.primaryObjective,
    conceptTags: [...new Set((draft.conceptTags ?? []).filter(Boolean))].slice(0, 12),
    skillTags: [...new Set((draft.skillTags ?? []).filter(Boolean))].slice(0, 12),
    cards,
  };
}

export function materialValidationErrors(
  cards: CardRecord[],
  blueprint: LessonBlueprint,
  targetSlideCount?: number,
): string[] {
  return validateMaterializedLesson(cards, blueprint, targetSlideCount);
}
