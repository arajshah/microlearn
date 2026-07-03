import { requestJsonCompletion } from '@/ai/jsonCompletion';
import {
  assignCardIds,
  parseBlueprintObject,
  validateBlueprint,
} from '@/ai/lessonValidation';
import { parseJsonObject } from '@/ai/jsonExtract';
import { AiError } from '@/ai/client';
import { makeBlueprintId } from '@/storage/lessonBlueprintStorage';
import { BLUEPRINT_VERSION, LessonBlueprint } from '@/types/lessonBlueprint';
import { LessonGenerationContext } from '@/types/lessonGeneration';
import { AiConfig } from '@/types/content';

const SYSTEM_PROMPT = `You are an expert curriculum designer creating lesson blueprints for a microlearning app.

Return ONE valid JSON object only — no markdown, no commentary.

Schema:
{
  "title": string,
  "primaryObjective": string (exactly ONE clear objective),
  "prerequisiteRecall": string[] (1-3 brief recall prompts),
  "keyIdeas": string[] (2-5 items),
  "explanationPlan": string[] (2-4 bullet points for core teaching),
  "examplePlan": string[] (1-2 concrete/worked example plans),
  "interactionPlan": [
    {
      "type": "multiple_choice"|"true_false"|"short_answer"|"prediction"|"ordering"|"classification",
      "purpose": string,
      "conceptTested": string
    }
  ],
  "misconceptionChecks": [
    { "misconception": string, "diagnosticQuestion": string, "correctionGoal": string }
  ],
  "applicationPlan": string[] (1-2 transfer/application prompts),
  "summaryPoints": string[] (2-4 concise points),
  "previousLessonConnection": string (optional),
  "nextLessonConnection": string (optional),
  "estimatedMinutes": number (3-8)
}

Rules:
- Exactly ONE primaryObjective — do not list multiple objectives.
- Stay focused on the current lesson only; no unrelated concepts.
- Build on previous lessons without reteaching mastered material unnecessarily.
- Prepare for the next lesson explicitly in nextLessonConnection.
- Include at least 2 interactions in interactionPlan.
- Include misconceptionChecks when the topic has common confusions (0-2 items).
- Do NOT write full lesson prose — plans and outlines only.
- estimatedMinutes must be 3-8.`;

function buildUserPrompt(ctx: LessonGenerationContext): string {
  const prevOutcomes =
    ctx.previousLessonOutcomes.length > 0
      ? ctx.previousLessonOutcomes
          .map(
            (o) =>
              `- ${o.objective}: accuracy ${Math.round(o.accuracy * 100)}%. Summary: ${o.continuitySummary}`,
          )
          .join('\n')
      : 'None yet.';

  const misconceptions =
    ctx.knownMisconceptions.length > 0
      ? ctx.knownMisconceptions.map((m) => `- ${m}`).join('\n')
      : 'None recorded.';

  const prereqs =
    ctx.prerequisiteLessons.length > 0
      ? ctx.prerequisiteLessons.map((l) => `- ${l.title}: ${l.objective}`).join('\n')
      : 'None.';

  const upcoming =
    ctx.upcomingLessons.length > 0
      ? ctx.upcomingLessons.map((l) => `- ${l.title}: ${l.objective}`).join('\n')
      : 'None (final lesson).';

  return `Create a lesson blueprint.

Roadmap: "${ctx.roadmapTitle}"
Goal: ${ctx.roadmapGoal}
Unit: ${ctx.unitTitle} — ${ctx.unitDescription}
Lesson: "${ctx.currentLessonTitle}"
Required objective: ${ctx.currentLearningObjective}
Key ideas: ${ctx.currentKeyIdeas.join('; ')}
Mastery level: ${ctx.masteryLevel}/5
${ctx.learningPreferences ? `Preferences: ${ctx.learningPreferences}` : ''}

Prerequisite lessons:
${prereqs}

Previous lesson outcomes:
${prevOutcomes}

Known misconceptions to watch:
${misconceptions}

Upcoming lessons:
${upcoming}
${ctx.sourceExcerpt ? `\nRelevant source excerpt (preserve terminology, do not invent source claims):\n${ctx.sourceExcerpt}` : ''}
${ctx.sourceContext ? `\nSource: "${ctx.sourceContext.sourceTitle}" (${ctx.sourceContext.sourceUrl})` : ''}

Adapt the blueprint:
- Briefly recall weak areas from previous outcomes if relevant.
- Do not repeat concepts the learner answered correctly.
- Use consistent terminology from prior lessons.
- If a prior misconception was observed, include a targeted misconception check.`;
}

function buildRepairPrompt(ctx: LessonGenerationContext, errors: string[]): string {
  return `${buildUserPrompt(ctx)}

Your previous blueprint failed validation:
${errors.map((e) => `- ${e}`).join('\n')}

Return corrected JSON only. Fix all errors. Keep exactly one primaryObjective matching: "${ctx.currentLearningObjective}".`;
}

export async function generateLessonBlueprint(
  config: AiConfig,
  ctx: LessonGenerationContext,
  roadmapNodeId: string,
): Promise<LessonBlueprint> {
  const content = await requestJsonCompletion(
    config,
    SYSTEM_PROMPT,
    buildUserPrompt(ctx),
    4096,
  );

  let result = parseBlueprintObject(parseJsonObject(content), {
    roadmapId: ctx.roadmapId,
    roadmapNodeId,
    expectedObjective: ctx.currentLearningObjective,
    expectedTitle: ctx.currentLessonTitle,
  });

  if (result.errors.length > 0) {
    const repaired = await requestJsonCompletion(
      config,
      SYSTEM_PROMPT,
      buildRepairPrompt(ctx, result.errors),
      4096,
    );
    result = parseBlueprintObject(parseJsonObject(repaired), {
      roadmapId: ctx.roadmapId,
      roadmapNodeId,
      expectedObjective: ctx.currentLearningObjective,
      expectedTitle: ctx.currentLessonTitle,
    });
    if (result.errors.length > 0) {
      throw new AiError(
        `Could not build a valid blueprint: ${result.errors.slice(0, 3).join('; ')}`,
      );
    }
  }

  const validationErrors = validateBlueprint(
    result.blueprint,
    ctx.currentLearningObjective,
  );
  if (validationErrors.length > 0) {
    throw new AiError(
      `Blueprint validation failed: ${validationErrors.slice(0, 3).join('; ')}`,
    );
  }

  return {
    ...result.blueprint,
    id: makeBlueprintId(),
    version: BLUEPRINT_VERSION,
    createdAt: new Date().toISOString(),
  };
}

/** Re-export for tests. */
export { validateMaterializedLesson } from '@/ai/lessonValidation';
