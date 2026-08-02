import type { AiGenerationProvider } from './provider';
import type {
  CardRecord,
  GeneratedLessonDraft,
  HeavyLessonChunk,
  HeavyLessonPlan,
  HeavyLessonPlanSlide,
  LessonBlueprint,
  LessonGenerationContext,
  LessonGenerationMode,
} from './types';
import { extractJsonValue } from './json';
import { asString } from './json';
import { assignCardIds, repairLessonCards, SUPPORTED_CARD_TYPES } from './cards';
import { isMathHeavy } from './strategy';
import { buildFallbackCardsForPlanChunk } from './fallback';
import { repairLessonDraft } from './quality';
import { LESSON_GENERATION_PROMPT_VERSION } from './versions';

const SUPPORTED_TYPES = SUPPORTED_CARD_TYPES.join(', ');
const CHUNK_ATTEMPTS = 2;

function defaultTypeSequence(slideCount: number, mathish: boolean): string[] {
  const base = [
    'hook',
    'recall',
    'visual_model',
    mathish ? 'formula' : 'explanation',
    mathish ? 'derivation' : 'worked_example',
    'explanation',
    'worked_example',
    'misconception_check',
    'application',
    'compare_contrast',
    'summary',
    'next_connection',
  ];
  if (slideCount <= base.length) return base.slice(0, slideCount);
  const extras = Array.from({ length: slideCount - base.length }, (_, i) =>
    i % 2 === 0 ? 'worked_example' : 'application',
  );
  return [...base.slice(0, -2), ...extras, ...base.slice(-2)];
}

export function buildDefaultLessonPlan(
  blueprint: LessonBlueprint,
  ctx: LessonGenerationContext,
): HeavyLessonPlan {
  const slideCount = Math.max(3, Math.min(20, ctx.slidesPerLesson ?? 12));
  const mathish = isMathHeavy('', `${ctx.currentLessonTitle} ${ctx.roadmapTitle}`);
  const types = defaultTypeSequence(slideCount, mathish);
  const keyIdeas = blueprint.keyIdeas.length > 0 ? blueprint.keyIdeas : ctx.currentKeyIdeas;

  return {
    title: blueprint.title || ctx.currentLessonTitle,
    subtitle: blueprint.primaryObjective,
    primaryObjective: blueprint.primaryObjective,
    coreMentalModel: blueprint.coreMentalModel ?? `Understand ${ctx.currentLessonTitle} as a reusable mental move.`,
    slideCount,
    slides: types.map((requiredType, i) => ({
      index: i + 1,
      id: `c${i + 1}`,
      requiredType,
      title:
        i === 0
          ? ctx.currentLessonTitle
          : keyIdeas[i % Math.max(1, keyIdeas.length)] ?? `${ctx.currentLessonTitle} ${i + 1}`,
      purpose: `Teach slide ${i + 1} of ${ctx.currentLessonTitle}.`,
      keyIdea: keyIdeas[i % Math.max(1, keyIdeas.length)] ?? blueprint.primaryObjective,
    })),
    globalRequirements: {
      notation: blueprint.notation,
      formulas: blueprint.formalDefinition ? [blueprint.formalDefinition] : undefined,
      misconceptions: blueprint.misconceptionTargets,
      workedExampleTargets: blueprint.workedExamplePlan ? [blueprint.workedExamplePlan] : blueprint.examplePlan,
      visualModels: blueprint.visualModel ? [blueprint.visualModel] : undefined,
    },
  };
}

function normalizePlan(raw: unknown, fallback: HeavyLessonPlan): HeavyLessonPlan {
  if (!raw || typeof raw !== 'object') return fallback;
  const obj = raw as Record<string, unknown>;
  const slidesRaw = Array.isArray(obj.slides) ? obj.slides : [];
  const slides = slidesRaw
    .map((slide, i): HeavyLessonPlanSlide | null => {
      if (!slide || typeof slide !== 'object') return null;
      const s = slide as Record<string, unknown>;
      const requiredType = asString(s.requiredType) || fallback.slides[i]?.requiredType || 'explanation';
      if (!SUPPORTED_CARD_TYPES.includes(requiredType as never)) return null;
      return {
        index: typeof s.index === 'number' ? s.index : i + 1,
        id: asString(s.id) || `c${i + 1}`,
        requiredType,
        title: asString(s.title) || fallback.slides[i]?.title || `Slide ${i + 1}`,
        purpose: asString(s.purpose) || fallback.slides[i]?.purpose || '',
        keyIdea: asString(s.keyIdea) || fallback.slides[i]?.keyIdea || fallback.primaryObjective,
      };
    })
    .filter((slide): slide is HeavyLessonPlanSlide => Boolean(slide))
    .sort((a, b) => a.index - b.index);

  if (slides.length < 3) return fallback;

  return {
    title: asString(obj.title) || fallback.title,
    subtitle: asString(obj.subtitle) || fallback.subtitle,
    primaryObjective: asString(obj.primaryObjective) || fallback.primaryObjective,
    coreMentalModel: asString(obj.coreMentalModel) || fallback.coreMentalModel,
    slideCount: typeof obj.slideCount === 'number' ? obj.slideCount : slides.length,
    slides,
    globalRequirements: fallback.globalRequirements,
  };
}

function planPrompt(
  blueprint: LessonBlueprint,
  ctx: LessonGenerationContext,
  mode: LessonGenerationMode,
): { system: string; user: string; maxTokens: number } {
  const target = ctx.slidesPerLesson ?? 12;
  return {
    maxTokens: 2048,
    system: `Plan one ${mode} microlearning lesson. Return valid JSON only. Do not write full card bodies.
Supported card types only: ${SUPPORTED_TYPES}.`,
    user: `Create a compact lesson plan.
Topic: ${ctx.currentLessonTitle}
Roadmap: ${ctx.roadmapTitle}
Goal: ${ctx.roadmapGoal}
Mastery: ${ctx.masteryLevel}/5
Target slides: ${target}
Objective: ${blueprint.primaryObjective}
Key ideas: ${blueprint.keyIdeas.join('; ')}
Misconceptions: ${(blueprint.misconceptionTargets ?? blueprint.misconceptionChecks.map((m) => m.misconception)).join('; ') || 'none'}
For technical topics include formula, derivation, worked_example, and misconception_check slides.

Return JSON:
{ "title": string, "subtitle": string, "primaryObjective": string, "coreMentalModel": string, "slideCount": number, "slides": [{ "index": number, "id": string, "requiredType": string, "title": string, "purpose": string, "keyIdea": string }] }`,
  };
}

export async function generateLessonPlan(
  provider: AiGenerationProvider,
  blueprint: LessonBlueprint,
  ctx: LessonGenerationContext,
  mode: LessonGenerationMode,
): Promise<HeavyLessonPlan> {
  const fallback = buildDefaultLessonPlan(blueprint, ctx);
  try {
    const prompt = planPrompt(blueprint, ctx, mode);
    const raw = await provider.requestJson(prompt.system, prompt.user, prompt.maxTokens);
    return { ...normalizePlan(extractJsonValue(raw), fallback), planningFallbackUsed: false };
  } catch {
    return { ...fallback, planningFallbackUsed: true };
  }
}

export function createLessonChunks(plan: HeavyLessonPlan): HeavyLessonChunk[] {
  const slides = [...plan.slides].sort((a, b) => a.index - b.index);
  const chunkSize = plan.slideCount <= 10 ? Math.ceil(slides.length / 2) : 3;
  const chunks: HeavyLessonChunk[] = [];
  for (let i = 0; i < slides.length; i += chunkSize) {
    chunks.push({ index: chunks.length, slides: slides.slice(i, i + chunkSize) });
  }
  return chunks;
}

function chunkPrompt(
  plan: HeavyLessonPlan,
  chunk: HeavyLessonChunk,
  ctx: LessonGenerationContext,
  mode: LessonGenerationMode,
  previousSummaries: string[],
  retry: boolean,
): { system: string; user: string; maxTokens: number } {
  return {
    maxTokens: retry ? 2048 : mode === 'expert' ? 3072 : 2560,
    system: `Generate only the requested slide cards for a ${mode} lesson. Output a JSON array of cards only.
Supported types: ${SUPPORTED_TYPES}.
Technical lessons need precise notation, worked examples, and valid graded cards with answerIndex and explanation.`,
    user: `Lesson: ${plan.title}
Objective: ${plan.primaryObjective}
Mastery: ${ctx.masteryLevel}/5
Previous chunk summaries: ${previousSummaries.join('\n') || '(none)'}

Generate only these slides:
${JSON.stringify(chunk.slides)}

Return JSON array only. Preserve slide ids, order, and requiredType.
${retry ? 'Keep language simpler and shorter on this retry.' : ''}`,
  };
}

function parseChunkCards(raw: string, targetCount: number): CardRecord[] {
  const parsed = extractJsonValue(raw);
  const rawCards = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { cards?: unknown[] }).cards)
      ? (parsed as { cards: unknown[] }).cards
      : [];
  return assignCardIds(repairLessonCards(rawCards)).slice(0, targetCount);
}

async function generateLessonChunk(
  provider: AiGenerationProvider,
  plan: HeavyLessonPlan,
  chunk: HeavyLessonChunk,
  ctx: LessonGenerationContext,
  mode: LessonGenerationMode,
  previousSummaries: string[],
): Promise<{ cards: CardRecord[]; fallbackUsed: boolean }> {
  for (let attempt = 1; attempt <= CHUNK_ATTEMPTS; attempt += 1) {
    try {
      const prompt = chunkPrompt(plan, chunk, ctx, mode, previousSummaries, attempt > 1);
      const raw = await provider.requestRaw(prompt.system, prompt.user, prompt.maxTokens);
      const cards = parseChunkCards(raw, chunk.slides.length);
      if (cards.length === chunk.slides.length) return { cards, fallbackUsed: false };
      if (cards.length > 0) return { cards: cards.slice(0, chunk.slides.length), fallbackUsed: false };
    } catch {
      /* retry */
    }
  }
  return {
    cards: buildFallbackCardsForPlanChunk(ctx, plan, chunk),
    fallbackUsed: true,
  };
}

async function generateChunksWithConcurrency(
  provider: AiGenerationProvider,
  plan: HeavyLessonPlan,
  chunks: HeavyLessonChunk[],
  ctx: LessonGenerationContext,
  mode: LessonGenerationMode,
  concurrency: number,
): Promise<{ chunkCards: CardRecord[][]; chunkFallbackIndexes: number[] }> {
  const results: CardRecord[][] = Array.from({ length: chunks.length }, () => []);
  const fallbackIndexes: number[] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < chunks.length) {
      const index = cursor++;
      const previousSummaries = chunks
        .slice(0, index)
        .map((chunk) => chunk.slides.map((s) => s.title).join(', '))
        .filter(Boolean);
      const result = await generateLessonChunk(
        provider,
        plan,
        chunks[index],
        ctx,
        mode,
        previousSummaries,
      );
      results[index] = result.cards;
      if (result.fallbackUsed) fallbackIndexes.push(index + 1);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  return { chunkCards: results, chunkFallbackIndexes: fallbackIndexes.sort((a, b) => a - b) };
}

export function assembleHeavyLesson(
  blueprint: LessonBlueprint,
  _ctx: LessonGenerationContext,
  plan: HeavyLessonPlan,
  chunkCards: CardRecord[][],
  metadata: Record<string, unknown> = {},
): GeneratedLessonDraft {
  const cards = assignCardIds(chunkCards.flat()).slice(0, plan.slideCount);
  const draft = repairLessonDraft(
    {
      title: plan.title || blueprint.title,
      subtitle: plan.subtitle || blueprint.primaryObjective,
      minutes: Math.min(12, Math.max(4, Math.ceil(cards.length * 0.75))),
      primaryObjective: plan.primaryObjective || blueprint.primaryObjective,
      conceptTags: [...new Set([...(blueprint.conceptTags ?? []), ...cards.flatMap((c) => (Array.isArray(c.conceptTags) ? c.conceptTags : []))])].slice(0, 12),
      skillTags: blueprint.skillTags ?? [],
      prerequisiteConcepts: blueprint.prerequisiteConcepts ?? [],
      cards,
      generationMetadata: {
        ...metadata,
        promptVersion: LESSON_GENERATION_PROMPT_VERSION,
      },
    },
    blueprint,
  );
  if (draft.cards.length < 3) {
    throw new Error('Could not assemble enough valid lesson slides.');
  }
  return draft;
}

export async function generateHeavyLesson(
  provider: AiGenerationProvider,
  blueprint: LessonBlueprint,
  ctx: LessonGenerationContext,
  mode: LessonGenerationMode,
): Promise<GeneratedLessonDraft> {
  const plan = await generateLessonPlan(provider, blueprint, ctx, mode);
  const chunks = createLessonChunks(plan);
  const concurrency = mode === 'rich' ? 2 : mode === 'expert' ? 2 : 3;
  const { chunkCards, chunkFallbackIndexes } = await generateChunksWithConcurrency(
    provider,
    plan,
    chunks,
    ctx,
    mode,
    concurrency,
  );
  return assembleHeavyLesson(blueprint, ctx, plan, chunkCards, {
    mode,
    planningFallbackUsed: Boolean(plan.planningFallbackUsed),
    chunkFallbackIndexes,
  });
}
