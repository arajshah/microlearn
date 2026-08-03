import { stripReasoningWrappers } from '@/ai/sanitize';
import { generateLessonBatched } from '@/ai/heavyLessonGeneration';
import { inferLessonGenerationMode } from '@/ai/lessonGenerationStrategy';
import { getMasteryTier, MasteryLevel } from '@/data/mastery';
import {
  AiConfig,
  LessonCard,
  LessonGenerationMetadata,
  Subject,
} from '@/types/content';
import { LessonBlueprint, BLUEPRINT_VERSION } from '@/types/lessonBlueprint';
import { LessonGenerationContext } from '@/types/lessonGeneration';
import { RoadmapLessonContext } from '@/types/roadmap';

export interface GenerateArgs {
  subject: Subject;
  topic: string;
  masteryLevel: MasteryLevel;
  /** Target number of slides (screens) in the lesson. */
  slideCount?: number;
  /** Optional source text (pasted article/notes or formatted URL extraction). */
  sourceText?: string;
  sourceUrl?: string;
  sourceTitle?: string;
  /** Roadmap context for coherent multi-lesson paths. */
  roadmapContext?: RoadmapLessonContext;
}

const MAX_SOURCE_CHARS = 6000;

export interface GeneratedLessonDraft {
  title: string;
  subtitle: string;
  minutes: number;
  cards: LessonCard[];
  generationMetadata?: LessonGenerationMetadata;
  conceptTags?: string[];
  skillTags?: string[];
  prerequisiteConcepts?: string[];
}

export class AiError extends Error {}

/* ---------- Debug logging (prints to the Metro/Expo terminal) ---------- */

const DEBUG: boolean = (globalThis as any).__DEV__ ?? true;

function logGroup(title: string, lines: Array<[string, unknown]>) {
  if (!DEBUG) return;
  console.log(`\n[AI] ${title}`);
  for (const [label, value] of lines) {
    const text =
      typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    console.log(`[AI]   ${label}:`, text);
  }
}

function logRaw(label: string, value: string) {
  if (!DEBUG) return;
  console.log(`[AI] ${label} (${value.length} chars):\n${value}\n[AI] ----- end ${label} -----`);
}

function snippet(s: string, n = 400): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function buildSystemPrompt(masteryLevel: MasteryLevel, slideCount?: number): string {
  const tier = getMasteryTier(masteryLevel);
  const [tierMin, tierMax] = tier.cardRange;
  const [minMin, maxMin] = tier.minutesRange;
  const targetSlides = slideCount ?? tierMin;
  const minCards = slideCount ? Math.max(3, targetSlides - 1) : tierMin;
  const maxCards = slideCount ? Math.min(20, targetSlides + 1) : tierMax;
  const bodySentences = masteryLevel <= 2 ? '2-3' : masteryLevel <= 3 ? '2-4' : '3-5';
  const quizMin = Math.max(2, Math.floor(targetSlides / 3));

  return `You are an expert curriculum designer for a premium microlearning app (think Duolingo meets Brilliant). You write accurate, engaging bite-sized lessons.

You MUST respond with a single valid JSON object and nothing else — no markdown, no code fences, no commentary.

The JSON must match this TypeScript type exactly:

{
  "title": string,
  "subtitle": string,
  "minutes": number,
  "cards": Card[]
}

Each Card is ONE of:
{ "type": "concept", "title": string, "body": string, "emoji": string, "keyTerm": string, "keyTermDef": string }
{ "type": "quiz", "question": string, "options": string[4], "answerIndex": number, "explanation": string }
{ "type": "truefalse", "statement": string, "answer": boolean, "explanation": string }
{ "type": "quote", "text": string, "author": string }

Audience: Level ${tier.level} — ${tier.name} (${tier.tagline}).
Depth: ${tier.depth}
Target length: ${slideCount ? `exactly ${targetSlides} slides` : `${minCards}-${maxCards} slides`}, ${minMin}-${maxMin} minutes total.
- The "cards" array is the slide sequence — aim for ${slideCount ? targetSlides : `${minCards}-${maxCards}`} slides total.
- "body" should be ${bodySentences} sentences per concept card.
- Include at least ${quizMin} quiz or true/false checks.
- Start with 2 concept cards, alternate checks, optionally end with a quote.
- "quiz" must have exactly 4 plausible options; "answerIndex" is 0-based.
- Be factually accurate. Output ONLY the JSON — no \`<thought>\` blocks or commentary.`;
}

function buildUserPrompt({ subject, topic, masteryLevel, slideCount, sourceText, sourceUrl, sourceTitle, roadmapContext }: GenerateArgs): string {
  const tier = getMasteryTier(masteryLevel);
  const slideLine = slideCount ? `\nTarget slides: ${slideCount}.` : '';
  if (roadmapContext) {
    const prev =
      roadmapContext.previousLessons.length > 0
        ? roadmapContext.previousLessons
            .map((l) => `- ${l.title}: ${l.objective}`)
            .join('\n')
        : '(none — this is early in the path)';
    const next =
      roadmapContext.nextLessons.length > 0
        ? roadmapContext.nextLessons.map((l) => `- ${l.title}: ${l.objective}`).join('\n')
        : '(none — near the end)';
    return `Create one microlearning lesson as part of a structured learning roadmap.

Roadmap: "${roadmapContext.roadmapTitle}"
Overall goal: ${roadmapContext.goal}
Unit: ${roadmapContext.unitTitle} — ${roadmapContext.unitDescription}

This lesson:
- Title: "${roadmapContext.lessonTitle}"
- Objective: ${roadmapContext.learningObjective}
- Key ideas to cover: ${roadmapContext.keyIdeas.join('; ')}

Mastery level: ${tier.level} (${tier.name})

Previous lessons in this path:
${prev}

Upcoming lessons (stay aligned, don't duplicate):
${next}

Subject area for examples: ${subject.title}.
Make this lesson coherent with the path — build on prior lessons without repeating them.${slideLine}`;
  }
  const src = sourceText?.trim();
  if (src) {
    const clipped =
      src.length > MAX_SOURCE_CHARS ? `${src.slice(0, MAX_SOURCE_CHARS)}…` : src;
    const header = sourceTitle
      ? `SOURCE (${sourceTitle}${sourceUrl ? ` — ${sourceUrl}` : ''}):`
      : 'SOURCE MATERIAL:';
    return `Create one microlearning lesson that teaches the most important ideas from the SOURCE MATERIAL below.
Subject area: ${subject.title} (${subject.tagline}).
${topic.trim() ? `Focus especially on: "${topic.trim()}".` : ''}
Mastery level: ${tier.level} (${tier.name}) — ${tier.depth}${slideLine}
Distill accurate concepts into concept slides plus checks. Do not invent facts that contradict the source.

${header}
"""
${clipped}
"""`;
  }
  const t = topic.trim() || subject.title;
  return `Create one microlearning lesson.
Subject area: ${subject.title} (${subject.tagline}).
Specific topic: "${t}".
Mastery level: ${tier.level} (${tier.name}) — ${tier.depth}${slideLine}
Make it genuinely useful, appropriately challenging, and memorable.`;
}

function standaloneTitle(args: GenerateArgs): string {
  return args.roadmapContext?.lessonTitle || args.topic.trim() || args.subject.title;
}

function buildStandaloneBlueprint(args: GenerateArgs): LessonBlueprint {
  const title = standaloneTitle(args);
  const objective = args.roadmapContext?.learningObjective || `Understand ${title} and apply it accurately.`;
  const keyIdeas = args.roadmapContext?.keyIdeas?.length
    ? args.roadmapContext.keyIdeas
    : [title, objective, `How ${title} is used`];
  return {
    id: `standalone-${Date.now().toString(36)}`,
    roadmapId: 'standalone',
    roadmapNodeId: 'standalone',
    version: BLUEPRINT_VERSION,
    title,
    primaryObjective: objective,
    prerequisiteRecall: ['Recall the core terms and why the topic matters.'],
    keyIdeas,
    explanationPlan: keyIdeas.map((idea) => `Explain ${idea}.`),
    examplePlan: [`Work through a concrete example of ${title}.`],
    interactionPlan: [
      { type: 'multiple_choice', purpose: 'Check understanding.', conceptTested: keyIdeas[0] },
      { type: 'prediction', purpose: 'Check transfer.', conceptTested: keyIdeas[1] ?? keyIdeas[0] },
    ],
    misconceptionChecks: [
      {
        misconception: `Treating ${title} as something to memorize rather than use.`,
        diagnosticQuestion: `What is the most useful way to think about ${title}?`,
        correctionGoal: 'Connect the concept to application.',
      },
    ],
    applicationPlan: [`Apply ${title} in a realistic small case.`],
    summaryPoints: keyIdeas.slice(0, 4),
    estimatedMinutes: Math.min(12, Math.max(4, Math.ceil((args.slideCount ?? 8) * 0.75))),
    createdAt: new Date().toISOString(),
    coreMentalModel: `Think of ${title} as a reusable mental model, not just a definition.`,
    workedExamplePlan: `Show a step-by-step example for ${title}.`,
    visualModel: `Describe a visual model for ${title}.`,
    misconceptionTargets: [`Confusing the surface wording of ${title} with its actual use.`],
  };
}

function buildStandaloneContext(args: GenerateArgs): LessonGenerationContext {
  const title = standaloneTitle(args);
  const clippedSource = args.sourceText
    ? args.sourceText.slice(0, MAX_SOURCE_CHARS)
    : undefined;
  return {
    roadmapId: 'standalone',
    roadmapTitle: args.roadmapContext?.roadmapTitle ?? `${args.subject.title} lesson`,
    roadmapGoal: args.roadmapContext?.goal ?? `Learn ${title}`,
    unitTitle: args.roadmapContext?.unitTitle ?? args.subject.title,
    unitDescription: args.roadmapContext?.unitDescription ?? args.subject.tagline,
    currentLessonTitle: title,
    currentLearningObjective:
      args.roadmapContext?.learningObjective ?? `Understand ${title} and apply it accurately.`,
    currentKeyIdeas: args.roadmapContext?.keyIdeas ?? [title],
    masteryLevel: args.masteryLevel,
    learningPreferences: undefined,
    previousLessonOutcomes: [],
    knownMisconceptions: [],
    upcomingLessons: args.roadmapContext?.nextLessons ?? [],
    prerequisiteLessons: args.roadmapContext?.previousLessons ?? [],
    sourceExcerpt: clippedSource,
    slidesPerLesson: args.slideCount,
  };
}

interface ExtractResult {
  candidate: string;
  /** True when no balanced closing brace was found (likely truncated output). */
  truncated: boolean;
}

/** Find the start index of the lesson JSON object (skip braces inside prose). */
function findJsonObjectStart(s: string): number {
  // Strong signal: our schema always opens with "title" or "cards".
  const anchored = s.match(/\{\s*"(?:title|cards)"/);
  if (anchored && anchored.index != null) return anchored.index;

  return s.indexOf('{');
}

/**
 * Pull the first *balanced* JSON object out of a model response, ignoring any
 * surrounding prose or markdown fences. Uses brace-counting (string-aware) so
 * trailing commentary after the object doesn't break parsing.
 */
function extractJson(raw: string): ExtractResult {
  const stripped = stripReasoningWrappers(raw.trim());
  if (DEBUG && stripped.length !== raw.trim().length) {
    console.log(
      `[AI]   Stripped reasoning wrapper (${raw.trim().length} → ${stripped.length} chars)`,
    );
  }
  let s = stripped;

  // If the model fenced its answer, prefer the fenced block's contents.
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence && fence[1].includes('{')) {
    s = fence[1].trim();
  } else {
    // Otherwise just strip stray leading/trailing fence markers.
    s = s.replace(/```json/gi, '').replace(/```/g, '').trim();
  }

  const start = findJsonObjectStart(s);
  if (start === -1) {
    throw new AiError('The model did not return any JSON object.');
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return { candidate: s.slice(start, i + 1), truncated: false };
      }
    }
  }

  // Never closed → almost certainly truncated mid-output.
  return { candidate: s.slice(start), truncated: true };
}

/** Best-effort fixes for common model JSON defects (trailing commas, etc.). */
function repairJson(s: string): string {
  return s
    .replace(/,(\s*[}\]])/g, '$1') // trailing commas
    .replace(/[\u201C\u201D]/g, '"') // smart double quotes
    .replace(/[\u2018\u2019]/g, "'"); // smart single quotes
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function validateCards(input: unknown): LessonCard[] {
  if (!Array.isArray(input)) return [];
  const cards: LessonCard[] = [];
  for (const c of input) {
    if (!c || typeof c !== 'object') continue;
    const type = (c as any).type;
    if (type === 'concept') {
      const title = asString((c as any).title);
      const body = asString((c as any).body);
      if (!title || !body) continue;
      cards.push({
        type: 'concept',
        title,
        body,
        emoji: asString((c as any).emoji) || undefined,
        keyTerm: asString((c as any).keyTerm) || undefined,
        keyTermDef: asString((c as any).keyTermDef) || undefined,
      });
    } else if (type === 'quiz') {
      const question = asString((c as any).question);
      const options = Array.isArray((c as any).options)
        ? (c as any).options.map(asString).filter(Boolean)
        : [];
      const answerIndex = Number((c as any).answerIndex);
      const explanation = asString((c as any).explanation);
      if (
        !question ||
        options.length < 2 ||
        !Number.isInteger(answerIndex) ||
        answerIndex < 0 ||
        answerIndex >= options.length
      ) {
        continue;
      }
      cards.push({ type: 'quiz', question, options, answerIndex, explanation });
    } else if (type === 'truefalse') {
      const statement = asString((c as any).statement);
      const answer = (c as any).answer;
      const explanation = asString((c as any).explanation);
      if (!statement || typeof answer !== 'boolean') continue;
      cards.push({ type: 'truefalse', statement, answer, explanation });
    } else if (type === 'quote') {
      const text = asString((c as any).text);
      const author = asString((c as any).author);
      if (!text) continue;
      cards.push({ type: 'quote', text, author: author || 'Unknown' });
    }
  }
  return cards;
}

function parseLesson(raw: string, finishReason: string, slideCount?: number): GeneratedLessonDraft {
  const { candidate, truncated } = extractJson(raw);
  logRaw('Extracted JSON candidate', candidate);

  let obj: any;
  try {
    obj = JSON.parse(candidate);
  } catch (firstErr: any) {
    // Try a repaired version before giving up.
    const repaired = repairJson(candidate);
    try {
      obj = JSON.parse(repaired);
      console.log('[AI]   Parsed only after repairJson() cleanup.');
    } catch (secondErr: any) {
      logGroup('JSON PARSE FAILED', [
        ['finish_reason', finishReason || '(none)'],
        ['looks_truncated', truncated],
        ['first_parse_error', firstErr?.message],
        ['after_repair_error', secondErr?.message],
      ]);
      logRaw('Full raw model output', raw);
      if (truncated || finishReason === 'length') {
        throw new AiError(
          'The model response was cut off before the lesson finished (token limit). Try again, or pick a smaller/faster model in Settings.',
        );
      }
      throw new AiError(
        `Could not parse the lesson JSON (${firstErr?.message || 'invalid JSON'}). The model returned: "${snippet(raw, 160)}". See the terminal for the full output.`,
      );
    }
  }

  const cards = validateCards(obj.cards);
  const questionCount = cards.filter(
    (c) => c.type === 'quiz' || c.type === 'truefalse',
  ).length;
  logGroup('Lesson parsed', [
    ['title', asString(obj.title)],
    ['cards_total', cards.length],
    ['questions', questionCount],
    ['truncated', truncated],
  ]);

  const minSlides = slideCount ? Math.max(3, slideCount - 2) : 3;
  if (cards.length < minSlides || questionCount < 1) {
    throw new AiError(
      `The generated lesson was incomplete (${cards.length} valid slides, ${questionCount} questions). Try again or rephrase the topic.`,
    );
  }
  const minutes = Number(obj.minutes);
  return {
    title: asString(obj.title) || 'Untitled Lesson',
    subtitle: asString(obj.subtitle) || '',
    minutes: Number.isFinite(minutes) ? Math.min(10, Math.max(2, minutes)) : 4,
    cards,
  };
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

async function postChat(
  config: AiConfig,
  messages: ChatMessage[],
  opts: { json: boolean; maxTokens: number },
): Promise<Response> {
  const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const body: Record<string, unknown> = {
    model: config.model,
    temperature: 0.7,
    max_tokens: opts.maxTokens,
    messages,
  };
  if (opts.json) body.response_format = { type: 'json_object' };
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });
}

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body?.error?.message || body?.message || '';
  } catch {
    return '';
  }
}

function throwForStatus(status: number, detail: string): never {
  if (status === 401 || status === 403) {
    throw new AiError('Invalid or unauthorized API key. Check it in Settings.');
  }
  if (status === 404) {
    throw new AiError(
      `Model or endpoint not found (404). Check the model name and base URL.${detail ? ` — ${detail}` : ''}`,
    );
  }
  if (status === 429) {
    throw new AiError(
      'Rate limited or quota reached (429). Wait a bit, or switch model/provider in Settings.',
    );
  }
  throw new AiError(`Request failed (${status}).${detail ? ` ${detail}` : ''}`);
}

export async function generateLesson(
  config: AiConfig,
  args: GenerateArgs,
): Promise<GeneratedLessonDraft> {
  if (!config.apiKey) throw new AiError('Add your API key in Settings first.');
  if (!config.baseUrl) throw new AiError('Set a provider base URL in Settings.');
  if (!config.model) throw new AiError('Choose a model in Settings.');

  const mode = inferLessonGenerationMode({
    slideCount: args.slideCount,
    masteryLevel: args.masteryLevel,
    topic: args.topic || args.roadmapContext?.lessonTitle,
    subject: args.subject,
    sourceText: args.sourceText,
  });
  if (mode !== 'light') {
    const blueprint = buildStandaloneBlueprint(args);
    const ctx = buildStandaloneContext(args);
    return generateLessonBatched(config, blueprint, ctx, mode);
  }

  console.log('[lesson-gen] mode inferred: light');
  const tier = getMasteryTier(args.masteryLevel);
  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(args.masteryLevel, args.slideCount) },
    { role: 'user', content: buildUserPrompt(args) },
  ];
  const MAX_TOKENS = args.masteryLevel >= 4 ? 6144 : 4096;

  logGroup('Generate request', [
    ['endpoint', `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`],
    ['model', config.model],
    ['subject', args.subject.title],
    ['topic', args.topic || '(general)'],
    ['from_source', args.sourceText ? `${args.sourceText.length} chars` : 'no'],
    ['mastery', `${tier.level} ${tier.name}`],
    ['max_tokens', MAX_TOKENS],
  ]);

  let res: Response;
  let usedJsonMode = true;
  try {
    res = await postChat(config, messages, { json: true, maxTokens: MAX_TOKENS });
    // Some models (e.g. certain Gemma builds) reject response_format. Retry plainly.
    if (res.status === 400) {
      console.log('[AI]   400 with JSON mode — retrying without response_format.');
      usedJsonMode = false;
      res = await postChat(config, messages, { json: false, maxTokens: MAX_TOKENS });
    }
  } catch (e: any) {
    logGroup('Network error', [['message', e?.message]]);
    throw new AiError(
      'Network error. Check your internet connection and base URL.',
    );
  }

  logGroup('Response received', [
    ['http_status', res.status],
    ['json_mode_used', usedJsonMode],
  ]);

  if (!res.ok) {
    const detail = await readError(res);
    logGroup('HTTP error body', [['detail', detail || '(empty)']]);
    throwForStatus(res.status, detail);
  }

  let data: any;
  try {
    data = await res.json();
  } catch (e: any) {
    logGroup('Unreadable response', [['message', e?.message]]);
    throw new AiError('The provider returned an unreadable response.');
  }

  const choice = data?.choices?.[0];
  const finishReason: string = choice?.finish_reason ?? '';
  const content: string = choice?.message?.content ?? choice?.text ?? '';

  logGroup('Model output meta', [
    ['finish_reason', finishReason || '(none)'],
    ['content_length', content.length],
    ['usage', data?.usage ?? '(not reported)'],
    ['preview', snippet(content, 300)],
  ]);

  if (!content) {
    // Surface refusals / safety blocks if present.
    const refusal =
      choice?.message?.refusal || data?.promptFeedback?.blockReason || '';
    logGroup('Empty content', [
      ['refusal_or_block', refusal || '(none)'],
      ['full_response', data],
    ]);
    throw new AiError(
      refusal
        ? `The model returned no lesson (blocked: ${refusal}). Try a different topic.`
        : 'The model returned an empty response. Try again.',
    );
  }

  return parseLesson(content, finishReason, args.slideCount);
}
