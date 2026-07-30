import { requestJsonCompletion } from '@/ai/jsonCompletion';
import { generateLessonBatched } from '@/ai/heavyLessonGeneration';
import { inferLessonGenerationMode } from '@/ai/lessonGenerationStrategy';
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
import { SUPPORTED_CARD_TYPES } from '@/utils/contentEngineV2';
import { extractLearningMetadata, normalizeConceptSlug } from '@/utils/conceptTags';
import { repairAndValidateLesson } from '@/utils/contentQuality';
import { parseDiagramJson } from '@/utils/diagramFromDescription';

const SUPPORTED_TYPES_LIST = SUPPORTED_CARD_TYPES.join('|');

function buildSystemPrompt(slidesPerLesson?: number): string {
  const target = slidesPerLesson ?? 8;
  const minSlides = Math.max(3, target - 1);
  const maxSlides = Math.min(20, target + 1);
  const deep = target >= 10;

  const deepStructure = deep
    ? `
For deep lessons (~12 slides), follow this sequence:
1. hook
2. recall or explanation
3. visual_model
4. formula OR formal explanation
5. derivation OR worked_example
6. explanation
7. worked_example OR application
8. misconception_check
9. application OR quiz
10. compare_contrast OR application note
11. summary
12. next_connection`
    : '';

  return `You are an expert microlearning author using Content Engine v2. Materialize a complete lesson from a validated blueprint.

Return ONE valid JSON object only. Do NOT invent new card types.

Supported card types ONLY: ${SUPPORTED_TYPES_LIST}

Schema:
{
  "title": string,
  "subtitle": string,
  "minutes": number,
  "primaryObjective": string,
  "conceptTags": string[],
  "skillTags": string[],
  "prerequisiteConcepts": string[],
  "cards": [ { "id": string, "type": "<supported type>", ...fields } ]
}

Adaptive learning metadata (add to EVERY card; required on graded cards):
- conceptTags: 1-3 lowercase-hyphenated concept slugs, e.g. ["fourier-transform","frequency-domain"]
- skillTags: optional skills exercised, e.g. ["symbol-manipulation"]
- weaknessTags: optional specific failure modes this card detects
- cognitiveLevel: one of recall | understand | apply | analyze | synthesize
- estimatedDifficulty: integer 1-5
Reuse the same concept slug across cards that teach the same idea so mastery aggregates correctly.

Type field reference:
- hook: { title, body }
- recall: { prompt, body }
- explanation: { title, body, keyTerm?, keyTermDef? }
- example: { title, body }
- visual_model: { title, visualDescription, body, takeaway, diagram?: { kind: "flow"|"split"|"timeline"|"hierarchy"|"io"|"ascii", nodes?, edges?, leftTitle?, leftItems?, rightTitle?, rightItems?, steps?, inputLabel?, outputLabel?, ascii? } }
  Put renderable diagram structure in diagram (nodes/edges, split columns, timeline steps, or ascii). Do NOT write prose like "A diagram showing..." — students must see a visual diagram.
- formula: { title, formula, plainEnglish, notation?: [{symbol, meaning}], body? }
- derivation: { title, setup, steps: [{label?, expression?, explanation}], conclusion }
- worked_example: { title, problem, steps: [{label?, work?, explanation}], answer, insight }
- misconception_check: { misconception, question, options[], answerIndex, explanation }
- compare_contrast: { title, leftLabel, rightLabel, points: [{left, right}], takeaway }
- quiz/application/prediction/misconception: question, options (3-4), answerIndex, explanation
- prediction: also scenario
- truefalse: statement, answer (boolean), explanation
- fillblank: sentence with ___, options[], answerIndex, explanation
- matching: prompt, pairs[{left,right}], explanation
- ordering: prompt, items[] (correct order), explanation
- summary: { title?, points[] }
- next_connection: { body, nextTitle? }

Math-heavy topics (Fourier, probability, optimization, linear algebra):
- include formula and derivation OR worked_example
- include notation in formula cards when useful
- include misconception_check

CS/ML topics:
- include worked_example
- include misconception_check
- include compare_contrast when comparing approaches
${deepStructure}

Rules:
- Follow the blueprint EXACTLY.
- Aim for ${target} slides (${minSlides}-${maxSlides} total).
- Every assessment needs valid answerIndex and explanation.
- Do not invent card types like "orientation", "overview", or "diagram".
- Include primaryObjective matching the blueprint.`;
}

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
Core mental model: ${blueprint.coreMentalModel ?? 'infer from key ideas'}
Formal definition: ${blueprint.formalDefinition ?? 'n/a'}
Visual model plan: ${blueprint.visualModel ?? 'n/a'}
Worked example plan: ${blueprint.workedExamplePlan ?? blueprint.examplePlan.join(' | ')}
Misconception targets: ${(blueprint.misconceptionTargets ?? blueprint.misconceptionChecks.map((m) => m.misconception)).join('; ') || 'none'}
Key ideas: ${blueprint.keyIdeas.join('; ')}
Prerequisite recall plan: ${blueprint.prerequisiteRecall.join('; ')}
Explanation plan: ${blueprint.explanationPlan.join(' | ')}
Example plan: ${blueprint.examplePlan.join(' | ')}
Interactions: ${blueprint.interactionPlan.map((i) => `${i.type}: ${i.conceptTested}`).join('; ')}
Application: ${blueprint.applicationPlan.join(' | ')}
Summary: ${blueprint.summaryPoints.join('; ')}
Previous connection: ${blueprint.previousLessonConnection ?? 'n/a'}
Next connection: ${blueprint.nextLessonConnection ?? blueprint.nextBridge ?? 'n/a'}
Estimated minutes: ${blueprint.estimatedMinutes}

Roadmap: ${ctx.roadmapTitle}
Mastery: ${ctx.masteryLevel}/5
${ctx.learningPreferences ? `Preferences: ${ctx.learningPreferences}` : ''}

Continuity from prior lessons:
${adaptation}

Known misconceptions: ${ctx.knownMisconceptions.join('; ') || 'none'}
${ctx.slidesPerLesson ? `Target slides for this lesson: ${ctx.slidesPerLesson}.` : ''}
${ctx.sourceExcerpt ? `\nSource excerpt (use terminology, stay faithful):\n${ctx.sourceExcerpt}` : ''}

Use ONLY supported card types. Output valid JSON only.`;
}

function buildRepairPrompt(
  blueprint: LessonBlueprint,
  ctx: LessonGenerationContext,
  errors: string[],
): string {
  return `${buildUserPrompt(blueprint, ctx)}

Validation failed:
${errors.map((e) => `- ${e}`).join('\n')}

Return corrected JSON. Fix all validation errors. Keep ~${ctx.slidesPerLesson ?? 8} slides. Use ONLY: ${SUPPORTED_TYPES_LIST}.`;
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
  if (type === 'visual_model') {
    const title = asString(raw.title);
    const visualDescription = asString(raw.visualDescription);
    const body = asString(raw.body);
    const takeaway = asString(raw.takeaway);
    if (!title || !visualDescription || !body || !takeaway) return null;
    const diagram = parseDiagramJson(raw.diagram) ?? undefined;
    return { type: 'visual_model', id, title, visualDescription, diagram, body, takeaway };
  }
  if (type === 'formula') {
    const title = asString(raw.title);
    const formula = asString(raw.formula);
    const plainEnglish = asString(raw.plainEnglish);
    if (!title || !formula || !plainEnglish) return null;
    return {
      type: 'formula',
      id,
      title,
      formula,
      plainEnglish,
      body: asString(raw.body) || undefined,
      notation: Array.isArray(raw.notation)
        ? raw.notation
            .map((n) => {
              if (!n || typeof n !== 'object') return null;
              const r = n as Record<string, unknown>;
              const symbol = asString(r.symbol);
              const meaning = asString(r.meaning);
              return symbol && meaning ? { symbol, meaning } : null;
            })
            .filter(Boolean) as { symbol: string; meaning: string }[]
        : undefined,
    };
  }
  if (type === 'derivation' || type === 'worked_example') {
    const title = asString(raw.title);
    if (!title) return null;
    const stepsRaw = Array.isArray(raw.steps) ? raw.steps : [];
    const steps = stepsRaw
      .map((s) => {
        if (!s || typeof s !== 'object') return null;
        const r = s as Record<string, unknown>;
        const explanation = asString(r.explanation);
        if (!explanation) return null;
        return {
          label: asString(r.label) || undefined,
          expression: asString(r.expression) || undefined,
          work: asString(r.work) || undefined,
          explanation,
        };
      })
      .filter(Boolean) as Array<{ label?: string; expression?: string; work?: string; explanation: string }>;
    if (steps.length === 0) return null;

    if (type === 'derivation') {
      const setup = asString(raw.setup);
      const conclusion = asString(raw.conclusion);
      if (!setup || !conclusion) return null;
      return {
        type: 'derivation',
        id,
        title,
        setup,
        steps: steps.map(({ label, expression, explanation }) => ({
          label,
          expression,
          explanation,
        })),
        conclusion,
      };
    }

    const problem = asString(raw.problem);
    const answer = asString(raw.answer);
    const insight = asString(raw.insight);
    if (!problem || !answer || !insight) return null;
    return {
      type: 'worked_example',
      id,
      title,
      problem,
      steps: steps.map(({ label, work, explanation }) => ({ label, work, explanation })),
      answer,
      insight,
    };
  }
  if (type === 'compare_contrast') {
    const title = asString(raw.title);
    const leftLabel = asString(raw.leftLabel);
    const rightLabel = asString(raw.rightLabel);
    const takeaway = asString(raw.takeaway);
    const points = Array.isArray(raw.points)
      ? raw.points
          .map((p) => {
            if (!p || typeof p !== 'object') return null;
            const r = p as Record<string, unknown>;
            const left = asString(r.left);
            const right = asString(r.right);
            return left && right ? { left, right } : null;
          })
          .filter(Boolean) as { left: string; right: string }[]
      : [];
    if (!title || !leftLabel || !rightLabel || !takeaway || points.length === 0) return null;
    return { type: 'compare_contrast', id, title, leftLabel, rightLabel, points, takeaway };
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

  const mcTypes = [
    'quiz',
    'application',
    'misconception',
    'misconception_check',
    'prediction',
  ] as const;
  if (mcTypes.includes(type as (typeof mcTypes)[number])) {
    const question = asString(raw.question);
    const options = Array.isArray(raw.options)
      ? raw.options.map((o) => asString(o)).filter(Boolean)
      : [];
    const answerIndex = Number(raw.answerIndex);
    const explanation = asString(raw.explanation);
    if (!question || options.length < 2 || !Number.isInteger(answerIndex)) return null;
    if (answerIndex < 0 || answerIndex >= options.length || !explanation) return null;

    if (type === 'misconception' || type === 'misconception_check') {
      const misconception = asString(raw.misconception);
      if (!misconception) return null;
      return {
        type: type === 'misconception_check' ? 'misconception_check' : 'misconception',
        id,
        misconception,
        question,
        options,
        answerIndex,
        explanation,
      };
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
  ctx: LessonGenerationContext,
): { draft: GeneratedLessonDraft & { primaryObjective: string }; errors: string[] } {
  const obj = parseJsonObject(raw);
  const rawCards = Array.isArray(obj.cards) ? obj.cards : [];
  const cards: LessonCard[] = [];
  for (const c of rawCards) {
    if (!c || typeof c !== 'object') continue;
    const rawCard = c as Record<string, unknown>;
    const card = validateCard(rawCard);
    if (card) cards.push({ ...card, ...extractLearningMetadata(rawCard, card.type) });
  }

  const withIds = assignCardIds(cards);
  const isFinal = !blueprint.nextLessonConnection && !blueprint.nextBridge;
  const { lesson: repairedLesson, validation } = repairAndValidateLesson(
    {
      id: 'draft',
      title: asString(obj.title) || blueprint.title,
      subtitle: asString(obj.subtitle) || '',
      topic: ctx.currentLessonTitle,
      minutes: asNum(obj.minutes, blueprint.estimatedMinutes),
      cards: withIds,
      subjectId: 'computer-science',
      createdAt: new Date().toISOString(),
      generated: true,
    },
    {
      targetSlideCount: ctx.slidesPerLesson,
      topic: ctx.currentLessonTitle,
      isDeepLesson: (ctx.slidesPerLesson ?? 8) >= 10,
      isFinalLesson: isFinal,
    },
  );

  const structuralErrors = validation.errors;
  const legacyErrors = validateMaterializedLesson(
    repairedLesson.cards,
    blueprint,
    ctx.slidesPerLesson,
  );
  const errors = [...structuralErrors, ...legacyErrors];

  const slugList = (value: unknown, fallback: string[]): string[] => {
    const list = Array.isArray(value)
      ? value.map((v) => normalizeConceptSlug(asString(v))).filter(Boolean)
      : [];
    return list.length > 0 ? [...new Set(list)] : fallback;
  };

  const blueprintConcepts = (blueprint.conceptTags ?? []).map(normalizeConceptSlug).filter(Boolean);
  const cardConcepts = repairedLesson.cards.flatMap((c) => c.conceptTags ?? []);

  return {
    draft: {
      title: repairedLesson.title,
      subtitle: repairedLesson.subtitle,
      minutes: Math.min(10, Math.max(3, repairedLesson.minutes)),
      cards: repairedLesson.cards,
      conceptTags: slugList(obj.conceptTags, [
        ...new Set([...blueprintConcepts, ...cardConcepts]),
      ]).slice(0, 12),
      skillTags: Array.isArray(obj.skillTags)
        ? obj.skillTags.map((s) => asString(s)).filter(Boolean)
        : (blueprint.skillTags ?? []),
      prerequisiteConcepts: slugList(
        obj.prerequisiteConcepts,
        (blueprint.prerequisiteConcepts ?? []).map(normalizeConceptSlug).filter(Boolean),
      ),
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
  const mode = inferLessonGenerationMode({
    slideCount: ctx.slidesPerLesson,
    masteryLevel: ctx.masteryLevel,
    topic: `${ctx.currentLessonTitle} ${ctx.roadmapTitle}`,
    subject: 'computer-science',
    sourceText: ctx.sourceExcerpt,
  });
  if (mode !== 'light') {
    return generateLessonBatched(config, blueprint, ctx, mode);
  }

  console.log('[lesson-gen] mode inferred: light');
  const systemPrompt = buildSystemPrompt(ctx.slidesPerLesson);
  let content = await requestJsonCompletion(
    config,
    systemPrompt,
    buildUserPrompt(blueprint, ctx),
    6144,
  );

  let result = parseLessonFromResponse(content, blueprint, ctx);
  if (result.errors.length > 0) {
    content = await requestJsonCompletion(
      config,
      systemPrompt,
      buildRepairPrompt(blueprint, ctx, result.errors),
      6144,
    );
    result = parseLessonFromResponse(content, blueprint, ctx);
    if (result.errors.length > 0) {
      console.warn('[content-v2] materialization validation issues', result.errors.slice(0, 5));
      if (result.draft.cards.length < 3) {
        throw new AiError(
          `Could not build a valid lesson: ${result.errors.slice(0, 3).join('; ')}`,
        );
      }
    }
  }

  return result.draft;
}
