import { buildDefaultLessonPlan, assembleHeavyLesson, createLessonChunks } from '../src/ai/heavyLessonGeneration';
import { calculateRetryBackoffMs, isRetryableProviderStatus } from '../src/ai/jsonCompletion';
import { inferLessonGenerationMode } from '../src/ai/lessonGenerationStrategy';
import { LessonBlueprint } from '../src/types/lessonBlueprint';
import { LessonGenerationContext } from '../src/types/lessonGeneration';
import { repairLessonCards, SUPPORTED_CARD_TYPES } from '../src/utils/contentEngineV2';
import { buildFallbackCardsForPlanChunk } from '../src/utils/roadmapLessonFallback';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const blueprint: LessonBlueprint = {
  id: 'verify-blueprint',
  roadmapId: 'verify-roadmap',
  roadmapNodeId: 'verify-node',
  version: 1,
  title: 'Fourier Transform',
  primaryObjective: 'Understand the Fourier transform as a way to decompose signals.',
  prerequisiteRecall: ['Functions can represent changing quantities.'],
  keyIdeas: ['frequency components', 'time domain', 'frequency domain'],
  explanationPlan: ['Explain domains', 'Explain decomposition'],
  examplePlan: ['Decompose a simple wave'],
  interactionPlan: [{ type: 'multiple_choice', purpose: 'Check the concept', conceptTested: 'frequency domain' }],
  misconceptionChecks: [{ misconception: 'It only applies to sound.', diagnosticQuestion: 'Where is it useful?', correctionGoal: 'Broaden transfer.' }],
  applicationPlan: ['Use the transform to reason about a signal.'],
  summaryPoints: ['Signals can be decomposed', 'Frequency view reveals structure'],
  estimatedMinutes: 8,
  createdAt: '2026-01-01T00:00:00.000Z',
  coreMentalModel: 'A prism for signals.',
};

const ctx: LessonGenerationContext = {
  roadmapId: 'verify-roadmap',
  roadmapTitle: 'Fourier Analysis',
  roadmapGoal: 'Learn Fourier analysis',
  unitTitle: 'Foundations',
  unitDescription: 'Core ideas',
  currentLessonTitle: 'Fourier Transform',
  currentLearningObjective: blueprint.primaryObjective,
  currentKeyIdeas: blueprint.keyIdeas,
  masteryLevel: 5,
  previousLessonOutcomes: [],
  knownMisconceptions: [],
  upcomingLessons: [{ title: 'Inverse Transform', objective: 'Recover the original signal.' }],
  prerequisiteLessons: [{ title: 'Signals', objective: 'Represent signals as functions.' }],
  slidesPerLesson: 12,
};

const light = inferLessonGenerationMode({ slideCount: 5, masteryLevel: 1, topic: 'intro', subject: 'history' });
assert(light === 'light', `Expected light mode, got ${light}`);

const expert = inferLessonGenerationMode({ slideCount: 12, masteryLevel: 5, topic: 'Fourier Transform', subject: 'mathematics' });
assert(expert === 'expert' || expert === 'heavy', `Expected expert/heavy mode, got ${expert}`);

const plan = buildDefaultLessonPlan(blueprint, ctx);
assert(plan.slides.length === 12, 'Default heavy plan should have 12 slides');

const chunks = createLessonChunks(plan);
assert(chunks.length === 4, `Expected 4 chunks, got ${chunks.length}`);
assert(chunks.flatMap((chunk) => chunk.slides.map((slide) => slide.index)).join(',') === '1,2,3,4,5,6,7,8,9,10,11,12', 'Chunking should preserve slide order');

const repaired = repairLessonCards([{ type: 'orientation', title: 'Bad', body: 'Repair me' }]);
assert(repaired[0]?.type === 'explanation', 'Unsupported cards should repair to explanation');

const fallback = buildFallbackCardsForPlanChunk(ctx, plan, chunks[0]);
assert(fallback.length === chunks[0].slides.length, 'Fallback chunk should match chunk size');
assert(fallback.every((card) => (SUPPORTED_CARD_TYPES as readonly string[]).includes(card.type)), 'Fallback cards should use supported types');

const assembled = assembleHeavyLesson(blueprint, ctx, plan, chunks.map((chunk) => buildFallbackCardsForPlanChunk(ctx, plan, chunk)));
assert(assembled.cards.length === 12, `Assembled lesson should have 12 slides, got ${assembled.cards.length}`);

const planningFallback = assembleHeavyLesson(blueprint, ctx, plan, [fallback], {
  mode: 'heavy',
  planningFallbackUsed: true,
});
assert(planningFallback.generationMetadata?.planningFallbackUsed === true, 'Planning fallback metadata should be recorded');
assert(
  planningFallback.generationMetadata?.warnings?.includes('AI provider fallback was used for planning.'),
  'Planning fallback warning should be recorded',
);

const chunkFallback = assembleHeavyLesson(blueprint, ctx, plan, [fallback], {
  mode: 'heavy',
  chunkFallbackIndexes: [3, 4],
});
assert(chunkFallback.generationMetadata?.chunkFallbackIndexes?.join(',') === '3,4', 'Chunk fallback indexes should be recorded');
assert(
  chunkFallback.generationMetadata?.warnings?.includes('AI provider fallback was used for chunks: 3, 4.'),
  'Chunk fallback warning should be recorded',
);

const duplicateTitles = assembleHeavyLesson(
  blueprint,
  ctx,
  { ...plan, slideCount: 3 },
  [[
    { type: 'explanation', id: 'c1', title: 'Overview', body: 'one' },
    { type: 'explanation', id: 'c2', title: 'Overview', body: 'two' },
    { type: 'explanation', id: 'c3', title: 'Overview', body: 'three' },
  ]],
);
const titles = duplicateTitles.cards.map((card) => ('title' in card ? card.title : ''));
assert(titles.join('|') === 'Overview|Overview II|Overview III', `Duplicate titles were not made unique: ${titles.join(', ')}`);

assert(calculateRetryBackoffMs(1, 0) === 1000, 'Attempt 1 backoff should start around 1s');
assert(calculateRetryBackoffMs(2, 0) === 2000, 'Attempt 2 backoff should start around 2s');
assert(calculateRetryBackoffMs(3, 0) === 4000, 'Attempt 3 backoff should start around 4s');
assert(isRetryableProviderStatus(500), '500 should be retryable');
assert(isRetryableProviderStatus(503), '503 should be retryable');
assert(!isRetryableProviderStatus(400), '400 should not be retryable');
assert(!isRetryableProviderStatus(422), 'Validation-like errors should not be retryable');

console.log('[verify-heavy-generation] ok');
