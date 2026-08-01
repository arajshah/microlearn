import type { Db } from '../db';
import { softDeleteRoadmap } from '../api/repository';
import { ToolError } from '../mcp/repoSafety';

function count(db: Db, sql: string, roadmapId: string): number {
  return (db.prepare(sql).get(roadmapId) as { count: number }).count;
}

export interface RoadmapDeletionSummary {
  roadmapId: string;
  previousStatus: string;
  status: 'deleted';
  affected: {
    units: number;
    lessonNodes: number;
    generatedLessons: number;
    publicationVersions: number;
    progressEvents: number;
    lessonOutcomes: number;
    retrievalItems: number;
    reviewSets: number;
    schedulesPaused: number;
    remindersPaused: number;
  };
  retainedForRestore: boolean;
}

/** Reuses REST soft deletion, then deactivates dependent delivery records in the same transaction. */
export function deleteRoadmapTransactionally(
  db: Db,
  roadmapId: string,
  options: { beforeCommit?: () => void } = {},
): RoadmapDeletionSummary {
  const tx = db.transaction(() => {
    const roadmap = db.prepare('SELECT status FROM roadmaps WHERE id=?').get(roadmapId) as { status: string } | undefined;
    if (!roadmap) throw new ToolError('NOT_FOUND', `Roadmap "${roadmapId}" not found.`);

    const affected = {
      units: count(db, 'SELECT COUNT(*) AS count FROM roadmap_units WHERE roadmap_id=?', roadmapId),
      lessonNodes: count(db, 'SELECT COUNT(*) AS count FROM lesson_nodes WHERE roadmap_id=?', roadmapId),
      generatedLessons: count(db, 'SELECT COUNT(*) AS count FROM generated_lessons WHERE roadmap_id=?', roadmapId),
      publicationVersions: count(db, "SELECT COUNT(*) AS count FROM content_versions WHERE entity_type='roadmap' AND entity_id=?", roadmapId),
      progressEvents: count(db, 'SELECT COUNT(*) AS count FROM progress_events WHERE roadmap_id=?', roadmapId),
      lessonOutcomes: count(db, 'SELECT COUNT(*) AS count FROM lesson_outcomes WHERE roadmap_id=?', roadmapId),
      retrievalItems: count(db, 'SELECT COUNT(*) AS count FROM retrieval_items WHERE roadmap_id=?', roadmapId),
      reviewSets: count(db, 'SELECT COUNT(*) AS count FROM review_sets WHERE roadmap_id=?', roadmapId),
      schedulesPaused: 0,
      remindersPaused: 0,
    };

    if (roadmap.status !== 'deleted') softDeleteRoadmap(db, roadmapId);
    const ts = new Date().toISOString();
    db.prepare("UPDATE generated_lessons SET status='archived', updated_at=? WHERE roadmap_id=? AND status='active'").run(ts, roadmapId);
    db.prepare("UPDATE retrieval_items SET status='archived', updated_at=? WHERE roadmap_id=? AND status IN ('active','mastered')").run(ts, roadmapId);
    db.prepare("UPDATE review_sets SET status='archived', updated_at=? WHERE roadmap_id=? AND status='active'").run(ts, roadmapId);
    affected.schedulesPaused = db.prepare(
      "UPDATE automation_schedules SET status='paused', updated_at=? WHERE json_extract(payload_json, '$.roadmapId')=? AND status='active'",
    ).run(ts, roadmapId).changes;
    affected.remindersPaused = db.prepare(
      "UPDATE automation_reminders SET status='paused', updated_at=? WHERE roadmap_id=? AND status='active'",
    ).run(ts, roadmapId).changes;

    options.beforeCommit?.();
    return {
      roadmapId,
      previousStatus: roadmap.status,
      status: 'deleted' as const,
      affected,
      retainedForRestore: true,
    };
  });
  return tx();
}
