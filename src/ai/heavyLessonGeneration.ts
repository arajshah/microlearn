import { isGemmaGoogleProvider, requestJsonCompletion } from '@/ai/jsonCompletion';
import { LessonGenerationMode, isMathHeavy } from '@/ai/lessonGenerationStrategy';
import { assignCardIds } from '@/ai/lessonValidation';
import { LessonBlueprint } from '@/types/lessonBlueprint';
import { LessonGenerationContext } from '@/types/lessonGeneration';
import { AiConfig, GeneratedLesson, LessonCard, LessonGenerationMetadata } from '@/types/content';
import { repairLessonCards, SUPPORTED_CARD_TYPES } from '@/utils/contentEngineV2';
import { repairAndValidateLesson } from '@/utils/contentQuality';
import { buildFallbackCardsForPlanChunk } from '@/utils/roadmapLessonFallback';

const SUPPORTED_TYPES = SUPPORTED_CARD_TYPES.join(', ');
const CHUNK_ATTEMPTS = 2;

export interface HeavyLessonPlanSlide {
  index: number;
  id: string;
  requiredType: string;
  title: string;
  purpose: string;
  keyIdea: string;
  mustInclude?: string[];
  dependsOn?: string[];
}

export interface HeavyLessonPlan {
  title: string;
  subtitle: string;
  primaryObjective: string;
  coreMentalModel: string;
  slideCount: number;
  slides: HeavyLessonPlanSlide[];
  globalRequirements?: {
    notation?: unknown[];
    formulas?: string[];
    misconceptions?: string[];
    workedExampleTargets?: string[];
    visualModels?: string[];
  };
  planningFallbackUsed?: boolean;
}

export interface HeavyLessonChunk {
  index: number;
  slides: HeavyLessonPlanSlide[];
}

export interface HeavyLessonDraft {
  title: string;
  subtitle: string;
  minutes: number;
  cards: LessonCard[];
  primaryObjective: string;
  generationMetadata?: LessonGenerationMetadata;
  conceptTags?: string[];
  skillTags?: string[];
  prerequisiteConcepts?: string[];
}

interface ChunkGenerationResult {
  cards: LessonCard[];
  fallbackUsed: boolean;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function jsonSnippet(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function extractJsonValue(raw: string): unknown {
  const cleaned = raw
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  const firstObj = cleaned.indexOf('{');
  const firstArr = cleaned.indexOf('[');
  const start =
    firstArr >= 0 && (firstObj < 0 || firstArr < firstObj) ? firstArr : firstObj;
  if (start < 0) throw new Error('The model did not return JSON.');

  let depth = 0;
  let inString = false;
  let escaped = false;
  const open = cleaned[start];
  const close = open === '[' ? ']' : '}';
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(cleaned.slice(start, i + 1).replace(/,(\s*[}\]])/g, '$1'));
      }
    }
  }
  throw new Error('The model returned incomplete JSON.');
}

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
  const mathish = isMathHeavy('mathematics', `${ctx.currentLessonTitle} ${ctx.roadmapTitle}`);
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
      mustInclude: i === 0 ? [blueprint.primaryObjective] : undefined,
      dependsOn: i > 1 ? [`c${i}`] : undefined,
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
      const requiredType = asString(s.requiredType, fallback.slides[i]?.requiredType ?? 'explanation');
      if (!SUPPORTED_CARD_TYPES.includes(requiredType as never)) return null;
      return {
        index: typeof s.index === 'number' ? s.index : i + 1,
        id: asString(s.id, `c${i + 1}`),
        requiredType,
        title: asString(s.title, fallback.slides[i]?.title ?? `Slide ${i + 1}`),
        purpose: asString(s.purpose, fallback.slides[i]?.purpose ?? ''),
        keyIdea: asString(s.keyIdea, fallback.slides[i]?.keyIdea ?? fallback.primaryObjective),
        mustInclude: Array.isArray(s.mustInclude) ? s.mustInclude.filter((v): v is string => typeof v === 'string') : undefined,
        dependsOn: Array.isArray(s.dependsOn) ? s.dependsOn.filter((v): v is string => typeof v === 'string') : undefined,
      };
    })
    .filter((slide): slide is HeavyLessonPlanSlide => Boolean(slide))
    .sort((a, b) => a.index - b.index);

  if (slides.length < 3) return fallback;

  return {
    title: asString(obj.title, fallback.title),
    subtitle: asString(obj.subtitle, fallback.subtitle),
    primaryObjective: asString(obj.primaryObjective, fallback.primaryObjective),
    coreMentalModel: asString(obj.coreMentalModel, fallback.coreMentalModel),
    slideCount: typeof obj.slideCount === 'number' ? obj.slideCount : slides.length,
    slides,
    globalRequirements:
      obj.globalRequirements && typeof obj.globalRequirements === 'object'
        ? (obj.globalRequirements as HeavyLessonPlan['globalRequirements'])
        : fallback.globalRequirements,
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
Core mental model: ${blueprint.coreMentalModel ?? 'infer'}
Key ideas: ${blueprint.keyIdeas.join('; ')}
Misconceptions: ${(blueprint.misconceptionTargets ?? blueprint.misconceptionChecks.map((m) => m.misconception)).join('; ') || 'none'}
Worked example plan: ${blueprint.workedExamplePlan ?? blueprint.examplePlan.join('; ')}
Use this 12-slide pattern when target is 12: hook, recall/explanation, visual_model, formula/explanation, derivation/worked_example, explanation, worked_example/application, misconception_check, application/quiz, compare_contrast/explanation, summary, next_connection.

Return JSON shape:
{ "title": string, "subtitle": string, "primaryObjective": string, "coreMentalModel": string, "slideCount": number, "slides": [{ "index": number, "id": string, "requiredType": string, "title": string, "purpose": string, "keyIdea": string, "mustInclude"?: string[], "dependsOn"?: string[] }], "globalRequirements": { "notation"?: [], "formulas"?: string[], "misconceptions"?: string[], "workedExampleTargets"?: string[], "visualModels"?: string[] } }`,
  };
}

export async function generateLessonPlan(
  config: AiConfig,
  blueprint: LessonBlueprint,
  ctx: LessonGenerationContext,
  mode: LessonGenerationMode,
): Promise<HeavyLessonPlan> {
  const fallback = buildDefaultLessonPlan(blueprint, ctx);
  console.log('[lesson-gen] planning start');
  try {
    const prompt = planPrompt(blueprint, ctx, mode);
    const raw = await requestJsonCompletion(config, prompt.system, prompt.user, prompt.maxTokens, {
      jsonMode: !isGemmaGoogleProvider(config),
      retryWithoutJsonMode: true,
      generationMode: mode,
      maxAttempts: 2,
    });
    const plan = normalizePlan(extractJsonValue(raw), fallback);
    console.log('[lesson-gen] planning done');
    return { ...plan, planningFallbackUsed: false };
  } catch (err) {
    console.warn('[lesson-gen] planning fallback used');
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

function cardTypeSchemas(): string {
  return `formula {type,id,title,formula,plainEnglish,notation?,body?}; derivation {type,id,title,setup,steps[{label?,expression?,explanation}],conclusion}; worked_example {type,id,title,problem,steps[{label?,work?,explanation}],answer,insight}; misconception_check {type,id,misconception,question,options,answerIndex,explanation}; compare_contrast {type,id,title,leftLabel,rightLabel,points[{left,right}],takeaway}; visual_model {type,id,title,visualDescription,body,takeaway,diagram?{kind,nodes?,edges?,leftTitle?,leftItems?,rightTitle?,rightItems?,steps?,ascii?}}; also supported: hook, recall, explanation, example, quiz, application, summary, next_connection. Use diagram field with nodes/edges or split/timeline data — not prose descriptions. EVERY card must also include conceptTags (1-3 lowercase-hyphenated slugs) and cognitiveLevel (recall|understand|apply|analyze|synthesize); graded cards should add estimatedDifficulty 1-5 and optional weaknessTags. Reuse identical concept slugs across cards teaching the same idea.`;
}

function chunkPrompt(
  plan: HeavyLessonPlan,
  chunk: HeavyLessonChunk,
  ctx: LessonGenerationContext,
  mode: LessonGenerationMode,
  previousSummaries: string[],
  retry: boolean,
): { system: string; user: string; maxTokens: number; jsonMode: boolean } {
  const gemmaSafeMax = mode === 'expert' ? 3072 : 2560;
  return {
    maxTokens: retry ? 2048 : gemmaSafeMax,
    jsonMode: false,
    system: `Generate only the requested slide cards for a ${mode} lesson. Output a JSON array of cards only. Use supported card types only: ${SUPPORTED_TYPES}. ${cardTypeSchemas()}`,
    user: `Lesson: ${plan.title}
Objective: ${plan.primaryObjective}
Core mental model: ${plan.coreMentalModel}
Mastery: ${ctx.masteryLevel}/5
Full slide plan:
${plan.slides.map((s) => `${s.index}. ${s.requiredType}: ${s.title}`).join('\n')}

Previous chunk summaries:
${previousSummaries.join('\n') || '(none)'}

Generate only these slides:
${jsonSnippet(chunk.slides)}

Rules:
- Return JSON array only, not {cards}.
- Preserve the requested slide ids, order, and requiredType.
- Make each card useful and concrete.
- Every interactive card needs 3-4 options, valid answerIndex, and explanation.
${retry ? '- Keep language simpler and shorter on this retry.' : ''}`,
  };
}

function parseChunkCards(raw: string, targetCount: number): LessonCard[] {
  const parsed = extractJsonValue(raw);
  const rawCards =
    Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { cards?: unknown[] }).cards)
        ? (parsed as { cards: unknown[] }).cards
        : [];
  return assignCardIds(repairLessonCards(rawCards, targetCount));
}

async function generateLessonChunk(
  config: AiConfig,
  plan: HeavyLessonPlan,
  chunk: HeavyLessonChunk,
  ctx: LessonGenerationContext,
  mode: LessonGenerationMode,
  previousSummaries: string[],
): Promise<ChunkGenerationResult> {
  for (let attempt = 1; attempt <= CHUNK_ATTEMPTS; attempt++) {
    if (attempt === 1) console.log(`[lesson-gen] chunk ${chunk.index + 1}/${createLessonChunks(plan).length} start`);
    else console.log(`[lesson-gen] chunk ${chunk.index + 1}/${createLessonChunks(plan).length} retry ${attempt - 1}`);
    try {
      const prompt = chunkPrompt(plan, chunk, ctx, mode, previousSummaries, attempt > 1);
      const raw = await requestJsonCompletion(config, prompt.system, prompt.user, prompt.maxTokens, {
        jsonMode: prompt.jsonMode && !isGemmaGoogleProvider(config),
        retryWithoutJsonMode: true,
        generationMode: mode,
        chunkIndex: chunk.index,
        maxAttempts: 2,
      });
      const cards = parseChunkCards(raw, chunk.slides.length);
      if (cards.length === chunk.slides.length) {
        console.log(`[lesson-gen] chunk ${chunk.index + 1}/${createLessonChunks(plan).length} done`);
        return { cards, fallbackUsed: false };
      }
      if (cards.length > 0) return { cards: cards.slice(0, chunk.slides.length), fallbackUsed: false };
    } catch {
      if (attempt >= CHUNK_ATTEMPTS) {
        console.warn(`[lesson-gen] chunk ${chunk.index + 1}/${createLessonChunks(plan).length} fallback used`);
      }
    }
  }
  return { cards: buildFallbackCardsForPlanChunk(ctx, plan, chunk), fallbackUsed: true };
}

async function generateChunksWithConcurrency(
  config: AiConfig,
  plan: HeavyLessonPlan,
  chunks: HeavyLessonChunk[],
  ctx: LessonGenerationContext,
  mode: LessonGenerationMode,
  concurrency: number,
): Promise<{ chunkCards: LessonCard[][]; chunkFallbackIndexes: number[] }> {
  const results: LessonCard[][] = Array.from({ length: chunks.length }, () => []);
  const fallbackIndexes: number[] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < chunks.length) {
      const index = cursor++;
      const previousSummaries = chunks
        .slice(0, index)
        .map((chunk) => `${chunk.slides.map((s) => s.title).join(', ')}`)
        .filter(Boolean);
      const result = await generateLessonChunk(config, plan, chunks[index], ctx, mode, previousSummaries);
      results[index] = result.cards;
      if (result.fallbackUsed) fallbackIndexes.push(index + 1);
    }
  };
  await Promise.allSettled(Array.from({ length: Math.max(1, concurrency) }, worker));
  return { chunkCards: results, chunkFallbackIndexes: fallbackIndexes.sort((a, b) => a - b) };
}

function fallbackWarnings(metadata: LessonGenerationMetadata): string[] {
  const warnings: string[] = [];
  if (metadata.planningFallbackUsed) {
    warnings.push('AI provider fallback was used for planning.');
  }
  if (metadata.chunkFallbackIndexes?.length) {
    warnings.push(`AI provider fallback was used for chunks: ${metadata.chunkFallbackIndexes.join(', ')}.`);
  }
  return warnings;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

export function assembleHeavyLesson(
  blueprint: LessonBlueprint,
  ctx: LessonGenerationContext,
  plan: HeavyLessonPlan,
  chunkCards: LessonCard[][],
  metadata: LessonGenerationMetadata = {},
): HeavyLessonDraft {
  const cards = assignCardIds(chunkCards.flat()).slice(0, plan.slideCount);
  const lesson: GeneratedLesson = {
    id: 'draft',
    title: plan.title || blueprint.title,
    subtitle: plan.subtitle || blueprint.primaryObjective,
    minutes: Math.min(12, Math.max(4, Math.ceil(cards.length * 0.75))),
    cards,
    subjectId: 'computer-science',
    topic: ctx.currentLessonTitle,
    createdAt: new Date().toISOString(),
    generated: true,
    primaryObjective: plan.primaryObjective || blueprint.primaryObjective,
    generationMetadata: {
      ...metadata,
      warnings: uniqueStrings([...(metadata.warnings ?? []), ...fallbackWarnings(metadata)]),
    },
  };
  const { lesson: repaired, validation } = repairAndValidateLesson(lesson, {
    targetSlideCount: ctx.slidesPerLesson ?? plan.slideCount,
    minInteractiveCards: cards.length >= 8 ? 1 : 0,
    requireWorkedExample: cards.length >= 10,
    requireMisconception: cards.length >= 10,
    requireFormulaForMath: isMathHeavy('mathematics', ctx.currentLessonTitle),
    topic: ctx.currentLessonTitle,
    isDeepLesson: cards.length >= 10,
    isFinalLesson: !blueprint.nextLessonConnection && !blueprint.nextBridge,
  });
  if (validation.warnings.length > 0) {
    console.warn('[lesson-gen] validation warnings:', validation.warnings);
  }
  console.log('[lesson-gen] assembly done');
  if (repaired.cards.length < 3) {
    throw new Error('Could not assemble enough valid lesson slides.');
  }
  const cardConcepts = repaired.cards.flatMap((c) => c.conceptTags ?? []);
  return {
    title: repaired.title,
    subtitle: repaired.subtitle,
    minutes: repaired.minutes,
    cards: repaired.cards,
    primaryObjective: repaired.primaryObjective ?? blueprint.primaryObjective,
    generationMetadata: repaired.generationMetadata,
    conceptTags: uniqueStrings([...(blueprint.conceptTags ?? []), ...cardConcepts]).slice(0, 12),
    skillTags: blueprint.skillTags,
    prerequisiteConcepts: blueprint.prerequisiteConcepts,
  };
}

export async function generateLessonBatched(
  config: AiConfig,
  blueprint: LessonBlueprint,
  ctx: LessonGenerationContext,
  mode: LessonGenerationMode,
): Promise<HeavyLessonDraft> {
  console.log(`[lesson-gen] mode inferred: ${mode}`);
  const plan = await generateLessonPlan(config, blueprint, ctx, mode);
  const chunks = createLessonChunks(plan);
  const concurrency = mode === 'rich' ? 2 : mode === 'expert' ? 2 : 3;
  const { chunkCards, chunkFallbackIndexes } = await generateChunksWithConcurrency(config, plan, chunks, ctx, mode, concurrency);
  const metadata: LessonGenerationMetadata = {
    mode,
    planningFallbackUsed: Boolean(plan.planningFallbackUsed),
    chunkFallbackIndexes,
  };
  const warnings = fallbackWarnings(metadata);
  if (warnings.length > 0) {
    console.warn('[lesson-gen] fallback warnings:', warnings);
  }
  return assembleHeavyLesson(blueprint, ctx, plan, chunkCards, { ...metadata, warnings });
}
