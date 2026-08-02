import type { Db } from '../db';
import type {
  LessonGenerationContext,
  LessonOutcomeSummary,
  PrerequisiteLessonContext,
  SourceContext,
  UpcomingLessonContext,
} from './types';
import { extractRelevantSourceExcerpt } from './sourceGrounding';
import { listRoadmapOutcomes } from '../outcomes/outcomeRepository';
import { getRoadmap } from '../api/repository';

function parseOutcomeSummary(outcome: Record<string, unknown>): LessonOutcomeSummary {
  const mistakes = Array.isArray(outcome.mistakes)
    ? outcome.mistakes.filter((m): m is Record<string, unknown> => Boolean(m) && typeof m === 'object')
    : [];
  return {
    objective: String(outcome.objective ?? ''),
    accuracy: typeof outcome.accuracy === 'number' ? outcome.accuracy : 0,
    continuitySummary: String(outcome.continuitySummary ?? outcome.objective ?? ''),
    mistakes: mistakes.map((m) => ({
      cardId: String(m.cardId ?? ''),
      concept: String(m.concept ?? ''),
      userAnswer: m.userAnswer != null ? String(m.userAnswer) : undefined,
      correctAnswer: m.correctAnswer != null ? String(m.correctAnswer) : undefined,
      errorType: (m.errorType as LessonOutcomeSummary['mistakes'][0]['errorType']) ?? 'knowledge_gap',
    })),
    observedMisconceptions: Array.isArray(outcome.observedMisconceptions)
      ? outcome.observedMisconceptions.filter((x): x is string => typeof x === 'string')
      : [],
  };
}

export function buildLessonGenerationContext(
  db: Db,
  input: {
    roadmapId: string;
    nodeId: string;
    slidesPerLesson?: number;
    learningPreferences?: string;
    sourceText?: string;
    sourceContext?: SourceContext;
    depth?: string;
  },
): LessonGenerationContext {
  const roadmap = getRoadmap(db, input.roadmapId);
  const flat = roadmap.units.flatMap((unit) =>
    unit.lessons.map((lesson) => ({ unit, lesson })),
  );
  const idx = flat.findIndex((entry) => entry.lesson.id === input.nodeId);
  const current = flat[idx];
  if (!current) throw new Error(`Node ${input.nodeId} not found`);

  const outcomes = listRoadmapOutcomes(db, input.roadmapId);
  const previousNodes = flat.slice(0, idx);
  const previousNodeIds = new Set(previousNodes.map((n) => n.lesson.id));

  const previousLessonOutcomes = outcomes
    .filter((o) => previousNodeIds.has(o.lessonNodeId))
    .map((o) => parseOutcomeSummary(o.outcome as Record<string, unknown>))
    .slice(0, 5);

  const knownMisconceptions = [
    ...new Set(previousLessonOutcomes.flatMap((o) => o.observedMisconceptions)),
  ].slice(0, 8);

  const prerequisiteLessons: PrerequisiteLessonContext[] = current.lesson.prerequisiteIds
    .map((pid) => flat.find((f) => f.lesson.id === pid))
    .filter(Boolean)
    .map((entry) => ({
      title: entry!.lesson.title,
      objective: entry!.lesson.learningObjective,
    }));

  const upcomingLessons: UpcomingLessonContext[] = flat
    .slice(idx + 1, idx + 4)
    .map((entry) => ({
      title: entry.lesson.title,
      objective: entry.lesson.learningObjective,
    }));

  const sourceExcerpt = input.sourceText
    ? extractRelevantSourceExcerpt(input.sourceText, current.lesson.title)
    : undefined;

  return {
    roadmapId: input.roadmapId,
    roadmapTitle: roadmap.title,
    roadmapGoal: roadmap.goal,
    unitTitle: current.unit.title,
    unitDescription: current.unit.description,
    currentLessonTitle: current.lesson.title,
    currentLearningObjective: current.lesson.learningObjective,
    currentKeyIdeas: current.lesson.keyIdeas,
    masteryLevel: roadmap.masteryLevel,
    depth: input.depth ?? roadmap.depth,
    learningPreferences: input.learningPreferences,
    previousLessonOutcomes,
    knownMisconceptions,
    upcomingLessons,
    prerequisiteLessons,
    sourceContext: input.sourceContext,
    sourceExcerpt,
    slidesPerLesson: input.slidesPerLesson ?? Math.max(6, current.lesson.estimatedMinutes + 2),
  };
}

export function buildStandaloneContext(input: {
  topic: string;
  goal?: string;
  masteryLevel: number;
  slideCount?: number;
  sourceText?: string;
  sourceTitle?: string;
  sourceUrl?: string;
  sourceContext?: SourceContext;
  depth?: string;
}): LessonGenerationContext {
  return {
    roadmapId: '',
    roadmapTitle: input.topic,
    roadmapGoal: input.goal ?? `Learn ${input.topic}`,
    unitTitle: 'Standalone',
    unitDescription: '',
    currentLessonTitle: input.topic,
    currentLearningObjective: input.goal ?? `Understand ${input.topic}`,
    currentKeyIdeas: [input.topic],
    masteryLevel: input.masteryLevel,
    depth: input.depth,
    previousLessonOutcomes: [],
    knownMisconceptions: [],
    upcomingLessons: [],
    prerequisiteLessons: [],
    sourceContext: input.sourceContext,
    sourceExcerpt: input.sourceText
      ? extractRelevantSourceExcerpt(input.sourceText, input.topic)
      : undefined,
    slidesPerLesson: input.slideCount ?? 8,
  };
}
