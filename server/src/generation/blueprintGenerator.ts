import { randomUUID } from 'node:crypto';
import { ApiError } from '../api/apiError';
import type { AiGenerationProvider } from './provider';
import type { LessonBlueprint, LessonGenerationContext } from './types';
import {
  BLUEPRINT_SYSTEM_PROMPT,
  buildBlueprintRepairPrompt,
  buildBlueprintUserPrompt,
} from './prompts';
import { extractJsonObject } from './json';
import {
  parseBlueprintObject,
  validateBlueprint,
} from './validation';
import { buildFallbackBlueprint } from './fallback';
import { LESSON_BLUEPRINT_PROMPT_VERSION } from './versions';

export async function generateLessonBlueprint(
  provider: AiGenerationProvider,
  ctx: LessonGenerationContext,
  roadmapNodeId: string,
  node: {
    title: string;
    learningObjective: string;
    keyIdeas: string[];
    estimatedMinutes: number;
  },
): Promise<LessonBlueprint> {
  try {
    const raw = await provider.requestJson(
      BLUEPRINT_SYSTEM_PROMPT,
      buildBlueprintUserPrompt(ctx),
      4096,
    );
    let result = parseBlueprintObject(extractJsonObject(raw), {
      roadmapId: ctx.roadmapId,
      roadmapNodeId,
      expectedObjective: ctx.currentLearningObjective,
      expectedTitle: ctx.currentLessonTitle,
    });

    if (result.errors.length > 0) {
      const repaired = await provider.requestJson(
        BLUEPRINT_SYSTEM_PROMPT,
        buildBlueprintRepairPrompt(ctx, result.errors),
        4096,
      );
      result = parseBlueprintObject(extractJsonObject(repaired), {
        roadmapId: ctx.roadmapId,
        roadmapNodeId,
        expectedObjective: ctx.currentLearningObjective,
        expectedTitle: ctx.currentLessonTitle,
      });
      if (result.errors.length > 0) {
        throw new ApiError(
          502,
          `Could not build a valid blueprint: ${result.errors.slice(0, 3).join('; ')}`,
          'BLUEPRINT_INVALID',
        );
      }
    }

    const validationErrors = validateBlueprint(result.blueprint, ctx.currentLearningObjective);
    if (validationErrors.length > 0) {
      throw new ApiError(
        502,
        `Blueprint validation failed: ${validationErrors.slice(0, 3).join('; ')}`,
        'BLUEPRINT_INVALID',
      );
    }

    return {
      ...result.blueprint,
      id: randomUUID(),
      promptVersion: LESSON_BLUEPRINT_PROMPT_VERSION,
    };
  } catch (err) {
    if (err instanceof ApiError && err.code === 'BLUEPRINT_INVALID') throw err;
    const fallback = buildFallbackBlueprint(ctx, {
      id: roadmapNodeId,
      title: node.title,
      learningObjective: node.learningObjective,
      keyIdeas: node.keyIdeas,
      estimatedMinutes: node.estimatedMinutes,
    });
    return {
      ...fallback,
      id: randomUUID(),
      promptVersion: LESSON_BLUEPRINT_PROMPT_VERSION,
    };
  }
}

export function blueprintIsStale(blueprint: LessonBlueprint | null, promptVersion: string): boolean {
  if (!blueprint) return true;
  return blueprint.promptVersion !== promptVersion || blueprint.version < 2;
}
