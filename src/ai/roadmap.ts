import { stripReasoningWrappers } from '@/ai/sanitize';
import { AiError } from '@/ai/client';
import { requestJsonCompletion } from '@/ai/jsonCompletion';
import { getMasteryTier, MasteryLevel } from '@/data/mastery';
import { makeRoadmapId } from '@/storage/roadmaps';
import {
  GenerateRoadmapInput,
  GeneratedRoadmap,
  RoadmapDepth,
  RoadmapLessonNode,
  RoadmapUnit,
} from '@/types/roadmap';
import { RoadmapSourceContext } from '@/types/urlSource';
import { recalculateRoadmapStatuses } from '@/utils/roadmapProgress';
import { AiConfig } from '@/types/content';

const DEBUG: boolean = (globalThis as { __DEV__?: boolean }).__DEV__ ?? true;

function log(msg: string, detail?: unknown) {
  if (!DEBUG) return;
  console.log(`[Roadmap AI] ${msg}`, detail ?? '');
}

function depthUnitRange(lessonCount: number): [number, number] {
  const units = Math.max(2, Math.min(8, Math.ceil(lessonCount / 3)));
  return [Math.max(2, units - 1), units + 1];
}

function validateLessonCount(input: GenerateRoadmapInput, actual: number): string[] {
  const target = input.lessonCount;
  const tolerance = Math.max(2, Math.round(target * 0.2));
  if (actual < target - tolerance || actual > target + tolerance) {
    return [`Expected ~${target} lessons, got ${actual}`];
  }
  return [];
}

const SYSTEM_PROMPT = `You are an expert curriculum designer building structured learning roadmaps for a microlearning app.

You MUST respond with a single valid JSON object and nothing else — no markdown fences, no commentary, no <thought> tags.

Schema:
{
  "title": string,
  "description": string,
  "estimatedTotalMinutes": number,
  "units": [
    {
      "title": string,
      "description": string,
      "order": number,
      "lessons": [
        {
          "title": string,
          "shortDescription": string,
          "learningObjective": string,
          "estimatedMinutes": number (3-8),
          "difficulty": number (1-5),
          "order": number,
          "prerequisiteIds": string[] (lesson ids from EARLIER in the roadmap only),
          "keyIdeas": string[] (2-4 items)
        }
      ]
    }
  ]
}

Rules:
- Build a coherent curriculum toward the learner's goal — not a loose topic list.
- One primary learning objective per lesson.
- Gradual difficulty progression; address misconceptions where relevant.
- End with a synthesis or application lesson.
- Use stable lesson ids like "l1", "l2", "l3" in global order across the whole roadmap.
- prerequisiteIds must reference only earlier lesson ids.
- First lesson must have prerequisiteIds: [].
- No circular dependencies. No forward references.
- Concrete, descriptive lesson titles.
- Minimal redundancy across lessons.`;

function formatSourceBlock(source: RoadmapSourceContext): string {
  const sections = source.sourceSections
    .slice(0, 8)
    .map(
      (s) =>
        `- ${s.heading}: ${s.summary} (${s.keyPoints.slice(0, 4).join('; ')})`,
    )
    .join('\n');
  return `
SOURCE MATERIAL (ground the curriculum in this — do not invent source-specific claims):
Title: ${source.sourceTitle}
URL: ${source.sourceUrl}
Summary: ${source.sourceSummary}
Key concepts: ${source.keyConcepts.join('; ')}
Important terms: ${source.importantTerms.join('; ')}
${source.sourceWarnings.length ? `Warnings: ${source.sourceWarnings.join('; ')}` : ''}
Sections:
${sections}

Organize pedagogically toward the learner's goal — do not copy page order mechanically.
When a lesson extends beyond the source, note that implicitly in lesson descriptions.`;
}

function buildUserPrompt(input: GenerateRoadmapInput): string {
  const tier = getMasteryTier(input.masteryLevel);
  const unitRange = depthUnitRange(input.lessonCount);
  const sourceBlock = input.sourceContext ? formatSourceBlock(input.sourceContext) : '';
  return `Create a learning roadmap.

Topic: "${input.topic.trim()}"
Goal: "${input.goal.trim()}"
Starting mastery: Level ${tier.level} — ${tier.name} (${tier.tagline})
Depth: ${input.depth}
Target size: ${input.lessonCount} lessons total (${unitRange[0]}-${unitRange[1]} units), each lesson designed for ${input.slidesPerLesson} slides when generated later.
${input.preferences?.trim() ? `Preferences: ${input.preferences.trim()}` : ''}
${sourceBlock}

Target exactly ${input.lessonCount} lessons. Assign lesson ids l1, l2, l3… globally in learning order.`;
}

function buildRepairPrompt(input: GenerateRoadmapInput, errors: string[]): string {
  return `${buildUserPrompt(input)}

Your previous JSON failed validation:
${errors.map((e) => `- ${e}`).join('\n')}

Return corrected JSON only. Keep lesson ids l1, l2, l3… Fix all validation errors.`;
}

function extractJsonObject(raw: string): string {
  const stripped = stripReasoningWrappers(raw.trim());
  let s = stripped;
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence && fence[1].includes('{')) s = fence[1].trim();
  else s = s.replace(/```json/gi, '').replace(/```/g, '').trim();

  const anchored = s.match(/\{\s*"(?:title|units)"/);
  const start = anchored?.index ?? s.indexOf('{');
  if (start === -1) throw new AiError('The model did not return JSON.');

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
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  throw new AiError('The roadmap JSON was truncated. Try again or use Quick depth.');
}

function repairJson(s: string): string {
  return s
    .replace(/,(\s*[}\]])/g, '$1')
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function asNum(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => asString(x)).filter(Boolean);
}

interface RawLesson {
  title: string;
  shortDescription: string;
  learningObjective: string;
  estimatedMinutes: number;
  difficulty: number;
  order: number;
  prerequisiteIds: string[];
  keyIdeas: string[];
  id?: string;
}

interface RawUnit {
  title: string;
  description: string;
  order: number;
  lessons: RawLesson[];
  id?: string;
}

function validateDepthCounts(
  input: GenerateRoadmapInput,
  unitCount: number,
  lessonCount: number,
): string[] {
  const unitRange = depthUnitRange(input.lessonCount);
  const errors: string[] = [];
  if (unitCount < unitRange[0] || unitCount > unitRange[1] + 1) {
    errors.push(`Expected ${unitRange[0]}-${unitRange[1]} units, got ${unitCount}`);
  }
  errors.push(...validateLessonCount(input, lessonCount));
  return errors;
}

interface RawLessonBuild extends RoadmapLessonNode {
  aliases: string[];
}

interface RawUnitBuild {
  id: string;
  title: string;
  description: string;
  order: number;
  lessons: RawLessonBuild[];
}

function normalizeAndValidate(
  obj: Record<string, unknown>,
  input: GenerateRoadmapInput,
): { roadmap: GeneratedRoadmap; errors: string[] } {
  const errors: string[] = [];
  const title = asString(obj.title);
  const description = asString(obj.description);
  if (!title) errors.push('Missing title');
  if (!description) errors.push('Missing description');

  const rawUnits = Array.isArray(obj.units) ? obj.units : [];
  if (rawUnits.length === 0) errors.push('No units');

  const units: RawUnitBuild[] = [];
  let globalLessonIdx = 0;

  rawUnits.forEach((ru, ui) => {
    if (!ru || typeof ru !== 'object') return;
    const raw = ru as Record<string, unknown>;
    const unitTitle = asString(raw.title);
    const unitDesc = asString(raw.description);
    const unitOrder = asNum(raw.order, ui + 1);
    if (!unitTitle) errors.push(`Unit ${ui + 1} missing title`);

    const unitId = asString(raw.id) || `unit-${ui + 1}`;
    const rawLessons = Array.isArray(raw.lessons) ? raw.lessons : [];
    if (rawLessons.length === 0) errors.push(`Unit "${unitTitle || ui + 1}" has no lessons`);

    const lessons: RawLessonBuild[] = rawLessons.map((rl, li) => {
      globalLessonIdx++;
      const r = (rl ?? {}) as Record<string, unknown>;
      const modelId = asString(r.id);
      const lessonId = modelId || `l${globalLessonIdx}`;
      const aliases = [lessonId];
      if (modelId && modelId !== lessonId) aliases.push(modelId);

      const mins = asNum(r.estimatedMinutes, 5);
      const diff = asNum(r.difficulty, input.masteryLevel);
      if (mins < 2 || mins > 12) {
        errors.push(`Lesson "${asString(r.title)}" minutes out of range (${mins})`);
      }
      if (diff < 1 || diff > 5) {
        errors.push(`Lesson "${asString(r.title)}" difficulty out of range (${diff})`);
      }

      return {
        id: lessonId,
        unitId,
        title: asString(r.title) || `Lesson ${globalLessonIdx}`,
        shortDescription: asString(r.shortDescription) || asString(r.title),
        learningObjective:
          asString(r.learningObjective) || asString(r.shortDescription) || 'Learn the core idea.',
        estimatedMinutes: Math.min(10, Math.max(3, mins)),
        difficulty: Math.min(5, Math.max(1, diff)),
        order: asNum(r.order, li + 1),
        prerequisiteIds: asStringArray(r.prerequisiteIds),
        keyIdeas: asStringArray(r.keyIdeas).slice(0, 5),
        status: 'locked' as const,
        aliases,
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

  const flatRaw = units.flatMap((u) => u.lessons) as RawLessonBuild[];
  const idMap = new Map<string, string>();
  flatRaw.forEach((l, i) => {
    const stable = `l${i + 1}`;
    idMap.set(l.id, stable);
    for (const alias of l.aliases) idMap.set(alias, stable);
  });

  const remappedUnits: RoadmapUnit[] = units.map((unit) => ({
    id: unit.id,
    title: unit.title,
    description: unit.description,
    order: unit.order,
    lessons: unit.lessons.map((l) => {
      const globalIdx = flatRaw.findIndex((x) => x.id === l.id);
      const stableId = `l${globalIdx + 1}`;
      const raw = l as RawLessonBuild;
      return {
        id: stableId,
        unitId: unit.id,
        title: raw.title,
        shortDescription: raw.shortDescription,
        learningObjective: raw.learningObjective,
        estimatedMinutes: raw.estimatedMinutes,
        difficulty: raw.difficulty,
        order: raw.order,
        prerequisiteIds: raw.prerequisiteIds
          .map((pid: string) => idMap.get(pid) ?? pid)
          .filter((pid: string) => pid !== stableId),
        keyIdeas: raw.keyIdeas,
        status: raw.status,
      };
    }),
  }));

  const flatLessons = remappedUnits.flatMap((u) => u.lessons);

  const unitIds = new Set(remappedUnits.map((u) => u.id));
  if (unitIds.size !== remappedUnits.length) errors.push('Duplicate unit IDs');

  const lessonIds = new Set<string>();
  for (const l of flatLessons) {
    if (lessonIds.has(l.id)) errors.push(`Duplicate lesson id: ${l.id}`);
    lessonIds.add(l.id);
  }

  const orderMap = new Map(flatLessons.map((l, i) => [l.id, i]));
  for (const l of flatLessons) {
    for (const pid of l.prerequisiteIds) {
      if (!lessonIds.has(pid)) {
        errors.push(`Lesson ${l.id} references unknown prerequisite ${pid}`);
      } else if ((orderMap.get(pid) ?? 0) >= (orderMap.get(l.id) ?? 0)) {
        errors.push(`Lesson ${l.id} has forward prerequisite ${pid}`);
      }
    }
  }

  // Cycle detection
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function dfs(id: string): boolean {
    if (visited.has(id)) return false;
    if (visiting.has(id)) return true;
    visiting.add(id);
    const node = flatLessons.find((l) => l.id === id);
    for (const p of node?.prerequisiteIds ?? []) {
      if (dfs(p)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  for (const l of flatLessons) {
    if (dfs(l.id)) {
      errors.push('Circular prerequisite dependency detected');
      break;
    }
  }

  errors.push(
    ...validateDepthCounts(input, remappedUnits.length, flatLessons.length),
  );

  const estimatedTotalMinutes =
    flatLessons.reduce((s, l) => s + l.estimatedMinutes, 0) ||
    asNum(obj.estimatedTotalMinutes, flatLessons.length * 5);

  const roadmap: GeneratedRoadmap = recalculateRoadmapStatuses({
    id: makeRoadmapId(),
    title,
    topic: input.topic.trim(),
    goal: input.goal.trim(),
    description,
    masteryLevel: input.masteryLevel,
    depth: input.depth,
    targetLessonCount: input.lessonCount,
    slidesPerLesson: input.slidesPerLesson,
    preferences: input.preferences?.trim() || undefined,
    estimatedTotalMinutes,
    createdAt: new Date().toISOString(),
    units: remappedUnits.sort((a, b) => a.order - b.order),
    sourceUrl: input.sourceUrl,
    sourceExtractionId: input.sourceExtractionId,
    sourceContext: input.sourceContext,
  });

  return { roadmap, errors };
}

function parseRoadmapResponse(
  raw: string,
  input: GenerateRoadmapInput,
): { roadmap: GeneratedRoadmap; errors: string[] } {
  const candidate = extractJsonObject(raw);
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(candidate);
  } catch {
    obj = JSON.parse(repairJson(candidate));
  }
  if (!obj || typeof obj !== 'object') {
    throw new AiError('Invalid roadmap JSON structure.');
  }
  return normalizeAndValidate(obj, input);
}

export async function generateRoadmap(
  config: AiConfig,
  input: GenerateRoadmapInput,
): Promise<GeneratedRoadmap> {
  if (!input.topic.trim()) throw new AiError('Enter a topic for your roadmap.');
  if (!input.goal.trim()) throw new AiError('Enter a learning goal.');

  const maxTokens = input.depth === 'deep' ? 8192 : input.depth === 'standard' ? 6144 : 4096;

  log('Generating roadmap', { topic: input.topic, depth: input.depth });

  let content = await requestJsonCompletion(
    config,
    SYSTEM_PROMPT,
    buildUserPrompt(input),
    maxTokens,
  );

  let result = parseRoadmapResponse(content, input);
  if (result.errors.length > 0) {
    log('Validation failed, retrying', result.errors);
    content = await requestJsonCompletion(
      config,
      SYSTEM_PROMPT,
      buildRepairPrompt(input, result.errors),
      maxTokens,
    );
    result = parseRoadmapResponse(content, input);
    if (result.errors.length > 0) {
      throw new AiError(
        `Could not build a valid roadmap: ${result.errors.slice(0, 3).join('; ')}`,
      );
    }
  }

  return result.roadmap;
}
