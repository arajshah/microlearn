import { randomUUID } from 'node:crypto';
import type { Db } from '../db';
import { conceptNameFromSlug, normalizeConceptSlug } from './concepts';
import { listWeaknesses, REMEDIATION_SEVERITY_THRESHOLD } from './mastery';
import type { RemediationItem, RemediationRow, RemediationStatus } from './types';

const OPEN_STATUSES: RemediationStatus[] = ['open', 'generated'];

export function serializeRemediation(row: RemediationRow): RemediationItem {
  return {
    id: row.id,
    conceptSlug: row.concept_slug,
    roadmapId: row.roadmap_id ?? undefined,
    lessonNodeId: row.lesson_node_id ?? undefined,
    severity: Number(row.severity.toFixed(4)),
    reason: row.reason,
    status: row.status as RemediationStatus,
    suggestedLessonTitle: row.suggested_lesson_title ?? undefined,
    generatedLessonId: row.generated_lesson_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateRemediationInput {
  conceptSlug: string;
  roadmapId?: string;
  lessonNodeId?: string;
  severity: number;
  reason: string;
  suggestedLessonTitle?: string;
}

/**
 * Adds a remediation item for a concept. If an open item already exists for that
 * concept it is escalated instead of duplicated, so the queue stays one-per-concept.
 */
export function createRemediationQueueItem(
  db: Db,
  input: CreateRemediationInput,
): RemediationItem | null {
  const conceptSlug = normalizeConceptSlug(input.conceptSlug);
  if (!conceptSlug) return null;

  const now = new Date().toISOString();
  const existing = db
    .prepare(`SELECT * FROM remediation_queue WHERE concept_slug = ? AND status = 'open'`)
    .get(conceptSlug) as RemediationRow | undefined;

  if (existing) {
    db.prepare(
      `UPDATE remediation_queue SET
         severity = MAX(severity, @severity),
         reason = @reason,
         roadmap_id = COALESCE(@roadmapId, roadmap_id),
         lesson_node_id = COALESCE(@lessonNodeId, lesson_node_id),
         updated_at = @now
       WHERE id = @id`,
    ).run({
      id: existing.id,
      severity: input.severity,
      reason: input.reason,
      roadmapId: input.roadmapId ?? null,
      lessonNodeId: input.lessonNodeId ?? null,
      now,
    });
    return serializeRemediation(
      db.prepare('SELECT * FROM remediation_queue WHERE id = ?').get(existing.id) as RemediationRow,
    );
  }

  const id = randomUUID();
  const title =
    input.suggestedLessonTitle ?? `Remediation: ${conceptNameFromSlug(conceptSlug)}`;

  db.prepare(
    `INSERT INTO remediation_queue (
       id, concept_slug, roadmap_id, lesson_node_id, severity, reason,
       status, suggested_lesson_title, created_at, updated_at
     ) VALUES (
       @id, @conceptSlug, @roadmapId, @lessonNodeId, @severity, @reason,
       'open', @title, @now, @now
     )`,
  ).run({
    id,
    conceptSlug,
    roadmapId: input.roadmapId ?? null,
    lessonNodeId: input.lessonNodeId ?? null,
    severity: input.severity,
    reason: input.reason,
    title,
    now,
  });

  return serializeRemediation(
    db.prepare('SELECT * FROM remediation_queue WHERE id = ?').get(id) as RemediationRow,
  );
}

/** Scans active weaknesses above threshold and queues remediation for each. */
export function recommendRemediationForWeaknesses(
  db: Db,
  options: { severityMin?: number; limit?: number; roadmapId?: string } = {},
): { created: RemediationItem[]; consideredWeaknesses: number } {
  const severityMin = options.severityMin ?? REMEDIATION_SEVERITY_THRESHOLD;
  const weaknesses = listWeaknesses(db, {
    status: 'active',
    severityMin,
    limit: options.limit ?? 10,
  });

  const created: RemediationItem[] = [];
  for (const weakness of weaknesses) {
    const item = createRemediationQueueItem(db, {
      conceptSlug: weakness.conceptSlug,
      roadmapId: options.roadmapId,
      severity: weakness.severity,
      reason:
        weakness.evidenceSummary ??
        `Active weakness "${weakness.weaknessTag}" at severity ${weakness.severity.toFixed(2)}.`,
    });
    if (item) created.push(item);
  }

  return { created, consideredWeaknesses: weaknesses.length };
}

export function markRemediationGenerated(
  db: Db,
  input: { id: string; generatedLessonId?: string },
): RemediationItem | null {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE remediation_queue
     SET status = 'generated', generated_lesson_id = COALESCE(?, generated_lesson_id), updated_at = ?
     WHERE id = ?`,
  ).run(input.generatedLessonId ?? null, now, input.id);
  const row = db.prepare('SELECT * FROM remediation_queue WHERE id = ?').get(input.id) as
    | RemediationRow
    | undefined;
  return row ? serializeRemediation(row) : null;
}

export function updateRemediationStatus(
  db: Db,
  input: { id: string; status: RemediationStatus; generatedLessonId?: string },
): RemediationItem | null {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE remediation_queue
     SET status = ?, generated_lesson_id = COALESCE(?, generated_lesson_id), updated_at = ?
     WHERE id = ?`,
  ).run(input.status, input.generatedLessonId ?? null, now, input.id);
  const row = db.prepare('SELECT * FROM remediation_queue WHERE id = ?').get(input.id) as
    | RemediationRow
    | undefined;
  return row ? serializeRemediation(row) : null;
}

export function listRemediationQueue(
  db: Db,
  filters: { status?: RemediationStatus; conceptSlug?: string; limit?: number } = {},
): RemediationItem[] {
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};
  if (filters.status) {
    clauses.push('status = @status');
    params.status = filters.status;
  }
  if (filters.conceptSlug) {
    clauses.push('concept_slug = @conceptSlug');
    params.conceptSlug = normalizeConceptSlug(filters.conceptSlug);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = Math.min(Math.max(filters.limit ?? 25, 1), 200);

  const rows = db
    .prepare(`SELECT * FROM remediation_queue ${where} ORDER BY severity DESC, created_at DESC LIMIT ${limit}`)
    .all(params) as RemediationRow[];
  return rows.map(serializeRemediation);
}

export function listOpenRemediations(db: Db, limit = 10): RemediationItem[] {
  const placeholders = OPEN_STATUSES.map(() => '?').join(', ');
  const rows = db
    .prepare(
      `SELECT * FROM remediation_queue WHERE status IN (${placeholders})
       ORDER BY severity DESC, created_at DESC LIMIT ?`,
    )
    .all(...OPEN_STATUSES, Math.min(Math.max(limit, 1), 100)) as RemediationRow[];
  return rows.map(serializeRemediation);
}
