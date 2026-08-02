import { ApiError } from '../api/apiError';
import type { AiGenerationProvider } from './provider';
import type { GeneratedLessonDraft, LessonBlueprint, LessonGenerationContext } from './types';
import { inferLessonGenerationMode } from './strategy';
import { blueprintIsStale, generateLessonBlueprint } from './blueprintGenerator';
import { generateLightLesson } from './materialization';
import { generateHeavyLesson } from './heavyGeneration';
import { evaluateLessonQuality, materialValidationErrors, repairLessonDraft } from './quality';
import { buildFallbackBlueprint, buildFallbackCards } from './fallback';
import { LESSON_BLUEPRINT_PROMPT_VERSION, LESSON_GENERATION_PROMPT_VERSION, LESSON_QUALITY_VERSION } from './versions';

export interface GenerateQualityLessonInput {
  subjectId?: string;
  subjectTitle?: string;
  topic: string;
  masteryLevel: number;
  slideCount?: number;
  depth?: string;
  sourceText?: string;
  sourceTitle?: string;
  sourceUrl?: string;
  ctx: LessonGenerationContext;
  roadmapNodeId?: string;
  node?: {
    title: string;
    learningObjective: string;
    keyIdeas: string[];
    estimatedMinutes: number;
  };
  existingBlueprint?: LessonBlueprint | null;
}

export interface QualityLessonResult {
  draft: GeneratedLessonDraft;
  blueprint: LessonBlueprint;
  quality: ReturnType<typeof evaluateLessonQuality>;
  retried: boolean;
}

async function materializeFromBlueprint(
  provider: AiGenerationProvider,
  blueprint: LessonBlueprint,
  ctx: LessonGenerationContext,
): Promise<GeneratedLessonDraft> {
  const mode = inferLessonGenerationMode({
    slideCount: ctx.slidesPerLesson,
    masteryLevel: ctx.masteryLevel,
    depth: ctx.depth,
    topic: `${ctx.currentLessonTitle} ${ctx.roadmapTitle}`,
    subject: ctx.roadmapTitle,
    sourceText: ctx.sourceExcerpt,
  });

  if (mode === 'light') {
    return generateLightLesson(provider, blueprint, ctx, mode);
  }
  return generateHeavyLesson(provider, blueprint, ctx, mode);
}

export async function generateQualityLesson(
  provider: AiGenerationProvider,
  input: GenerateQualityLessonInput,
): Promise<QualityLessonResult> {
  const node = input.node ?? {
    title: input.topic,
    learningObjective: input.ctx.currentLearningObjective || `Understand ${input.topic}.`,
    keyIdeas: input.ctx.currentKeyIdeas.length ? input.ctx.currentKeyIdeas : [input.topic],
    estimatedMinutes: input.ctx.slidesPerLesson ?? 8,
  };
  const roadmapNodeId = input.roadmapNodeId ?? input.ctx.roadmapId ?? 'standalone';

  let blueprint =
    input.existingBlueprint && !blueprintIsStale(input.existingBlueprint, LESSON_BLUEPRINT_PROMPT_VERSION)
      ? input.existingBlueprint
      : await generateLessonBlueprint(provider, input.ctx, roadmapNodeId, node);

  let draft: GeneratedLessonDraft;
  try {
    draft = await materializeFromBlueprint(provider, blueprint, input.ctx);
  } catch {
    blueprint = buildFallbackBlueprint(input.ctx, { ...node, id: roadmapNodeId });
    draft = repairLessonDraft(
      {
        title: node.title,
        subtitle: blueprint.primaryObjective,
        minutes: node.estimatedMinutes,
        primaryObjective: blueprint.primaryObjective,
        conceptTags: blueprint.conceptTags ?? [],
        skillTags: blueprint.skillTags ?? [],
        cards: buildFallbackCards(input.ctx, node, blueprint),
        generationMetadata: {
          fallbackUsed: true,
          promptVersion: LESSON_GENERATION_PROMPT_VERSION,
        },
      },
      blueprint,
    );
  }

  let structuralErrors = materialValidationErrors(draft.cards, blueprint, input.ctx.slidesPerLesson);
  let quality = evaluateLessonQuality({ draft, blueprint, ctx: input.ctx, structuralErrors });
  let retried = false;

  if (!quality.accepted && quality.score < 55) {
    retried = true;
    try {
      const retryDraft = await materializeFromBlueprint(provider, blueprint, input.ctx);
      const retryErrors = materialValidationErrors(retryDraft.cards, blueprint, input.ctx.slidesPerLesson);
      const retryQuality = evaluateLessonQuality({
        draft: retryDraft,
        blueprint,
        ctx: input.ctx,
        structuralErrors: retryErrors,
      });
      if (retryQuality.score >= quality.score) {
        draft = retryDraft;
        structuralErrors = retryErrors;
        quality = retryQuality;
      }
    } catch {
      /* keep first result or fallback */
    }
  }

  if (!quality.accepted && draft.cards.length < 3) {
    throw new ApiError(
      502,
      `Lesson quality below threshold (${quality.score}/100): ${quality.issues.slice(0, 3).join('; ')}`,
      'LESSON_QUALITY_REJECTED',
    );
  }

  return {
    draft: {
      ...draft,
      generationMetadata: {
        ...(draft.generationMetadata ?? {}),
        qualityScore: quality.score,
        qualityVersion: LESSON_QUALITY_VERSION,
        qualityWarnings: quality.warnings,
        promptVersion: LESSON_GENERATION_PROMPT_VERSION,
        blueprintPromptVersion: LESSON_BLUEPRINT_PROMPT_VERSION,
      },
    },
    blueprint,
    quality,
    retried,
  };
}
