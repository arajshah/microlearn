#!/usr/bin/env npx tsx
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { MIGRATIONS } from '../server/src/db/schema';
import { patchLessonNode } from '../server/src/api/repository';
import { createOutcome } from '../server/src/outcomes/outcomeRepository';
import { resolveRoadmapNodeId as resolveServerRoadmapNodeId } from '../server/src/roadmaps/nodeIdResolver';
import { mergeRoadmapPreservingLocalProgress } from '../src/utils/roadmapMerge';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function seedRoadmap(db: Database.Database, roadmapId: string): void {
  const ts = new Date().toISOString();
  db.prepare(
    `INSERT INTO roadmaps (id, title, topic, goal, description, mastery_level, depth, status, estimated_total_minutes, created_at, updated_at)
     VALUES (?, 'vLLM', 'Inference', 'Learn vLLM', '', 4, 'deep', 'published', 16, ?, ?)`,
  ).run(roadmapId, ts, ts);
  const unitId = 'unit-1';
  db.prepare(
    `INSERT INTO roadmap_units (id, roadmap_id, title, description, unit_order, created_at, updated_at)
     VALUES (?, ?, 'Unit 1', '', 1, ?, ?)`,
  ).run(unitId, roadmapId, ts, ts);
  for (const node of [
    { id: 'vllm-01', order: 1, prereqs: '[]' },
    { id: 'vllm-02', order: 2, prereqs: JSON.stringify(['vllm-01']) },
  ]) {
    db.prepare(
      `INSERT INTO lesson_nodes
        (id, roadmap_id, unit_id, title, short_description, learning_objective, estimated_minutes, difficulty, node_order, prerequisite_ids_json, key_ideas_json, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, '', 'Objective', 8, 3, ?, ?, '[]', 'available', ?, ?)`,
    ).run(node.id, roadmapId, unitId, node.id, node.order, node.prereqs, ts, ts);
  }
}

import {
  isServerOriginatedRoadmap,
  normalizeLocalRoadmapEntityIds,
  repairRoadmapMutationPayload,
  repairStaleRoadmapFromServer,
  resolveRoadmapNodeId,
} from '../src/utils/roadmapIds';
import { markNodeCompleted } from '../src/utils/roadmapProgress';
import { GeneratedRoadmap } from '../src/types/roadmap';

function serverRoadmap(roadmapId: string): GeneratedRoadmap {
  return {
    id: roadmapId,
    title: 'vLLM',
    topic: 'Inference',
    goal: 'Learn vLLM',
    description: '',
    masteryLevel: 4,
    depth: 'deep',
    estimatedTotalMinutes: 16,
    createdAt: new Date().toISOString(),
    serverSummary: {
      unitCount: 1,
      lessonCount: 2,
      completedLessonCount: 0,
      progress: 0,
    },
    units: [
      {
        id: 'unit-1',
        title: 'Unit 1',
        description: '',
        order: 1,
        lessons: [
          {
            id: 'vllm-01',
            unitId: 'unit-1',
            title: 'PagedAttention',
            shortDescription: '',
            learningObjective: 'Explain PagedAttention',
            estimatedMinutes: 8,
            difficulty: 3,
            order: 1,
            prerequisiteIds: [],
            keyIdeas: ['paged-attention'],
            status: 'available',
          },
          {
            id: 'vllm-02',
            unitId: 'unit-1',
            title: 'Serving',
            shortDescription: '',
            learningObjective: 'Apply serving patterns',
            estimatedMinutes: 8,
            difficulty: 3,
            order: 2,
            prerequisiteIds: ['vllm-01'],
            keyIdeas: ['serving'],
            status: 'locked',
          },
        ],
      },
    ],
  };
}

function staleRoadmap(roadmapId: string): GeneratedRoadmap {
  const fresh = serverRoadmap(roadmapId);
  return {
    ...fresh,
    units: fresh.units.map((unit) => ({
      ...unit,
      lessons: unit.lessons.map((node) => ({
        ...node,
        id: `${roadmapId}-${node.id}`,
        prerequisiteIds: node.prerequisiteIds.map((id) => `${roadmapId}-${id}`),
        status: node.id === 'vllm-01' ? 'completed' : node.status,
      })),
    })),
  };
}

function main(): void {
  const roadmapId = randomUUID();
  const fresh = serverRoadmap(roadmapId);
  assert(fresh.units[0].lessons[0].id === 'vllm-01', 'fresh server roadmap keeps canonical ids');
  assert(isServerOriginatedRoadmap(fresh), 'server roadmap is marked server-originated');
  assert(
    normalizeLocalRoadmapEntityIds(fresh).units[0].lessons[0].id === 'vllm-01',
    'server roadmap is not rewritten by local normalization',
  );

  const stale = staleRoadmap(roadmapId);
  const repaired = repairStaleRoadmapFromServer(stale, fresh);
  assert(repaired.units[0].lessons[0].id === 'vllm-01', 'stale cache repairs to canonical id');
  assert(repaired.units[0].lessons[0].status === 'completed', 'local completion survives repair');
  assert(repaired.units.flatMap((u) => u.lessons).length === 2, 'repair does not duplicate lessons');
  assert(
    repaired.units[0].lessons[1].prerequisiteIds.includes('vllm-01'),
    'prerequisite ids remain valid after repair',
  );

  const merged = mergeRoadmapPreservingLocalProgress(stale, fresh);
  assert(merged.units[0].lessons[0].status === 'completed', 'merge preserves stale completion by alias');
  assert(merged.units[0].lessons[0].id === 'vllm-01', 'merge keeps canonical server ids');

  assert(resolveRoadmapNodeId(fresh, 'vllm-01') === 'vllm-01', 'exact id resolves');
  assert(
    resolveRoadmapNodeId(fresh, `${roadmapId}-vllm-01`) === 'vllm-01',
    'scoped alias resolves to canonical id',
  );
  assert(resolveRoadmapNodeId(fresh, 'missing-node') === null, 'unknown ids are rejected');

  const completed = markNodeCompleted(fresh, `${roadmapId}-vllm-01`);
  assert(completed.units[0].lessons[0].status === 'completed', 'completion accepts scoped alias');

  const payload = repairRoadmapMutationPayload(stale);
  assert(payload.units[0].lessons[0].id === `${roadmapId}-vllm-01`, 'local-only payload keeps ids until server repair');

  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const migration of MIGRATIONS) db.exec(migration.sql);
  seedRoadmap(db, roadmapId);

  assert(
    resolveServerRoadmapNodeId(db, roadmapId, `${roadmapId}-vllm-01`) === 'vllm-01',
    'server resolves scoped alias',
  );
  assert(resolveServerRoadmapNodeId(db, roadmapId, 'vllm-01') === 'vllm-01', 'server exact id resolves');
  assert(resolveServerRoadmapNodeId(db, roadmapId, 'missing') === null, 'server rejects unknown id');

  patchLessonNode(db, roadmapId, `${roadmapId}-vllm-01`, { status: 'completed' });
  const row = db
    .prepare("SELECT status FROM lesson_nodes WHERE id = 'vllm-01' AND roadmap_id = ?")
    .get(roadmapId) as { status: string };
  assert(row.status === 'completed', 'server patch accepts scoped alias');

  const lessonId = randomUUID();
  const ts = new Date().toISOString();
  db.prepare(
    `INSERT INTO generated_lessons
      (id, roadmap_id, lesson_node_id, blueprint_id, version, lesson_json, model, prompt_version, status, subject_id, topic, title, deleted_at, created_at, updated_at)
     VALUES (?, ?, 'vllm-01', NULL, 1, '{}', NULL, NULL, 'active', NULL, NULL, 'Lesson', NULL, ?, ?)`,
  ).run(lessonId, roadmapId, ts, ts);

  createOutcome(db, {
    roadmapId,
    lessonNodeId: `${roadmapId}-vllm-01`,
    lessonId,
    outcome: { objective: 'done' },
  });
  const outcomeCount = db
    .prepare("SELECT COUNT(*) AS n FROM lesson_outcomes WHERE lesson_node_id = 'vllm-01'")
    .get() as { n: number };
  assert(outcomeCount.n === 1, 'outcome route stores canonical node id');

  console.log('verify-roadmap-id-integrity: all checks passed');
}

main();
