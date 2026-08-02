import type { AiGenerationProvider } from './provider';
import type { SourceContext } from './types';
import { buildStandaloneContext, buildLessonGenerationContext } from './continuity';
import { buildSourceContextFromText } from './sourceGrounding';
import { generateQualityLesson } from './lessonPipeline';
import { LESSON_GENERATION_PROMPT_VERSION } from './versions';

export interface GenerateLessonRequest {
  subjectId: string;
  subjectTitle?: string;
  topic: string;
  masteryLevel: number;
  slideCount?: number;
  depth?: string;
  sourceText?: string;
  sourceUrl?: string;
  sourceTitle?: string;
  sourceContext?: SourceContext;
  roadmapContext?: unknown;
  roadmapId?: string;
  roadmapNodeId?: string;
  idempotencyKey?: string;
}

export async function generateLessonDraft(
  provider: AiGenerationProvider,
  input: GenerateLessonRequest,
  db?: import('../db').Db,
) {
  const sourceContext =
    input.sourceContext ??
    (input.sourceText
      ? buildSourceContextFromText({
          title: input.sourceTitle,
          url: input.sourceUrl,
          text: input.sourceText,
        })
      : undefined);

  const ctx =
    db && input.roadmapId && input.roadmapNodeId
      ? buildLessonGenerationContext(db, {
          roadmapId: input.roadmapId,
          nodeId: input.roadmapNodeId,
          slidesPerLesson: input.slideCount,
          sourceText: input.sourceText,
          sourceContext,
          depth: input.depth,
        })
      : buildStandaloneContext({
          topic: input.topic,
          goal: input.subjectTitle,
          masteryLevel: input.masteryLevel,
          slideCount: input.slideCount,
          sourceText: input.sourceText,
          sourceTitle: input.sourceTitle,
          sourceUrl: input.sourceUrl,
          sourceContext,
          depth: input.depth,
        });

  const result = await generateQualityLesson(provider, {
    subjectId: input.subjectId,
    subjectTitle: input.subjectTitle,
    topic: input.topic,
    masteryLevel: input.masteryLevel,
    slideCount: input.slideCount,
    depth: input.depth,
    sourceText: input.sourceText,
    sourceTitle: input.sourceTitle,
    sourceUrl: input.sourceUrl,
    ctx,
    roadmapNodeId: input.roadmapNodeId,
  });

  return {
    title: result.draft.title,
    subtitle: result.draft.subtitle,
    minutes: result.draft.minutes,
    primaryObjective: result.draft.primaryObjective,
    conceptTags: result.draft.conceptTags,
    skillTags: result.draft.skillTags,
    prerequisiteConcepts: result.draft.prerequisiteConcepts,
    cards: result.draft.cards,
    blueprint: result.blueprint,
    generationMetadata: {
      ...(result.draft.generationMetadata ?? {}),
      provider: 'server',
      model: provider.model,
      promptVersion: LESSON_GENERATION_PROMPT_VERSION,
      qualityScore: result.quality.score,
      qualityRetried: result.retried,
    },
  };
}
