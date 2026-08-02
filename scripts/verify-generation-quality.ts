#!/usr/bin/env npx tsx
/**
 * Verifies high-quality server generation pipeline with deterministic fake provider.
 * No external network or paid API calls.
 */
import Database from 'better-sqlite3';
import { MIGRATIONS } from '../server/src/db/schema';
import { patchLessonNode } from '../server/src/api/repository';
import {
  generateRoadmap,
  generateRoadmapNodeLesson,
  generateStandaloneLesson,
} from '../server/src/generation/generationService';
import { evaluateLessonQuality } from '../server/src/generation/quality';
import { countCardVariety, countInteractiveCards } from '../server/src/generation/validation';
import { LESSON_GENERATION_PROMPT_VERSION, ROADMAP_PROMPT_VERSION } from '../server/src/generation/versions';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  process.env.MICROLEARN_AI_PROVIDER = 'fake';
  process.env.MICROLEARN_AI_API_KEY = 'fake-key-not-used';

  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const migration of MIGRATIONS) db.exec(migration.sql);

  const roadmap = await generateRoadmap(db, {
    topic: 'Transformer Attention',
    goal: 'Understand scaled dot-product attention and inference systems',
    masteryLevel: 4,
    depth: 'deep',
    lessonCount: 2,
    slidesPerLesson: 10,
  });
  assert(roadmap.units.length >= 1, 'roadmap should have units');
  const flatLessons = roadmap.units.flatMap((u) => u.lessons);
  assert(flatLessons.length === 2, 'roadmap should have 2 lessons');
  const node1 = flatLessons[0].id;
  const node2 = flatLessons[1].id;

  const standalone = await generateStandaloneLesson(db, {
    subjectId: 'computer-science',
    subjectTitle: 'Machine Learning',
    topic: 'Gradient Descent',
    masteryLevel: 3,
    slideCount: 8,
    sourceText:
      'Gradient descent iteratively updates parameters θ using the negative gradient of a loss function L(θ). Learning rate η controls step size.',
    sourceTitle: 'Optimization Notes',
  });
  const standaloneCards = (standalone.lesson as { cards?: unknown[] }).cards ?? [];
  assert(standaloneCards.length >= 6, 'standalone lesson should have rich card count');
  assert(countCardVariety(standaloneCards as never) >= 4, 'standalone lesson should have card variety');
  assert(countInteractiveCards(standaloneCards as never) >= 1, 'standalone lesson should have checks');

  const sourceLesson = await generateStandaloneLesson(db, {
    subjectId: 'computer-science',
    topic: 'vLLM Inference',
    masteryLevel: 4,
    slideCount: 10,
    sourceText:
      'vLLM uses PagedAttention to manage KV cache memory efficiently during LLM inference serving. Throughput improves by reducing memory fragmentation.',
    sourceTitle: 'vLLM Paper Summary',
    sourceUrl: 'https://example.com/vllm',
  });
  assert(sourceLesson.id.length > 0, 'source-grounded lesson persisted');

  const nodeResult1 = await generateRoadmapNodeLesson(db, {
    roadmapId: roadmap.id,
    nodeId: node1,
  });
  assert(nodeResult1.reused === false, 'first node generation should create lesson');
  const lesson1Cards = (nodeResult1.lesson.lesson as { cards?: unknown[] }).cards ?? [];
  assert(lesson1Cards.length >= 6, 'roadmap lesson 1 should be rich');

  patchLessonNode(db, roadmap.id, node1, { status: 'completed' });
  patchLessonNode(db, roadmap.id, node2, { status: 'available' });

  const nodeResult2 = await generateRoadmapNodeLesson(db, {
    roadmapId: roadmap.id,
    nodeId: node2,
  });
  assert(nodeResult2.lesson.id.length > 0, 'roadmap lesson 2 persisted');

  const nodeResult1Again = await generateRoadmapNodeLesson(db, {
    roadmapId: roadmap.id,
    nodeId: node1,
  });
  assert(nodeResult1Again.reused === true, 'idempotent node generation');

  const blueprintCount = db
    .prepare('SELECT COUNT(*) AS n FROM lesson_blueprints WHERE roadmap_id = ?')
    .get(roadmap.id) as { n: number };
  assert(blueprintCount.n >= 2, 'blueprints should be persisted');

  const quality = evaluateLessonQuality({
    draft: {
      title: standalone.title ?? 'Gradient Descent',
      subtitle: '',
      minutes: 8,
      primaryObjective: 'Understand gradient descent',
      conceptTags: ['gradient-descent'],
      skillTags: ['analysis'],
      cards: standaloneCards as never,
    },
    blueprint: {
      id: 'b1',
      roadmapId: '',
      roadmapNodeId: '',
      version: 2,
      title: 'Gradient Descent',
      primaryObjective: 'Understand gradient descent',
      prerequisiteRecall: [],
      keyIdeas: ['gradient-descent'],
      explanationPlan: ['Explain update rule'],
      examplePlan: ['Numeric example'],
      interactionPlan: [{ type: 'multiple_choice', purpose: 'Check', conceptTested: 'gradient-descent' }],
      misconceptionChecks: [],
      applicationPlan: ['Apply to simple loss'],
      summaryPoints: ['Summary point'],
      estimatedMinutes: 8,
      createdAt: new Date().toISOString(),
    },
    ctx: {
      roadmapId: '',
      roadmapTitle: 'Optimization',
      roadmapGoal: 'Learn optimization',
      unitTitle: 'Unit',
      unitDescription: '',
      currentLessonTitle: 'Gradient Descent',
      currentLearningObjective: 'Understand gradient descent',
      currentKeyIdeas: ['gradient-descent'],
      masteryLevel: 3,
      previousLessonOutcomes: [],
      knownMisconceptions: [],
      upcomingLessons: [],
      prerequisiteLessons: [],
    },
  });
  assert(quality.score >= 60, `quality score should pass threshold, got ${quality.score}`);

  const auditCount = db
    .prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action LIKE 'generation.%'")
    .get() as { n: number };
  assert(auditCount.n >= 4, 'audit events should be written');

  console.log('verify-generation-quality: all checks passed');
  console.log(`  roadmap prompt version: ${ROADMAP_PROMPT_VERSION}`);
  console.log(`  lesson prompt version: ${LESSON_GENERATION_PROMPT_VERSION}`);
  console.log(`  quality score sample: ${quality.score}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
