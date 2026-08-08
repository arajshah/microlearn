#!/usr/bin/env npx tsx
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { z } from 'zod';
import type { ServerConfig } from '../server/src/config';
import { initDatabase } from '../server/src/db';
import { MIGRATIONS } from '../server/src/db/schema';
import * as curriculum from '../server/src/curriculum/curriculumRepository';
import { listRoadmaps as listApiRoadmaps } from '../server/src/api/repository';
import { policyForTool } from '../server/src/mcp/scopePolicy';
import { TOOL_CATALOG } from '../server/src/mcp/toolSchemas';
import {
  completeCurriculumStewardRun,
  beginCurriculumStewardRun,
  failCurriculumStewardRun,
  getCurriculumStewardCharter,
  getCurriculumStewardState,
  getCurriculumStrategy,
  getRecentCurriculumStewardRuns,
  updateCurriculumStewardCharter,
  updateCurriculumStrategy,
} from '../server/src/steward/stewardRepository';
import {
  completeCurriculumStewardRunInput,
  updateCurriculumStrategyInput,
} from '../server/src/mcp/tools/stewardSchemas';

const root = mkdtempSync(path.join(tmpdir(), 'microlearn-steward-'));
const config: ServerConfig = {
  nodeEnv: 'test',
  port: 0,
  dbPath: path.join(root, 'steward.db'),
  serviceName: 'microlearn-steward-test',
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

function expectCode(action: () => unknown, code: string): void {
  assert.throws(
    action,
    (error: unknown) => Boolean(error && typeof error === 'object' && 'code' in error && error.code === code),
  );
}

function strategyInput(summary: string) {
  return {
    summary,
    currentPhase: 'Build durable foundations',
    priorities: ['Linear algebra', 'Implementation practice'],
    deprioritizedAreas: ['Premature specialization'],
    activeHypotheses: ['Retrieval practice will improve transfer'],
    nearTermObjectives: ['Implement attention from first principles'],
    upcomingPlan: ['Finish foundations', 'Run a diagnostic'],
    concerns: ['Keep workload sustainable'],
  };
}

const db = initDatabase(config);
try {
  // Seed and versioning.
  const charter = getCurriculumStewardCharter(db);
  assert.equal(charter.version, 1);
  assert.match(charter.content, /exceptional AI\/ML scientist-engineer capability/);
  const stewardMigration = MIGRATIONS.find((migration) => migration.id === '0012_curriculum_steward');
  assert.ok(stewardMigration);
  db.exec(stewardMigration.sql);
  assert.equal(
    (db.prepare('SELECT COUNT(*) AS count FROM curriculum_steward_charters').get() as { count: number }).count,
    1,
  );
  const charterV2 = updateCurriculumStewardCharter(db, {
    content: `${charter.content}\n\nRevision note: preserve sustainable challenge.`,
    expectedVersion: charter.version,
  });
  assert.equal(charterV2.version, 2);
  expectCode(
    () => updateCurriculumStewardCharter(db, { content: charter.content, expectedVersion: 1 }),
    'VERSION_CONFLICT',
  );

  const initialStrategy = getCurriculumStrategy(db);
  assert.equal(initialStrategy.strategyVersion, 1);
  const strategyV2 = updateCurriculumStrategy(db, {
    ...strategyInput('Prioritize mathematical and implementation foundations.'),
    expectedVersion: 1,
  });
  assert.equal(strategyV2.strategyVersion, 2);
  assert.deepEqual(strategyV2.priorities, ['Linear algebra', 'Implementation practice']);

  // Run lifecycle, no-op, failure, action persistence, overlap guard, and idempotency.
  const firstBegin = beginCurriculumStewardRun(db, { idempotencyKey: 'scheduled-2026-08-08-00' });
  assert.equal(firstBegin.reused, false);
  const duplicateBegin = beginCurriculumStewardRun(db, { idempotencyKey: 'scheduled-2026-08-08-00' });
  assert.equal(duplicateBegin.reused, true);
  assert.equal(duplicateBegin.run.id, firstBegin.run.id);
  expectCode(
    () => beginCurriculumStewardRun(db, { idempotencyKey: 'overlap' }),
    'STEWARD_RUN_IN_PROGRESS',
  );
  const completed = completeCurriculumStewardRun(db, {
    runId: firstBegin.run.id,
    status: 'completed',
    summary: 'Adjusted the near-term curriculum based on weak retrieval evidence.',
    actions: [{
      type: 'updated_strategy',
      entityType: 'curriculum_strategy',
      entityId: strategyV2.id,
      summary: 'Prioritized foundations before inference optimization.',
    }],
    resultingStrategyVersion: strategyV2.strategyVersion,
  });
  assert.equal(completed.run.status, 'completed');
  assert.equal(completed.run.actions.length, 1);

  const noChangeBegin = beginCurriculumStewardRun(db, { idempotencyKey: 'scheduled-2026-08-08-06' });
  const noChange = completeCurriculumStewardRun(db, {
    runId: noChangeBegin.run.id,
    status: 'no_change',
    summary: 'The current curriculum remains appropriate.',
    actions: [],
  });
  assert.equal(noChange.run.status, 'no_change');

  const failedBegin = beginCurriculumStewardRun(db, { idempotencyKey: 'scheduled-2026-08-08-12' });
  const failed = failCurriculumStewardRun(db, {
    runId: failedBegin.run.id,
    errorCode: 'UPSTREAM_UNAVAILABLE',
    errorMessage: 'Bearer sensitive-token-value was unavailable',
  });
  assert.equal(failed.run.status, 'failed');
  assert.ok(failed.run.errorMessage);
  assert.equal(failed.run.errorMessage.includes('sensitive-token-value'), false);

  for (let index = 0; index < 4; index += 1) {
    const run = beginCurriculumStewardRun(db, { idempotencyKey: `bounded-${index}` });
    completeCurriculumStewardRun(db, {
      runId: run.run.id,
      status: 'no_change',
      summary: `No change ${index}`,
    });
  }
  assert.equal(getRecentCurriculumStewardRuns(db, 2).length, 2);

  // Private reasoning and credential-like content are rejected by both schemas and persistence.
  assert.equal(
    z.object(updateCurriculumStrategyInput).safeParse({
      ...strategyInput('Schema rejection'),
      chainOfThought: 'hidden reasoning',
    }).success,
    false,
  );
  assert.equal(
    z.object(completeCurriculumStewardRunInput).safeParse({
      runId: 'run', status: 'no_change', summary: 'No change', reasoning: 'hidden',
    }).success,
    false,
  );
  expectCode(
    () => updateCurriculumStrategy(db, {
      ...strategyInput('Repository rejection'),
      reasoning: 'hidden reasoning',
    } as ReturnType<typeof strategyInput> & { reasoning: string }),
    'PRIVATE_REASONING_NOT_ACCEPTED',
  );
  expectCode(
    () => updateCurriculumStrategy(db, {
      ...strategyInput('api_key=secret-value-123'),
    }),
    'SENSITIVE_CONTENT_REJECTED',
  );

  // Curriculum safety: completed/evidenced lessons remain immutable and archival is reversible.
  const historical = curriculum.createRoadmap(db, {
    title: 'Historical roadmap',
    topic: 'ML systems',
    goal: 'Preserve completed work',
    description: 'Verification roadmap',
    masteryLevel: 3,
    depth: 'standard',
    changeSummary: 'Create historical roadmap',
    units: [{
      title: 'Foundations',
      description: 'Core work',
      order: 0,
      lessons: [{
        title: 'Completed lesson',
        shortDescription: 'Historical evidence',
        learningObjective: 'Understand batching',
        estimatedMinutes: 10,
        difficulty: 2,
        order: 0,
        keyIdeas: ['batching'],
      }],
    }],
  });
  const historicalNode = historical.units[0].lessons[0];
  curriculum.updateLessonNode(db, {
    roadmapId: historical.id,
    lessonNodeId: historicalNode.id,
    patch: { status: 'completed' },
    changeSummary: 'Complete lesson',
  });
  const ts = new Date().toISOString();
  db.prepare(
    `INSERT INTO progress_events
      (id, roadmap_id, lesson_node_id, lesson_id, event_type, event_json, created_at)
     VALUES ('steward-progress', ?, ?, NULL, 'lesson_completed', '{}', ?)`,
  ).run(historical.id, historicalNode.id, ts);
  db.prepare(
    `INSERT INTO learning_events
      (id, event_type, timestamp, roadmap_id, lesson_node_id, source, metadata_json)
     VALUES ('steward-learning', 'lesson_completed', ?, ?, ?, 'verification', '{}')`,
  ).run(ts, historical.id, historicalNode.id);
  db.prepare(
    `INSERT INTO concept_mastery
      (concept_slug, name, mastery_score, confidence_score, exposure_count, correct_count,
       incorrect_count, streak_correct, trend, evidence_json, updated_at)
     VALUES ('batching', 'Batching', 0.7, 0.8, 3, 2, 1, 1, 'improving', '[]', ?)`,
  ).run(ts);
  db.prepare(
    `INSERT INTO review_sets
      (id, lesson_id, roadmap_id, lesson_node_id, title, strategy, status, due_at, created_at, updated_at)
     VALUES ('steward-review', 'historical-lesson', ?, ?, 'Batching review', 'spaced', 'active', ?, ?, ?)`,
  ).run(historical.id, historicalNode.id, ts, ts, ts);
  db.prepare(
    `INSERT INTO retrieval_items
      (id, roadmap_id, lesson_node_id, lesson_id, source_type, item_type, prompt,
       status, due_at, created_at, updated_at, review_set_id)
     VALUES ('steward-retrieval', ?, ?, 'historical-lesson', 'lesson', 'free_response',
       'Explain batching.', 'active', ?, ?, ?, 'steward-review')`,
  ).run(historical.id, historicalNode.id, ts, ts, ts);

  expectCode(
    () => curriculum.deleteLessonNode(db, {
      roadmapId: historical.id,
      lessonNodeId: historicalNode.id,
      changeSummary: 'Should be rejected',
    }),
    'LESSON_HISTORY_PRESERVED',
  );
  expectCode(
    () => curriculum.updateLessonNode(db, {
      roadmapId: historical.id,
      lessonNodeId: historicalNode.id,
      patch: { title: 'Silently rewritten' },
      changeSummary: 'Should be rejected',
    }),
    'COMPLETED_LESSON_IMMUTABLE',
  );
  expectCode(
    () => curriculum.createLesson(db, {
      roadmapId: historical.id,
      lessonNodeId: historicalNode.id,
      lesson: { title: 'Replacement', cards: [{ type: 'text', content: 'Silent replacement' }] },
      changeSummary: 'Should be rejected',
    }),
    'LESSON_HISTORY_PRESERVED',
  );

  curriculum.updateRoadmap(db, historical.id, { status: 'archived' }, 'Archive completed curriculum');
  assert.equal(curriculum.listRoadmaps(db).some((roadmap) => roadmap.id === historical.id), false);
  assert.equal(listApiRoadmaps(db).some((roadmap) => roadmap.id === historical.id), false);
  assert.equal(
    curriculum.listRoadmaps(db, { status: 'all' }).some((roadmap) => roadmap.id === historical.id),
    true,
  );
  assert.equal(curriculum.getRoadmapDetailed(db, historical.id).status, 'archived');
  expectCode(
    () => curriculum.updateRoadmap(db, historical.id, { title: 'Rewritten history' }, 'Should be rejected'),
    'COMPLETED_CURRICULUM_IMMUTABLE',
  );
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM progress_events WHERE roadmap_id=?').get(historical.id) as { count: number }).count, 1);
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM retrieval_items WHERE roadmap_id=?').get(historical.id) as { count: number }).count, 1);
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM concept_mastery WHERE concept_slug='batching'").get() as { count: number }).count, 1);
  curriculum.updateRoadmap(db, historical.id, { status: 'draft' }, 'Restore archived curriculum');
  assert.equal(curriculum.listRoadmaps(db).some((roadmap) => roadmap.id === historical.id), true);

  const unused = curriculum.createRoadmap(db, {
    title: 'Unused draft', topic: 'Cleanup', goal: 'Verify safe deletion', description: '',
    masteryLevel: 1, depth: 'quick', changeSummary: 'Create unused draft',
    units: [{
      title: 'Draft unit', description: '', order: 0,
      lessons: [
        { title: 'Keep', shortDescription: '', learningObjective: 'Remain', estimatedMinutes: 5, difficulty: 1, order: 0, keyIdeas: ['keep'] },
        { title: 'Remove', shortDescription: '', learningObjective: 'Delete unused', estimatedMinutes: 5, difficulty: 1, order: 1, keyIdeas: ['remove'] },
      ],
    }],
  });
  const removableNode = unused.units[0].lessons[1];
  curriculum.deleteLessonNode(db, {
    roadmapId: unused.id,
    lessonNodeId: removableNode.id,
    changeSummary: 'Delete unused draft lesson',
  });
  assert.equal(curriculum.validateRoadmap(db, unused.id).ok, true);

  // Aggregate state contains required bounded sections and omits raw generation errors.
  const state = getCurriculumStewardState(db, { roadmapLimit: 1, lessonLimit: 1, runLimit: 1 });
  assert.ok(state.charter);
  assert.ok(state.strategy);
  assert.equal(state.recentRuns.length, 1);
  assert.ok(Array.isArray(state.activeRoadmaps));
  assert.ok(Array.isArray(state.currentAndUpcomingLessons));
  assert.ok(Array.isArray(state.recentlyCompletedLessons));
  assert.ok(state.learningState);
  assert.ok(state.reviewState);
  assert.ok(state.diagnostics);
  assert.ok(state.progression);
  assert.equal(JSON.stringify(state).includes('request_json'), false);
  assert.equal(JSON.stringify(state).includes('error_message'), false);

  // Existing-style database data survives the additive migration.
  const legacy = new Database(path.join(root, 'legacy.db'));
  try {
    for (const migration of MIGRATIONS.filter((migration) => migration.id < '0012_curriculum_steward')) {
      legacy.exec(migration.sql);
    }
    legacy.prepare(
      `INSERT INTO roadmaps
        (id, title, topic, goal, description, mastery_level, depth, status,
         estimated_total_minutes, created_at, updated_at, version)
       VALUES ('legacy-roadmap', 'Legacy', 'ML', 'Learn', '', 1, 'quick', 'draft', 5, ?, ?, 1)`,
    ).run(ts, ts);
    legacy.exec(stewardMigration.sql);
    assert.equal((legacy.prepare("SELECT COUNT(*) AS count FROM roadmaps WHERE id='legacy-roadmap'").get() as { count: number }).count, 1);
    assert.equal((legacy.prepare('SELECT COUNT(*) AS count FROM curriculum_steward_charters').get() as { count: number }).count, 1);
  } finally {
    legacy.close();
  }

  // MCP catalog and centralized authorization policy include every steward tool.
  const catalogNames = new Set(TOOL_CATALOG.map((tool) => tool.name));
  for (const name of [
    'get_curriculum_steward_state',
    'get_curriculum_steward_charter',
    'update_curriculum_steward_charter',
    'get_curriculum_strategy',
    'update_curriculum_strategy',
    'get_recent_curriculum_steward_runs',
    'begin_curriculum_steward_run',
    'complete_curriculum_steward_run',
    'fail_curriculum_steward_run',
  ]) {
    assert.equal(catalogNames.has(name), true);
    assert.ok(policyForTool(name));
  }
  assert.deepEqual(policyForTool('get_curriculum_steward_state').requiredScopes, ['microlearn:read']);
  assert.deepEqual(policyForTool('update_curriculum_strategy').requiredScopes, ['microlearn:write']);
  assert.equal(policyForTool('update_curriculum_strategy').trustedAutomationAllowed, true);

  console.log('Curriculum Steward verification passed.');
} finally {
  db.close();
  rmSync(root, { recursive: true, force: true });
}
