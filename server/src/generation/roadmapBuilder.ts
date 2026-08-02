import { randomUUID } from 'node:crypto';
import { ApiError } from '../api/apiError';
import type { RoadmapCreateInput } from '../api/validators';
import type { AiGenerationProvider } from './provider';
import { extractJsonObject, asNumber, asString, asStringArray } from './json';
import {
  ROADMAP_SYSTEM_PROMPT,
  buildRoadmapRepairPrompt,
  buildRoadmapUserPrompt,
} from './prompts';
import {
  type RoadmapLessonBuild,
  type RoadmapUnitBuild,
  validateRoadmapStructure,
} from './validation';
import { ROADMAP_PROMPT_VERSION } from './versions';
import type { SourceContext } from './types';

export interface GenerateRoadmapRequest {
  topic: string;
  goal: string;
  masteryLevel: number;
  depth: 'quick' | 'standard' | 'deep';
  lessonCount: number;
  slidesPerLesson: number;
  preferences?: string;
  sourceUrl?: string;
  sourceExtractionId?: string;
  sourceContext?: SourceContext | unknown;
  idempotencyKey?: string;
}

function normalizeRoadmapResponse(
  obj: Record<string, unknown>,
  input: GenerateRoadmapRequest,
): { draft: RoadmapCreateInput; errors: string[] } {
  const errors: string[] = [];
  const title = asString(obj.title);
  const description = asString(obj.description);
  if (!title) errors.push('Missing title');
  if (!description) errors.push('Missing description');

  const rawUnits = Array.isArray(obj.units) ? obj.units : [];
  if (rawUnits.length === 0) errors.push('No units');

  const units: RoadmapUnitBuild[] = [];
  let globalLessonIdx = 0;

  rawUnits.forEach((ru, ui) => {
    if (!ru || typeof ru !== 'object') return;
    const raw = ru as Record<string, unknown>;
    const unitTitle = asString(raw.title);
    const unitDesc = asString(raw.description);
    const unitOrder = asNumber(raw.order, ui + 1);
    if (!unitTitle) errors.push(`Unit ${ui + 1} missing title`);

    const unitId = asString(raw.id) || `unit-${ui + 1}`;
    const rawLessons = Array.isArray(raw.lessons) ? raw.lessons : [];
    if (rawLessons.length === 0) errors.push(`Unit "${unitTitle || ui + 1}" has no lessons`);

    const lessons: RoadmapLessonBuild[] = rawLessons.map((rl, li) => {
      globalLessonIdx += 1;
      const r = (rl ?? {}) as Record<string, unknown>;
      const modelId = asString(r.id);
      const lessonId = modelId || `l${globalLessonIdx}`;
      const mins = asNumber(r.estimatedMinutes, 5);
      const diff = asNumber(r.difficulty, input.masteryLevel);
      if (mins < 2 || mins > 12) {
        errors.push(`Lesson "${asString(r.title)}" minutes out of range (${mins})`);
      }
      return {
        id: lessonId,
        unitId,
        title: asString(r.title) || `Lesson ${globalLessonIdx}`,
        shortDescription: asString(r.shortDescription) || asString(r.title),
        learningObjective:
          asString(r.learningObjective) || asString(r.shortDescription) || 'Learn the core idea.',
        estimatedMinutes: Math.min(12, Math.max(3, mins)),
        difficulty: Math.min(5, Math.max(1, diff)),
        order: asNumber(r.order, li + 1),
        prerequisiteIds: asStringArray(r.prerequisiteIds),
        keyIdeas: asStringArray(r.keyIdeas).slice(0, 5),
        status: 'locked' as const,
        aliases: modelId && modelId !== lessonId ? [modelId, lessonId] : [lessonId],
      };
    });

    units.push({
      id: unitId,
      title: unitTitle || `Unit ${ui + 1}`,
      description: unitDesc || '',
      order: unitOrder,
      lessons,
    });
  });

  const flatRaw = units.flatMap((u) => u.lessons);
  const idMap = new Map<string, string>();
  flatRaw.forEach((l, i) => {
    const stable = `l${i + 1}`;
    idMap.set(l.id, stable);
    for (const alias of l.aliases) idMap.set(alias, stable);
  });

  const remappedUnits = units.map((unit) => ({
    id: unit.id,
    title: unit.title,
    description: unit.description,
    order: unit.order,
    lessons: unit.lessons.map((l) => {
      const globalIdx = flatRaw.findIndex((x) => x.id === l.id);
      const stableId = `l${globalIdx + 1}`;
      return {
        id: stableId,
        title: l.title,
        shortDescription: l.shortDescription,
        learningObjective: l.learningObjective,
        estimatedMinutes: l.estimatedMinutes,
        difficulty: l.difficulty,
        order: l.order,
        prerequisiteIds: l.prerequisiteIds
          .map((pid) => idMap.get(pid) ?? pid)
          .filter((pid) => pid !== stableId),
        keyIdeas: l.keyIdeas,
        status: stableId === 'l1' ? ('available' as const) : ('locked' as const),
      };
    }),
  }));

  const rebuiltUnits: RoadmapUnitBuild[] = remappedUnits.map((u) => ({
    ...u,
    lessons: u.lessons.map((l) => ({
      ...l,
      unitId: u.id,
      aliases: [l.id],
      status: l.status,
    })),
  }));

  errors.push(...validateRoadmapStructure(rebuiltUnits, { lessonCount: input.lessonCount }));

  const flatLessons = remappedUnits.flatMap((u) => u.lessons);
  const totalMinutes =
    Math.round(asNumber(obj.estimatedTotalMinutes, 0)) ||
    flatLessons.reduce((sum, l) => sum + l.estimatedMinutes, 0);

  return {
    draft: {
      id: randomUUID(),
      title: title || input.topic.trim(),
      topic: input.topic.trim(),
      goal: input.goal.trim(),
      description: description || input.goal.trim(),
      masteryLevel: input.masteryLevel,
      depth: input.depth,
      status: 'published',
      estimatedTotalMinutes: totalMinutes,
      units: remappedUnits,
    },
    errors,
  };
}

export async function generateRoadmapDraft(
  provider: AiGenerationProvider,
  input: GenerateRoadmapRequest,
): Promise<RoadmapCreateInput> {
  if (!input.topic.trim()) throw new ApiError(400, 'Topic is required.', 'INVALID_INPUT');
  if (!input.goal.trim()) throw new ApiError(400, 'Learning goal is required.', 'INVALID_INPUT');

  const maxTokens = input.depth === 'deep' ? 8192 : input.depth === 'standard' ? 6144 : 4096;
  const promptInput = {
    topic: input.topic,
    goal: input.goal,
    masteryLevel: input.masteryLevel,
    depth: input.depth,
    lessonCount: input.lessonCount,
    slidesPerLesson: input.slidesPerLesson,
    preferences: input.preferences,
    sourceContext: input.sourceContext,
  };

  let raw = await provider.requestJson(
    ROADMAP_SYSTEM_PROMPT,
    buildRoadmapUserPrompt(promptInput),
    maxTokens,
  );
  let result = normalizeRoadmapResponse(extractJsonObject(raw), input);

  if (result.errors.length > 0) {
    raw = await provider.requestJson(
      ROADMAP_SYSTEM_PROMPT,
      buildRoadmapRepairPrompt(promptInput, result.errors),
      maxTokens,
    );
    result = normalizeRoadmapResponse(extractJsonObject(raw), input);
    if (result.errors.length > 0) {
      throw new ApiError(
        502,
        `Could not build a valid roadmap: ${result.errors.slice(0, 3).join('; ')}`,
        'ROADMAP_INVALID',
      );
    }
  }

  return {
    ...result.draft,
    preferences: input.preferences,
    sourceUrl: input.sourceUrl,
    sourceExtractionId: input.sourceExtractionId,
    sourceContext: input.sourceContext,
    targetLessonCount: input.lessonCount,
    slidesPerLesson: input.slidesPerLesson,
    promptVersion: ROADMAP_PROMPT_VERSION,
  } as RoadmapCreateInput;
}
