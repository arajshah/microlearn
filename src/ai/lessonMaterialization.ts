import { requestJsonCompletion } from '@/ai/jsonCompletion';
import {
  assignCardIds,
  validateMaterializedLesson,
} from '@/ai/lessonValidation';
import { parseJsonObject, asNum, asString } from '@/ai/jsonExtract';
import { AiError } from '@/ai/client';
import { GeneratedLessonDraft } from '@/ai/client';
import { LessonBlueprint } from '@/types/lessonBlueprint';
import { LessonGenerationContext } from '@/types/lessonGeneration';
import { AiConfig, LessonCard } from '@/types/content';

const SYSTEM_PROMPT = `You are an expert microlearning author. Materialize a complete lesson from a validated blueprint.

Return ONE valid JSON object only.

Schema:
{
  "title": string,
  "subtitle": string,
  "minutes": number,
  "primaryObjective": string,
  "cards": [
    {
      "id": string (unique, e.g. c1, c2...),
      "type": "hook"|"recall"|"explanation"|"example"|"quiz"|"truefalse"|"fillblank"|"matching"|"ordering"|"misconception"|"application"|"prediction"|"summary"|"next_connection",
      ...type-specific fields...
    }
  ]
}

Educational sequence (preserve this order):
1. hook — { title, body }
2. recall — { prompt, body }
3. explanation (1-2) — { title, body, keyTerm?, keyTermDef? }
4. example — { title, body }
5. interactions (2-4) — quiz/truefalse/fillblank/matching/ordering/prediction/misconception/application
6. misconception (if in blueprint) — { misconception, question, options[], answerIndex, explanation }
7. application — { question, options[], answerIndex, explanation }
8. summary — { title?, points[] }
9. next_connection — { body, nextTitle? }

Card field reference:
- quiz/application/prediction/misconception: question, options (3-4), answerIndex, explanation
- prediction: also scenario
- truefalse: statement, answer (boolean), explanation
- fillblank: sentence with ___, options[], answerIndex, explanation
- matching: prompt, pairs[{left,right}], explanation
- ordering: prompt, items[] (correct order), explanation

Rules:
- Follow the blueprint EXACTLY — same objective, key ideas, and plans.
- 6-10 cards total. Concise prose — no textbook paragraphs.
- Every assessment needs a valid answerIndex and explanation.
- Distractors must be plausible but clearly wrong.
- Reuse terminology from previous lessons in the context.
- Do not introduce future concepts without brief explanation.
- Include primaryObjective in the response matching the blueprint.`;

function buildUserPrompt(
  blueprint: LessonBlueprint,
  ctx: LessonGenerationContext,
): string {
  const adaptation =
    ctx.previousLessonOutcomes.length > 0
      ? ctx.previousLessonOutcomes
          .map((o) => {
            const mistakes =
              o.mistakes.length > 0
                ? ` Mistakes: ${o.mistakes.map((m) => m.concept).join(', ')}.`
                : '';
            return `- ${o.continuitySummary}${mistakes}`;
          })
          .join('\n')
      : 'First lesson in sequence.';

  return `Materialize this lesson from the blueprint.

Blueprint objective: ${blueprint.primaryObjective}
Blueprint title: ${blueprint.title}
Key ideas: ${blueprint.keyIdeas.join('; ')}
Prerequisite recall plan: ${blueprint.prerequisiteRecall.join('; ')}
Explanation plan: ${blueprint.explanationPlan.join(' | ')}
Example plan: ${blueprint.examplePlan.join(' | ')}
Interactions: ${blueprint.interactionPlan.map((i) => `${i.type}: ${i.conceptTested}`).join('; ')}
Misconceptions: ${blueprint.misconceptionChecks.map((m) => m.misconception).join('; ') || 'none'}
Application: ${blueprint.applicationPlan.join(' | ')}
Summary: ${blueprint.summaryPoints.join('; ')}
Previous connection: ${blueprint.previousLessonConnection ?? 'n/a'}
Next connection: ${blueprint.nextLessonConnection ?? 'n/a'}
Estimated minutes: ${blueprint.estimatedMinutes}

Roadmap: ${ctx.roadmapTitle}
Mastery: ${ctx.masteryLevel}/5
${ctx.learningPreferences ? `Preferences: ${ctx.learningPreferences}` : ''}

Continuity from prior lessons:
${adaptation}

Known misconceptions: ${ctx.knownMisconceptions.join('; ') || 'none'}
${ctx.sourceExcerpt ? `\nSource excerpt (use terminology, stay faithful):\n${ctx.sourceExcerpt}` : ''}

If prior mistakes exist, add brief targeted recall. Do not reteach what the learner mastered.`;
}

function buildRepairPrompt(
  blueprint: LessonBlueprint,
  ctx: LessonGenerationContext,
  errors: string[],
): string {
  return `${buildUserPrompt(blueprint, ctx)}

Validation failed:
${errors.map((e) => `- ${e}`).join('\n')}

Return corrected JSON. Fix all validation errors. Keep 6-10 cards in the required sequence.`;
}

function validateCard(raw: Record<string, unknown>): LessonCard | null {
  const type = asString(raw.type);
  const id = asString(raw.id) || undefined;

  if (type === 'hook') {
    const title = asString(raw.title);
    const body = asString(raw.body);
    if (!title || !body) return null;
    return { type: 'hook', id, title, body };
  }
  if (type === 'recall') {
    const prompt = asString(raw.prompt);
    const body = asString(raw.body);
    if (!prompt || !body) return null;
    return { type: 'recall', id, prompt, body };
  }
  if (type === 'explanation') {
    const title = asString(raw.title);
    const body = asString(raw.body);
    if (!title || !body) return null;
    return {
      type: 'explanation',
      id,
      title,
      body,
      keyTerm: asString(raw.keyTerm) || undefined,
      keyTermDef: asString(raw.keyTermDef) || undefined,
    };
  }
  if (type === 'example') {
    const title = asString(raw.title);
    const body = asString(raw.body);
    if (!title || !body) return null;
    return { type: 'example', id, title, body };
  }
  if (type === 'summary') {
    const points = Array.isArray(raw.points)
      ? raw.points.map((p) => asString(p)).filter(Boolean)
      : [];
    if (points.length === 0) return null;
    return {
      type: 'summary',
      id,
      title: asString(raw.title) || undefined,
      points,
    };
  }
  if (type === 'next_connection') {
    const body = asString(raw.body);
    if (!body) return null;
    return {
      type: 'next_connection',
      id,
      body,
      nextTitle: asString(raw.nextTitle) || undefined,
    };
  }

  const mcTypes = ['quiz', 'application', 'misconception', 'prediction'] as const;
  if (mcTypes.includes(type as (typeof mcTypes)[number])) {
    const question = asString(raw.question);
    const options = Array.isArray(raw.options)
      ? raw.options.map((o) => asString(o)).filter(Boolean)
      : [];
    const answerIndex = Number(raw.answerIndex);
    const explanation = asString(raw.explanation);
    if (!question || options.length < 2 || !Number.isInteger(answerIndex)) return null;
    if (answerIndex < 0 || answerIndex >= options.length || !explanation) return null;

    if (type === 'misconception') {
      const misconception = asString(raw.misconception);
      if (!misconception) return null;
      return { type: 'misconception', id, misconception, question, options, answerIndex, explanation };
    }
    if (type === 'prediction') {
      const scenario = asString(raw.scenario);
      if (!scenario) return null;
      return { type: 'prediction', id, scenario, question, options, answerIndex, explanation };
    }
    if (type === 'application') {
      return { type: 'application', id, question, options, answerIndex, explanation };
    }
    return { type: 'quiz', id, question, options, answerIndex, explanation };
  }

  if (type === 'truefalse') {
    const statement = asString(raw.statement);
    const answer = raw.answer;
    const explanation = asString(raw.explanation);
    if (!statement || typeof answer !== 'boolean' || !explanation) return null;
    return { type: 'truefalse', id, statement, answer, explanation };
  }
  if (type === 'fillblank') {
    const sentence = asString(raw.sentence);
    const options = Array.isArray(raw.options)
      ? raw.options.map((o) => asString(o)).filter(Boolean)
      : [];
    const answerIndex = Number(raw.answerIndex);
    const explanation = asString(raw.explanation);
    if (!sentence.includes('___') || options.length < 2 || !explanation) return null;
    return { type: 'fillblank', id, sentence, options, answerIndex, explanation };
  }
  if (type === 'matching') {
    const prompt = asString(raw.prompt);
    const pairs = Array.isArray(raw.pairs)
      ? raw.pairs
          .map((p) => {
            if (!p || typeof p !== 'object') return null;
            const r = p as Record<string, unknown>;
            const left = asString(r.left);
            const right = asString(r.right);
            return left && right ? { left, right } : null;
          })
          .filter(Boolean) as { left: string; right: string }[]
      : [];
    const explanation = asString(raw.explanation);
    if (!prompt || pairs.length < 2 || !explanation) return null;
    return { type: 'matching', id, prompt, pairs, explanation };
  }
  if (type === 'ordering') {
    const prompt = asString(raw.prompt);
    const items = Array.isArray(raw.items)
      ? raw.items.map((i) => asString(i)).filter(Boolean)
      : [];
    const explanation = asString(raw.explanation);
    if (!prompt || items.length < 2 || !explanation) return null;
    return { type: 'ordering', id, prompt, items, explanation };
  }

  return null;
}

function parseLessonFromResponse(
  raw: string,
  blueprint: LessonBlueprint,
): { draft: GeneratedLessonDraft & { primaryObjective: string }; errors: string[] } {
  const obj = parseJsonObject(raw);
  const rawCards = Array.isArray(obj.cards) ? obj.cards : [];
  const cards: LessonCard[] = [];
  for (const c of rawCards) {
    if (!c || typeof c !== 'object') continue;
    const card = validateCard(c as Record<string, unknown>);
    if (card) cards.push(card);
  }

  const withIds = assignCardIds(cards);
  const errors = validateMaterializedLesson(withIds, blueprint);
  const minutes = asNum(obj.minutes, blueprint.estimatedMinutes);

  return {
    draft: {
      title: asString(obj.title) || blueprint.title,
      subtitle: asString(obj.subtitle) || '',
      minutes: Math.min(10, Math.max(3, minutes)),
      cards: withIds,
      primaryObjective: asString(obj.primaryObjective) || blueprint.primaryObjective,
    },
    errors,
  };
}

export async function generateLessonFromBlueprint(
  config: AiConfig,
  blueprint: LessonBlueprint,
  ctx: LessonGenerationContext,
): Promise<GeneratedLessonDraft & { primaryObjective: string }> {
  let content = await requestJsonCompletion(
    config,
    SYSTEM_PROMPT,
    buildUserPrompt(blueprint, ctx),
    6144,
  );

  let result = parseLessonFromResponse(content, blueprint);
  if (result.errors.length > 0) {
    content = await requestJsonCompletion(
      config,
      SYSTEM_PROMPT,
      buildRepairPrompt(blueprint, ctx, result.errors),
      6144,
    );
    result = parseLessonFromResponse(content, blueprint);
    if (result.errors.length > 0) {
      throw new AiError(
        `Could not build a valid lesson: ${result.errors.slice(0, 3).join('; ')}`,
      );
    }
  }

  return result.draft;
}
