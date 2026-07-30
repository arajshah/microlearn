import { generateLessonBlueprint } from '@/ai/lessonBlueprint';
import { generateLessonFromBlueprint } from '@/ai/lessonMaterialization';
import { AiError } from '@/ai/client';
import { GeneratedLessonDraft } from '@/ai/client';
import {
  getLessonBlueprint,
  saveLessonBlueprint,
} from '@/storage/lessonBlueprintStorage';
import { saveGeneratedLessonVersion } from '@/storage/lessonVersionStorage';
import { BLUEPRINT_VERSION, LessonBlueprint } from '@/types/lessonBlueprint';
import { LESSON_PROMPT_VERSION } from '@/types/lessonBlueprint';
import { LessonGenerationContext } from '@/types/lessonGeneration';
import { AiConfig, GeneratedLesson, SubjectId } from '@/types/content';
import { GeneratedRoadmap, RoadmapLessonNode } from '@/types/roadmap';
import { buildFallbackBlueprint, buildFallbackCards } from '@/utils/roadmapLessonFallback';
import { repairAndValidateLesson } from '@/utils/contentQuality';

function makeLessonId(): string {
  return `gen-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface RoadmapLessonDraft extends GeneratedLessonDraft {
  primaryObjective: string;
  blueprintId: string;
  blueprintVersion: number;
}

export async function ensureLessonBlueprint(
  config: AiConfig,
  ctx: LessonGenerationContext,
  nodeId: string,
  node?: RoadmapLessonNode,
): Promise<LessonBlueprint> {
  const cached = await getLessonBlueprint(ctx.roadmapId, nodeId);
  if (
    cached &&
    cached.version === BLUEPRINT_VERSION &&
    (!node?.blueprintId || node.blueprintId === cached.id)
  ) {
    return cached;
  }

  const blueprint = await generateLessonBlueprint(config, ctx, nodeId);
  await saveLessonBlueprint(blueprint);
  return blueprint;
}

export async function generateRoadmapLesson(
  config: AiConfig,
  ctx: LessonGenerationContext,
  node: RoadmapLessonNode,
  subjectId: SubjectId,
): Promise<RoadmapLessonDraft> {
  try {
    const blueprint = await ensureLessonBlueprint(config, ctx, node.id, node);
    const draft = await generateLessonFromBlueprint(config, blueprint, ctx);
    return {
      ...draft,
      blueprintId: blueprint.id,
      blueprintVersion: blueprint.version,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown error';
    console.warn('[ai] using fallback roadmap lesson', ctx.roadmapId, node.id, message);
    const blueprint = buildFallbackBlueprint(ctx, node);
    await saveLessonBlueprint(blueprint).catch(() => {});
    return {
      title: node.title,
      subtitle: node.shortDescription || blueprint.primaryObjective,
      minutes: blueprint.estimatedMinutes,
      cards: buildFallbackCards(ctx, node, blueprint),
      primaryObjective: blueprint.primaryObjective,
      blueprintId: blueprint.id,
      blueprintVersion: blueprint.version,
    };
  }
}

export function draftToGeneratedLesson(
  draft: RoadmapLessonDraft,
  args: {
    subjectId: SubjectId;
    topic: string;
    roadmapId: string;
    roadmapNodeId: string;
    model?: string;
    existingId?: string;
    slidesPerLesson?: number;
    isFinalLesson?: boolean;
  },
): GeneratedLesson {
  const base: GeneratedLesson = {
    id: args.existingId ?? makeLessonId(),
    title: draft.title,
    subtitle: draft.subtitle,
    minutes: draft.minutes,
    cards: draft.cards,
    subjectId: args.subjectId,
    topic: args.topic,
    createdAt: new Date().toISOString(),
    generated: true,
    roadmapId: args.roadmapId,
    roadmapNodeId: args.roadmapNodeId,
    primaryObjective: draft.primaryObjective,
    blueprintId: draft.blueprintId,
    blueprintVersion: draft.blueprintVersion,
    promptVersion: LESSON_PROMPT_VERSION,
    model: args.model,
    generationMetadata: draft.generationMetadata,
    conceptTags: draft.conceptTags,
    skillTags: draft.skillTags,
    prerequisiteConcepts: draft.prerequisiteConcepts,
  };

  const { lesson } = repairAndValidateLesson(base, {
    targetSlideCount: args.slidesPerLesson,
    topic: args.topic,
    isDeepLesson: (args.slidesPerLesson ?? draft.cards.length) >= 10,
    isFinalLesson: args.isFinalLesson,
  });

  return lesson;
}

export async function persistRoadmapLessonArtifacts(
  lesson: GeneratedLesson,
  blueprint: LessonBlueprint,
): Promise<void> {
  await saveGeneratedLessonVersion({
    lessonId: lesson.id,
    roadmapId: lesson.roadmapId!,
    roadmapNodeId: lesson.roadmapNodeId!,
    blueprintId: blueprint.id,
    blueprintVersion: blueprint.version,
    promptVersion: LESSON_PROMPT_VERSION,
    model: lesson.model,
    generatedAt: lesson.createdAt,
  });
}

export async function prepareNextLessonBlueprint(
  config: AiConfig,
  roadmap: GeneratedRoadmap,
  afterNodeId: string,
  buildContext: (
    roadmap: GeneratedRoadmap,
    nodeId: string,
  ) => Promise<LessonGenerationContext | undefined>,
): Promise<void> {
  const { allRoadmapLessons } = await import('@/utils/roadmapProgress');
  const flat = allRoadmapLessons(roadmap);
  const idx = flat.findIndex((l) => l.id === afterNodeId);
  if (idx === -1) return;
  const next = flat.slice(idx + 1).find((l) => !l.generatedLessonId && l.status !== 'locked');
  if (!next) return;

  const existing = await getLessonBlueprint(roadmap.id, next.id);
  if (existing && existing.version === BLUEPRINT_VERSION) return;

  const ctx = await buildContext(roadmap, next.id);
  if (!ctx) return;

  try {
    await ensureLessonBlueprint(config, ctx, next.id, next);
  } catch {
    // Silent - blueprint pre-generation must not block the learner.
  }
}

export async function prepareNextLessonFull(
  config: AiConfig,
  roadmap: GeneratedRoadmap,
  afterNodeId: string,
  buildContext: (
    roadmap: GeneratedRoadmap,
    nodeId: string,
  ) => Promise<LessonGenerationContext | undefined>,
  saveLesson: (lesson: GeneratedLesson) => Promise<void>,
  subjectId: SubjectId,
): Promise<GeneratedLesson | undefined> {
  const { allRoadmapLessons } = await import('@/utils/roadmapProgress');
  const flat = allRoadmapLessons(roadmap);
  const idx = flat.findIndex((l) => l.id === afterNodeId);
  if (idx === -1) return undefined;
  const next = flat.slice(idx + 1).find((l) => !l.generatedLessonId && l.status !== 'locked');
  if (!next) return undefined;

  const ctx = await buildContext(roadmap, next.id);
  if (!ctx) return undefined;

  try {
    const draft = await generateRoadmapLesson(config, ctx, next, subjectId);
    const blueprint = await getLessonBlueprint(roadmap.id, next.id);
    if (!blueprint) throw new AiError('Blueprint missing after generation.');

    const lesson = draftToGeneratedLesson(draft, {
      subjectId,
      topic: next.title,
      roadmapId: roadmap.id,
      roadmapNodeId: next.id,
      model: config.model,
    });
    await saveLesson(lesson);
    await persistRoadmapLessonArtifacts(lesson, blueprint);
    return lesson;
  } catch {
    return undefined;
  }
}
