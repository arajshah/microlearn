import { randomUUID } from 'node:crypto';
import type { Db } from '../db';
import { notFound } from '../api/apiError';
import { resolveRoadmapNodeId } from '../roadmaps/nodeIdResolver';
import { recordAuditEvent } from '../audit/auditService';
import { serializeOutcome, type OutcomeRow } from '../curriculum/curriculumSerialization';

export interface CreateOutcomeInput {
  roadmapId: string;
  lessonNodeId: string;
  lessonId: string;
  outcome: Record<string, unknown>;
  completedAt?: string;
}

function loadRoadmap(db: Db, id: string): boolean {
  return Boolean(db.prepare('SELECT 1 FROM roadmaps WHERE id = ?').get(id));
}

/** Stores a lesson outcome and an optional progress event. */
export function createOutcome(db: Db, input: CreateOutcomeInput) {
  if (!loadRoadmap(db, input.roadmapId)) throw notFound(`Roadmap "${input.roadmapId}" not found.`);
  const canonicalNodeId = resolveRoadmapNodeId(db, input.roadmapId, input.lessonNodeId);
  if (!canonicalNodeId) {
    throw notFound(`Lesson node "${input.lessonNodeId}" not found in roadmap.`);
  }

  const ts = new Date().toISOString();
  const id = randomUUID();
  const completedAt = input.completedAt ?? ts;

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO lesson_outcomes
        (id, roadmap_id, lesson_node_id, lesson_id, outcome_json, completed_at, created_at)
       VALUES (@id, @roadmapId, @lessonNodeId, @lessonId, @outcomeJson, @completedAt, @createdAt)`,
    ).run({
      id,
      roadmapId: input.roadmapId,
      lessonNodeId: canonicalNodeId,
      lessonId: input.lessonId,
      outcomeJson: JSON.stringify(input.outcome),
      completedAt,
      createdAt: ts,
    });

    db.prepare(
      `INSERT INTO progress_events
        (id, roadmap_id, lesson_node_id, lesson_id, event_type, event_json, created_at)
       VALUES (@id, @roadmapId, @lessonNodeId, @lessonId, 'lesson_completed', @eventJson, @createdAt)`,
    ).run({
      id: randomUUID(),
      roadmapId: input.roadmapId,
      lessonNodeId: canonicalNodeId,
      lessonId: input.lessonId,
      eventJson: JSON.stringify({ outcomeId: id, completedAt }),
      createdAt: ts,
    });

    const row = db.prepare('SELECT * FROM lesson_outcomes WHERE id = ?').get(id) as OutcomeRow;
    const outcome = serializeOutcome(row);
    recordAuditEvent(db, {
      actor: 'api',
      action: 'create_outcome',
      entityType: 'lesson_outcome',
      entityId: id,
      after: outcome,
      metadata: { roadmapId: input.roadmapId, lessonNodeId: canonicalNodeId, lessonId: input.lessonId },
    });
    return outcome;
  });

  return tx();
}

export function listRoadmapOutcomes(db: Db, roadmapId: string) {
  if (!loadRoadmap(db, roadmapId)) throw notFound(`Roadmap "${roadmapId}" not found.`);
  const rows = db
    .prepare('SELECT * FROM lesson_outcomes WHERE roadmap_id = ? ORDER BY created_at DESC')
    .all(roadmapId) as OutcomeRow[];
  return rows.map(serializeOutcome);
}

export function listNodeOutcomes(db: Db, lessonNodeId: string) {
  const rows = db
    .prepare('SELECT * FROM lesson_outcomes WHERE lesson_node_id = ? ORDER BY created_at DESC')
    .all(lessonNodeId) as OutcomeRow[];
  return rows.map(serializeOutcome);
}

export function countOutcomes(db: Db): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM lesson_outcomes').get() as { c: number }).c;
}
