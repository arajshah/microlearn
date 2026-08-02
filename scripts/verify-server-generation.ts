#!/usr/bin/env npx tsx
/**
 * Verifies server-side AI generation with a deterministic fake provider and
 * an in-memory SQLite database. No external network or paid API calls.
 */
import Database from 'better-sqlite3';
import { MIGRATIONS } from '../server/src/db/schema';
import { ApiError } from '../server/src/api/apiError';
import {
  generateRoadmap,
  generateRoadmapNodeLesson,
  generateStandaloneLesson,
  pregenerateRoadmapLessons,
  repairStaleGenerationJobs,
  tutorReply,
} from '../server/src/generation/generationService';
import { createAiGenerationProvider } from '../server/src/generation/provider';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  process.env.MICROLEARN_AI_PROVIDER = 'fake';
  process.env.MICROLEARN_AI_API_KEY = 'fake-key-not-used';

  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const migration of MIGRATIONS) {
    db.exec(migration.sql);
  }

  const provider = createAiGenerationProvider();
  assert(provider.model === 'fake-deterministic-v1', 'expected fake provider');

  let caughtMissing = false;
  const prevKey = process.env.MICROLEARN_AI_API_KEY;
  delete process.env.MICROLEARN_AI_PROVIDER;
  delete process.env.MICROLEARN_AI_API_KEY;
  try {
    createAiGenerationProvider();
  } catch (err) {
    caughtMissing = err instanceof ApiError && err.code === 'AI_CONFIG_MISSING';
  }
  process.env.MICROLEARN_AI_PROVIDER = 'fake';
  process.env.MICROLEARN_AI_API_KEY = prevKey ?? 'fake-key-not-used';
  assert(caughtMissing, 'missing AI key should throw AI_CONFIG_MISSING');

  const roadmap = await generateRoadmap(db, {
    topic: 'Verification Topic',
    goal: 'Verify server generation',
    masteryLevel: 3,
    depth: 'standard',
    lessonCount: 2,
    slidesPerLesson: 6,
  });
  assert(roadmap.id.length > 0, 'roadmap id missing');
  assert(roadmap.units.length > 0, 'roadmap units missing');
  const nodeId = roadmap.units[0]?.lessons[0]?.id;
  assert(typeof nodeId === 'string' && nodeId.length > 0, 'roadmap node id missing');

  const auditRoadmap = db
    .prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action = 'generation.roadmap.created'")
    .get() as { n: number };
  assert(auditRoadmap.n >= 1, 'roadmap audit event missing');

  const lesson = await generateStandaloneLesson(db, {
    subjectId: 'computer-science',
    topic: 'Verification Lesson',
    masteryLevel: 3,
    slideCount: 6,
  });
  assert(lesson.id.length > 0, 'lesson id missing');
  const lessonPayload = lesson.lesson as { cards?: unknown[] };
  assert(Array.isArray(lessonPayload.cards), 'lesson cards missing');

  const nodeResult = await generateRoadmapNodeLesson(db, {
    roadmapId: roadmap.id,
    nodeId,
  });
  assert(nodeResult.lesson.id.length > 0, 'node lesson id missing');
  assert(nodeResult.reused === false, 'first node generation should not reuse');

  const nodeResult2 = await generateRoadmapNodeLesson(db, {
    roadmapId: roadmap.id,
    nodeId,
  });
  assert(nodeResult2.reused === true, 'second node generation should reuse same lesson');
  assert(nodeResult2.lesson.id === nodeResult.lesson.id, 'reused lesson id mismatch');

  const nodeRow = db
    .prepare('SELECT generated_lesson_id, status FROM lesson_nodes WHERE id = ?')
    .get(nodeId) as { generated_lesson_id: string | null; status: string };
  assert(nodeRow.generated_lesson_id === nodeResult.lesson.id, 'node should link generated lesson');
  assert(nodeRow.status === 'active', 'node should be active after generation');

  const blueprintCount = db
    .prepare('SELECT COUNT(*) AS n FROM lesson_blueprints WHERE roadmap_id = ? AND lesson_node_id = ?')
    .get(roadmap.id, nodeId) as { n: number };
  assert(blueprintCount.n >= 1, 'blueprint should be persisted');

  const jobCount = db.prepare('SELECT COUNT(*) AS n FROM generation_jobs').get() as { n: number };
  assert(jobCount.n >= 3, 'generation jobs should be recorded');

  const pregen = await pregenerateRoadmapLessons(db, { roadmapId: roadmap.id, count: 2 });
  assert(Array.isArray(pregen.generated), 'pregen.generated missing');
  assert(Array.isArray(pregen.skipped), 'pregen.skipped missing');

  const reply = await tutorReply(db, {
    messages: [{ role: 'user', content: 'Explain this simply' }],
    context: 'A test card about verification.',
  });
  assert(reply.length > 0, 'tutor reply should be non-empty');

  db.prepare(
    `UPDATE generation_jobs SET status = 'in_progress', updated_at = '2000-01-01T00:00:00.000Z' WHERE id = (
       SELECT id FROM generation_jobs LIMIT 1
     )`,
  ).run();
  db.prepare("UPDATE lesson_nodes SET status = 'generating' WHERE id = ?").run(nodeId);
  const repaired = repairStaleGenerationJobs(db);
  assert(repaired >= 1, 'stale jobs should be repaired');
  const nodeAfterRepair = db.prepare('SELECT status FROM lesson_nodes WHERE id = ?').get(nodeId) as {
    status: string;
  };
  assert(nodeAfterRepair.status === 'error', 'generating node should become error after repair');

  console.log('verify-server-generation: all checks passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
