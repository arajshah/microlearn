import { GeneratedRoadmap } from '@/types/roadmap';
import { LessonGenerationContext } from '@/types/lessonGeneration';
import { LessonOutcome, LessonMistake } from '@/types/lessonOutcome';
import { LessonCard, GeneratedLesson } from '@/types/content';
import {
  allRoadmapLessons,
  findRoadmapNode,
  findRoadmapUnit,
} from '@/utils/roadmapProgress';
import { getRoadmapLessonOutcomes } from '@/storage/lessonOutcomeStorage';
import { makeOutcomeId } from '@/storage/lessonOutcomeStorage';
import { isGradedCard } from '@/utils/cards';
import { formatRelevantSourceExcerpt } from '@/utils/urlSourceContext';

export async function buildLessonGenerationContext(
  roadmap: GeneratedRoadmap,
  nodeId: string,
): Promise<LessonGenerationContext | undefined> {
  const flat = allRoadmapLessons(roadmap);
  const idx = flat.findIndex((l) => l.id === nodeId);
  if (idx === -1) return undefined;
  const node = flat[idx];
  const unit = findRoadmapUnit(roadmap, node.unitId);
  if (!unit) return undefined;

  const allOutcomes = await getRoadmapLessonOutcomes(roadmap.id);
  const priorNodes = flat.slice(0, idx);
  const priorNodeIds = new Set(priorNodes.map((n) => n.id));
  const previousLessonOutcomes = allOutcomes
    .filter((o) => priorNodeIds.has(o.roadmapNodeId))
    .slice(-2);

  const knownMisconceptions = [
    ...new Set(
      allOutcomes
        .filter((o) => priorNodeIds.has(o.roadmapNodeId))
        .flatMap((o) => o.observedMisconceptions),
    ),
  ];

  const prerequisiteLessons = node.prerequisiteIds
    .map((pid) => flat.find((l) => l.id === pid))
    .filter(Boolean)
    .map((l) => ({ title: l!.title, objective: l!.learningObjective }));

  return {
    roadmapId: roadmap.id,
    roadmapTitle: roadmap.title,
    roadmapGoal: roadmap.goal,
    unitTitle: unit.title,
    unitDescription: unit.description,
    currentLessonTitle: node.title,
    currentLearningObjective: node.learningObjective,
    currentKeyIdeas: node.keyIdeas,
    masteryLevel: roadmap.masteryLevel,
    learningPreferences: roadmap.preferences,
    previousLessonOutcomes,
    knownMisconceptions,
    upcomingLessons: flat.slice(idx + 1, idx + 3).map((l) => ({
      title: l.title,
      objective: l.learningObjective,
    })),
    prerequisiteLessons,
    sourceContext: roadmap.sourceContext,
    sourceExcerpt: roadmap.sourceContext
      ? formatRelevantSourceExcerpt(
          roadmap.sourceContext,
          node.title,
          node.keyIdeas,
          unit.title,
        )
      : undefined,
  };
}

function cardConcept(card: LessonCard): string {
  if (card.type === 'misconception') return card.misconception;
  if (card.type === 'quiz' || card.type === 'application' || card.type === 'prediction') {
    return card.question.slice(0, 80);
  }
  if (card.type === 'truefalse') return card.statement.slice(0, 80);
  if (card.type === 'fillblank') return card.sentence.slice(0, 80);
  if (card.type === 'matching') return card.prompt;
  if (card.type === 'ordering') return card.prompt;
  return card.type;
}

function formatUserAnswer(card: LessonCard, selected: number | null): string | undefined {
  if (selected == null) return undefined;
  if (card.type === 'quiz' || card.type === 'application' || card.type === 'prediction' || card.type === 'misconception') {
    return card.options[selected];
  }
  if (card.type === 'truefalse') return selected === 1 ? 'True' : 'False';
  if (card.type === 'fillblank') return card.options[selected];
  return undefined;
}

function formatCorrectAnswer(card: LessonCard): string | undefined {
  if (card.type === 'quiz' || card.type === 'application' || card.type === 'prediction' || card.type === 'misconception') {
    return card.options[card.answerIndex];
  }
  if (card.type === 'truefalse') return card.answer ? 'True' : 'False';
  if (card.type === 'fillblank') return card.options[card.answerIndex];
  return undefined;
}

function classifyError(
  card: LessonCard,
  correct: boolean,
): LessonMistake['errorType'] {
  if (correct) return 'uncertain';
  if (card.type === 'misconception') return 'misconception';
  return 'uncertain';
}

function buildContinuitySummary(
  objective: string,
  accuracy: number,
  mistakes: LessonMistake[],
): string {
  if (mistakes.length === 0) {
    return `The learner completed "${objective}" with strong accuracy (${Math.round(accuracy * 100)}%). Continue to the next lesson.`;
  }
  const concepts = [...new Set(mistakes.map((m) => m.concept))].slice(0, 3).join(', ');
  return `The learner completed "${objective}" but missed questions on: ${concepts}. Briefly recall these distinctions before introducing new material.`;
}

export interface CardResult {
  cardIndex: number;
  cardId: string;
  correct: boolean;
  selected?: number | null;
}

export function buildLessonOutcome(args: {
  roadmapId: string;
  roadmapNodeId: string;
  lesson: GeneratedLesson;
  objective: string;
  results: CardResult[];
}): LessonOutcome {
  const { lesson, results, roadmapId, roadmapNodeId, objective } = args;
  const gradedResults = results.filter((r) => {
    const card = lesson.cards[r.cardIndex];
    return card && isGradedCard(card);
  });

  const totalQuestions = gradedResults.length;
  const correctAnswers = gradedResults.filter((r) => r.correct).length;
  const accuracy = totalQuestions ? correctAnswers / totalQuestions : 1;

  const mistakes: LessonMistake[] = [];
  const observedMisconceptions: string[] = [];

  for (const r of gradedResults) {
    if (r.correct) continue;
    const card = lesson.cards[r.cardIndex];
    if (!isGradedCard(card)) continue;
    const concept = cardConcept(card);
    mistakes.push({
      cardId: r.cardId,
      concept,
      userAnswer: formatUserAnswer(card, r.selected ?? null),
      correctAnswer: formatCorrectAnswer(card),
      errorType: classifyError(card, false),
    });
    if (card.type === 'misconception') {
      observedMisconceptions.push(card.misconception);
    }
  }

  const conceptsCovered = lesson.cards
    .filter((c) => c.type === 'explanation' || c.type === 'example' || c.type === 'summary')
    .flatMap((c) => {
      if (c.type === 'summary') return c.points;
      if (c.type === 'explanation' || c.type === 'example') return [c.title];
      return [];
    })
    .slice(0, 8);

  const masteryEstimate = Math.min(
    5,
    Math.max(1, Math.round(accuracy * lesson.cards.length > 0 ? 3 + accuracy * 2 : 3)),
  );

  return {
    id: makeOutcomeId(),
    roadmapId,
    roadmapNodeId,
    lessonId: lesson.id,
    objective,
    conceptsCovered,
    completedAt: new Date().toISOString(),
    totalQuestions,
    correctAnswers,
    accuracy,
    mistakes,
    observedMisconceptions,
    unresolvedQuestions: mistakes.map((m) => m.concept).slice(0, 3),
    masteryEstimate,
    continuitySummary: buildContinuitySummary(objective, accuracy, mistakes),
  };
}

export function getNodeObjective(
  roadmap: GeneratedRoadmap,
  nodeId: string,
): string | undefined {
  return findRoadmapNode(roadmap, nodeId)?.learningObjective;
}
