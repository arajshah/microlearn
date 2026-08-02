import { ApiError } from '../api/apiError';
import type { AiGenerationProvider } from './provider';
import type {
  CardRecord,
  GeneratedLessonDraft,
  LessonBlueprint,
  LessonGenerationContext,
  LessonGenerationMode,
} from './types';
import {
  buildMaterializationRepairPrompt,
  buildMaterializationSystemPrompt,
  buildMaterializationUserPrompt,
} from './prompts';
import { asNumber, asString, extractJsonObject } from './json';
import { assignCardIds, normalizeConceptSlug, repairLessonCards } from './cards';
import { validateMaterializedLesson } from './validation';
import { repairLessonDraft } from './quality';
import { LESSON_GENERATION_PROMPT_VERSION } from './versions';

function validateCard(raw: Record<string, unknown>): CardRecord | null {
  const type = asString(raw.type);
  const id = asString(raw.id) || undefined;
  if (!type) return null;

  if (type === 'hook') {
    const title = asString(raw.title);
    const body = asString(raw.body);
    if (!title || !body) return null;
    return { type, id, title, body };
  }
  if (type === 'recall') {
    const prompt = asString(raw.prompt);
    const body = asString(raw.body);
    if (!prompt || !body) return null;
    return { type, id, prompt, body };
  }
  if (type === 'explanation' || type === 'example') {
    const title = asString(raw.title);
    const body = asString(raw.body);
    if (!title || !body) return null;
    return { type, id, title, body };
  }
  if (type === 'quiz' || type === 'application' || type === 'prediction') {
    const question = asString(raw.question);
    const options = Array.isArray(raw.options)
      ? raw.options.map((o) => asString(o)).filter(Boolean)
      : [];
    const answerIndex = typeof raw.answerIndex === 'number' ? raw.answerIndex : -1;
    const explanation = asString(raw.explanation);
    if (!question || options.length < 2 || answerIndex < 0 || !explanation) return null;
    return { type, id, question, options, answerIndex, explanation };
  }
  if (type === 'truefalse') {
    const statement = asString(raw.statement);
    const explanation = asString(raw.explanation);
    if (!statement || !explanation) return null;
    return {
      type,
      id,
      statement,
      answer: Boolean(raw.answer),
      explanation,
    };
  }
  if (type === 'summary') {
    const points = Array.isArray(raw.points)
      ? raw.points.map((p) => asString(p)).filter(Boolean)
      : [];
    if (points.length === 0) return null;
    return { type, id, title: asString(raw.title) || 'Summary', points };
  }
  if (type === 'formula') {
    const title = asString(raw.title);
    const formula = asString(raw.formula);
    const plainEnglish = asString(raw.plainEnglish);
    if (!title || !formula || !plainEnglish) return null;
    return { type, id, title, formula, plainEnglish, body: asString(raw.body) || undefined };
  }
  if (type === 'worked_example') {
    const title = asString(raw.title);
    const problem = asString(raw.problem);
    const answer = asString(raw.answer);
    const steps = Array.isArray(raw.steps) ? raw.steps : [];
    if (!title || !problem || !answer || steps.length === 0) return null;
    return { type, id, title, problem, steps, answer, insight: asString(raw.insight) || undefined };
  }
  if (type === 'misconception_check' || type === 'misconception') {
    const question = asString(raw.question);
    const options = Array.isArray(raw.options)
      ? raw.options.map((o) => asString(o)).filter(Boolean)
      : [];
    const answerIndex = typeof raw.answerIndex === 'number' ? raw.answerIndex : -1;
    const explanation = asString(raw.explanation);
    if (!question || options.length < 2 || answerIndex < 0 || !explanation) return null;
    return {
      type: 'misconception_check',
      id,
      misconception: asString(raw.misconception) || question,
      question,
      options,
      answerIndex,
      explanation,
    };
  }
  if (type === 'visual_model') {
    const title = asString(raw.title);
    const visualDescription = asString(raw.visualDescription);
    const body = asString(raw.body);
    if (!title || !visualDescription || !body) return null;
    return {
      type,
      id,
      title,
      visualDescription,
      body,
      takeaway: asString(raw.takeaway) || undefined,
      diagram: raw.diagram,
    };
  }
  if (type === 'next_connection') {
    const body = asString(raw.body);
    if (!body) return null;
    return { type, id, body, nextTitle: asString(raw.nextTitle) || undefined };
  }
  if (type === 'compare_contrast') {
    const title = asString(raw.title);
    const leftLabel = asString(raw.leftLabel);
    const rightLabel = asString(raw.rightLabel);
    const points = Array.isArray(raw.points) ? raw.points : [];
    if (!title || !leftLabel || !rightLabel || points.length === 0) return null;
    return { type, id, title, leftLabel, rightLabel, points, takeaway: asString(raw.takeaway) || undefined };
  }
  if (type === 'derivation') {
    const title = asString(raw.title);
    const setup = asString(raw.setup);
    const conclusion = asString(raw.conclusion);
    const steps = Array.isArray(raw.steps) ? raw.steps : [];
    if (!title || !setup || !conclusion || steps.length === 0) return null;
    return { type, id, title, setup, steps, conclusion };
  }

  const title = asString(raw.title);
  const body = asString(raw.body);
  if (title && body) return { type, id, title, body };
  return null;
}

function parseLessonFromResponse(
  raw: string,
  blueprint: LessonBlueprint,
  ctx: LessonGenerationContext,
): { draft: GeneratedLessonDraft; errors: string[] } {
  const obj = extractJsonObject(raw);
  const rawCards = Array.isArray(obj.cards) ? obj.cards : [];
  const cards: CardRecord[] = [];
  for (const c of rawCards) {
    if (!c || typeof c !== 'object') continue;
    const card = validateCard(c as Record<string, unknown>);
    if (card) cards.push(card);
  }

  const withIds = assignCardIds(repairLessonCards(cards));
  const errors = validateMaterializedLesson(withIds, blueprint, ctx.slidesPerLesson);

  const conceptTags = Array.isArray(obj.conceptTags)
    ? obj.conceptTags.map((v) => normalizeConceptSlug(asString(v))).filter(Boolean)
    : (blueprint.conceptTags ?? []);

  const draft: GeneratedLessonDraft = repairLessonDraft(
    {
      title: asString(obj.title) || blueprint.title,
      subtitle: asString(obj.subtitle) || blueprint.primaryObjective,
      minutes: asNumber(obj.minutes, blueprint.estimatedMinutes),
      primaryObjective: asString(obj.primaryObjective) || blueprint.primaryObjective,
      conceptTags: [...new Set([...(blueprint.conceptTags ?? []), ...conceptTags])].slice(0, 12),
      skillTags: Array.isArray(obj.skillTags)
        ? obj.skillTags.map((s) => asString(s)).filter(Boolean)
        : (blueprint.skillTags ?? []),
      prerequisiteConcepts: Array.isArray(obj.prerequisiteConcepts)
        ? obj.prerequisiteConcepts.map((s) => normalizeConceptSlug(asString(s))).filter(Boolean)
        : (blueprint.prerequisiteConcepts ?? []),
      cards: withIds,
      generationMetadata: {
        promptVersion: LESSON_GENERATION_PROMPT_VERSION,
        model: 'server',
      },
    },
    blueprint,
  );

  return { draft, errors };
}

export async function generateLightLesson(
  provider: AiGenerationProvider,
  blueprint: LessonBlueprint,
  ctx: LessonGenerationContext,
  mode: LessonGenerationMode,
): Promise<GeneratedLessonDraft> {
  const systemPrompt = buildMaterializationSystemPrompt(ctx.slidesPerLesson);
  let raw = await provider.requestJson(
    systemPrompt,
    buildMaterializationUserPrompt(blueprint, ctx),
    ctx.slidesPerLesson && ctx.slidesPerLesson > 10 ? 8192 : 6144,
  );

  let result = parseLessonFromResponse(raw, blueprint, ctx);
  if (result.errors.length > 0) {
    raw = await provider.requestJson(
      systemPrompt,
      buildMaterializationRepairPrompt(blueprint, ctx, result.errors),
      6144,
    );
    result = parseLessonFromResponse(raw, blueprint, ctx);
    if (result.errors.length > 0 && result.draft.cards.length < 3) {
      throw new ApiError(
        502,
        `Could not build a valid lesson: ${result.errors.slice(0, 3).join('; ')}`,
        'LESSON_INVALID',
      );
    }
  }

  return {
    ...result.draft,
    generationMetadata: {
      ...result.draft.generationMetadata,
      mode,
      promptVersion: LESSON_GENERATION_PROMPT_VERSION,
    },
  };
}
