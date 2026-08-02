#!/usr/bin/env npx tsx
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { Server } from 'node:http';
import type { ServerConfig } from '../server/src/config';
import { initDatabase } from '../server/src/db';
import { ApiError } from '../server/src/api/apiError';
import { sendError } from '../server/src/api/http';
import { createRetrievalRouter } from '../server/src/api/routes/retrieval';
import {
  createOutcome,
} from '../server/src/outcomes/outcomeRepository';
import {
  createRoadmap,
  getRoadmap,
  listRoadmaps,
  upsertGeneratedLesson,
} from '../server/src/api/repository';
import {
  createReviewSetFromLesson,
  seedRetrievalItems,
} from '../server/src/retrieval/retrievalRepository';
import { repairInvalidReviewMaterial } from '../server/src/retrieval/reviewIntegrityRepair';
import { runTool } from '../server/src/mcp/toolSchemas';
import { mergeRoadmapSummary } from '../src/storage/backendCache';
import { roadmapStats } from '../src/utils/roadmapProgress';
import type { GeneratedRoadmap, RoadmapSummary } from '../src/types/roadmap';

const root = mkdtempSync(path.join(tmpdir(), 'microlearn-review-integrity-'));
const config: ServerConfig = {
  nodeEnv: 'test',
  port: 0,
  dbPath: path.join(root, 'test.db'),
  serviceName: 'microlearn-review-integrity-test',
  repoRoot: process.cwd(),
  enableWriteTools: true,
  enableGitPush: false,
  requireAuth: false,
  mcpBearerToken: '',
  apiBearerToken: '',
  oauthIssuer: '',
  oauthAudience: '',
  oauthResourceUrl: '',
};

function lessonJson(title: string) {
  return {
    title,
    cards: [
      {
        id: `${title}-alpha`,
        type: 'concept',
        title: 'Alpha',
        keyTerm: 'Alpha',
        body: 'Alpha describes foundational systems and reliable behavior.',
        keyTermDef: 'Alpha describes foundational systems and reliable behavior.',
      },
      {
        id: `${title}-beta`,
        type: 'concept',
        title: 'Beta',
        keyTerm: 'Beta',
        body: 'Beta explains practical relationships between changing values.',
        keyTermDef: 'Beta explains practical relationships between changing values.',
      },
      {
        id: `${title}-quiz`,
        type: 'quiz',
        question: 'Which idea is foundational?',
        options: ['Alpha', 'Gamma'],
        answerIndex: 0,
        explanation: 'Alpha is foundational.',
      },
    ],
  };
}

function expectCode(action: () => unknown, code: string): void {
  assert.throws(action, (error: unknown) => error instanceof ApiError && error.code === code);
}

function insertCompletedEvent(db: ReturnType<typeof initDatabase>, lessonId: string): void {
  db.prepare(
    `INSERT INTO learning_events (id, event_type, timestamp, lesson_id, source, metadata_json)
     VALUES (?, 'lesson_completed', ?, ?, 'verification', '{}')`,
  ).run(randomUUID(), new Date().toISOString(), lessonId);
}

async function main(): Promise<void> {
  const db = initDatabase(config);
  let server: Server | undefined;
  try {
  const roadmapId = 'roadmap-15';
  createRoadmap(db, {
    id: roadmapId,
    title: 'Fifteen lesson roadmap',
    topic: 'Integrity',
    goal: 'Verify review and progress integrity',
    description: 'Temporary verification data',
    masteryLevel: 3,
    depth: 'standard',
    units: [
      {
        id: 'unit-1',
        title: 'Integrity unit',
        description: 'Fifteen lessons',
        order: 0,
        lessons: Array.from({ length: 15 }, (_, index) => ({
          id: `node-${index + 1}`,
          title: `Lesson ${index + 1}`,
          shortDescription: 'Verification lesson',
          learningObjective: `Complete objective ${index + 1}`,
          estimatedMinutes: 5,
          difficulty: 1,
          order: index,
          prerequisiteIds: index === 0 ? [] : [`node-${index}`],
          keyIdeas: ['integrity'],
          status: index === 0 ? 'completed' : 'locked',
        })),
      },
    ],
  });

  for (let index = 1; index <= 15; index += 1) {
    upsertGeneratedLesson(db, {
      id: `lesson-${index}`,
      roadmapId,
      lessonNodeId: `node-${index}`,
      lessonJson: lessonJson(`Lesson ${index}`),
      subjectId: 'computer-science',
      topic: 'Integrity',
      title: `Lesson ${index}`,
    });
  }

  let reviewable = 0;
  for (let index = 1; index <= 15; index += 1) {
    try {
      seedRetrievalItems(db, { lessonId: `lesson-${index}`, actor: 'verification' });
      reviewable += 1;
    } catch (error) {
      assert(error instanceof ApiError && error.code === 'LESSON_NOT_COMPLETED');
    }
  }
  assert.equal(reviewable, 1, 'only the completed lesson may create review material');

  const app = express();
  app.use(express.json());
  app.use('/api/retrieval', createRetrievalRouter(db));
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    sendError(res, error);
  });
  server = app.listen();
  const port = await new Promise<number>((resolve, reject) => {
    server!.once('listening', () => {
      const address = server!.address();
      if (address && typeof address === 'object') resolve(address.port);
      else reject(new Error('Temporary REST server did not bind.'));
    });
    server!.once('error', reject);
  });
  const restResponse = await fetch(`http://127.0.0.1:${port}/api/retrieval/review-sets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lessonId: 'lesson-4' }),
  });
  const restBody = (await restResponse.json()) as { error: { code: string; message: string } };
  assert.equal(restResponse.status, 409);
  assert.equal(restBody.error.code, 'LESSON_NOT_COMPLETED');
  assert.equal(restBody.error.message, 'Complete this lesson before adding it to review.');

  const mcpResult = await runTool(() =>
    seedRetrievalItems(db, { lessonId: 'lesson-5', actor: 'mcp' }),
  );
  assert.equal(mcpResult.isError, true);
  assert.match(
    mcpResult.content[0].type === 'text' ? mcpResult.content[0].text : '',
    /LESSON_NOT_COMPLETED/,
  );
  expectCode(
    () => seedRetrievalItems(db, { lessonId: 'lesson-6', actor: 'trusted-automation' }),
    'LESSON_NOT_COMPLETED',
  );
  expectCode(
    () => seedRetrievalItems(db, { lessonId: 'lesson-7', actor: 'automation-worker' }),
    'LESSON_NOT_COMPLETED',
  );

  upsertGeneratedLesson(db, {
    id: 'standalone-incomplete',
    lessonJson: lessonJson('Standalone incomplete'),
    subjectId: 'computer-science',
    topic: 'Integrity',
    title: 'Standalone incomplete',
  });
  expectCode(
    () => createReviewSetFromLesson(db, { lessonId: 'standalone-incomplete' }),
    'LESSON_NOT_COMPLETED',
  );
  insertCompletedEvent(db, 'standalone-incomplete');
  assert(createReviewSetFromLesson(db, { lessonId: 'standalone-incomplete' }).created > 0);

  createOutcome(db, {
    roadmapId,
    lessonNodeId: 'node-2',
    lessonId: 'lesson-2',
    outcome: { accuracy: 1 },
  });
  assert(createReviewSetFromLesson(db, { lessonId: 'lesson-2' }).created > 0);
  insertCompletedEvent(db, 'lesson-3');
  assert(createReviewSetFromLesson(db, { lessonId: 'lesson-3' }).created > 0);

  db.prepare("UPDATE retrieval_items SET status='deleted' WHERE lesson_id='lesson-1'").run();
  const first = createReviewSetFromLesson(db, { lessonId: 'lesson-1' });
  assert(first.created > 0);
  const duplicate = createReviewSetFromLesson(db, { lessonId: 'lesson-1' });
  assert.equal(duplicate.created, 0);
  assert.equal(duplicate.existing, duplicate.totalCandidates);
  assert.equal(
    (db.prepare("SELECT COUNT(*) AS count FROM review_sets WHERE lesson_id='lesson-1' AND status='active'").get() as { count: number }).count,
    1,
  );

  const removedId = duplicate.items[0].id;
  db.prepare("UPDATE retrieval_items SET status='deleted' WHERE id=?").run(removedId);
  const partial = createReviewSetFromLesson(db, { lessonId: 'lesson-1' });
  assert.equal(partial.created, 1);
  assert.equal(partial.existing, partial.totalCandidates - 1);

  const forced = createReviewSetFromLesson(db, { lessonId: 'lesson-1', force: true });
  assert.equal(forced.created, forced.totalCandidates);
  assert.equal(
    (db.prepare("SELECT COUNT(*) AS count FROM review_sets WHERE lesson_id='lesson-1' AND status='active'").get() as { count: number }).count,
    1,
  );

  upsertGeneratedLesson(db, {
    id: 'concurrent-complete',
    lessonJson: lessonJson('Concurrent complete'),
    subjectId: 'computer-science',
    topic: 'Integrity',
    title: 'Concurrent complete',
  });
  insertCompletedEvent(db, 'concurrent-complete');
  const concurrent = await Promise.all([
    Promise.resolve().then(() =>
      createReviewSetFromLesson(db, { lessonId: 'concurrent-complete' }),
    ),
    Promise.resolve().then(() =>
      createReviewSetFromLesson(db, { lessonId: 'concurrent-complete' }),
    ),
  ]);
  assert.equal(
    (db.prepare("SELECT COUNT(*) AS count FROM review_sets WHERE lesson_id='concurrent-complete' AND status='active'").get() as { count: number }).count,
    1,
  );
  assert.equal(concurrent[0].totalCandidates, concurrent[1].totalCandidates);

  const activeSource = db
    .prepare('SELECT source_ref FROM retrieval_items WHERE id = ?')
    .get(forced.items[0].id) as { source_ref: string };
  db.prepare(
    `INSERT INTO retrieval_items (
       id, lesson_id, source_type, source_ref, item_type, prompt, status, due_at,
       reps, lapses, ease, interval_days, created_at, updated_at
     ) VALUES (?, 'lesson-1', 'verification', ?, 'recall', 'Historical prompt', 'deleted', ?,
       0, 0, 2.5, 0, ?, ?)`,
  ).run(randomUUID(), activeSource.source_ref, new Date().toISOString(), new Date().toISOString(), new Date().toISOString());

  upsertGeneratedLesson(db, {
    id: 'preseeded-complete',
    lessonJson: lessonJson('Preseeded complete'),
    subjectId: 'computer-science',
    topic: 'Integrity',
    title: 'Preseeded complete',
  });
  insertCompletedEvent(db, 'preseeded-complete');
  const seeded = seedRetrievalItems(db, { lessonId: 'preseeded-complete' });
  const reused = createReviewSetFromLesson(db, { lessonId: 'preseeded-complete' });
  assert(seeded.created > 0);
  assert(reused.existing > 0);
  assert(reused.created < reused.totalCandidates);

  const summaries = listRoadmaps(db);
  const summary = summaries.find((item) => item.id === roadmapId);
  assert(summary);
  assert.equal(summary.unitCount, 1);
  assert.equal(summary.lessonCount, 15);
  assert.equal(summary.completedLessonCount, 1);
  assert(Math.abs(summary.progress - 1 / 15) < 0.000001);
  assert.equal(getRoadmap(db, roadmapId).units[0].lessons.length, 15);

  const local = getRoadmap(db, roadmapId) as GeneratedRoadmap;
  const staleSummary = {
    ...summary,
    completedLessonCount: 0,
    progress: 0,
  } as RoadmapSummary;
  const merged = mergeRoadmapSummary(local, staleSummary);
  assert.equal(merged.units[0].lessons.length, 15);
  assert.equal(merged.units[0].lessons[0].status, 'completed');
  assert.deepEqual(roadmapStats(merged), {
    completed: 1,
    total: 15,
    pct: 1 / 15,
    remainingMinutes: 70,
  });

  const ts = new Date().toISOString();
  db.prepare(
    `INSERT INTO review_sets
      (id, lesson_id, title, strategy, status, due_at, created_at, updated_at)
     VALUES ('invalid-set', 'lesson-8', 'Invalid', 'verification', 'active', ?, ?, ?)`,
  ).run(ts, ts, ts);
  db.prepare(
    `INSERT INTO retrieval_items (
       id, review_set_id, lesson_id, source_type, source_ref, item_type, prompt, status,
       due_at, reps, lapses, ease, interval_days, created_at, updated_at
     ) VALUES ('invalid-item', 'invalid-set', 'lesson-8', 'verification', 'invalid-ref',
       'recall', 'Invalid prompt', 'active', ?, 0, 0, 2.5, 0, ?, ?)`,
  ).run(ts, ts, ts);
  const dryRun = repairInvalidReviewMaterial(db);
  assert.equal(dryRun.applied, false);
  assert(dryRun.lessons.some((item) => item.lessonId === 'lesson-8'));
  assert.equal(
    (db.prepare("SELECT status FROM review_sets WHERE id='invalid-set'").get() as { status: string }).status,
    'active',
  );
  const applied = repairInvalidReviewMaterial(db, { apply: true, actor: 'verification' });
  assert.equal(applied.applied, true);
  assert.equal(
    (db.prepare("SELECT status FROM review_sets WHERE id='invalid-set'").get() as { status: string }).status,
    'deleted',
  );
  assert.equal(
    (db.prepare("SELECT status FROM review_sets WHERE lesson_id='lesson-1' AND status='active'").get() as { status: string }).status,
    'active',
  );
  assert.equal(
    (db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE action='soft_delete_invalid_review_material'").get() as { count: number }).count > 0,
    true,
  );

  const activeSourceIndex = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_retrieval_items_source_ref_active'")
    .get() as { sql: string } | undefined;
  assert.match(activeSourceIndex?.sql ?? '', /WHERE status != 'deleted'/);

  console.log('Review integrity and roadmap progress verification passed.');
  } finally {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
