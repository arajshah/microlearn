import type { Db } from '../db';
import { recordAuditEvent } from '../audit/auditService';
import { findLessonCompletionEvidence } from './lessonCompletion';

export interface InvalidReviewMaterial {
  lessonId: string;
  reviewSetIds: string[];
  itemIds: string[];
  itemCount: number;
}

export interface ReviewIntegrityRepairResult {
  applied: boolean;
  affectedLessonCount: number;
  affectedReviewSetCount: number;
  affectedItemCount: number;
  lessons: InvalidReviewMaterial[];
}

/** Finds and optionally soft-deletes review material lacking completion evidence. */
export function repairInvalidReviewMaterial(
  db: Db,
  options: { apply?: boolean; actor?: string } = {},
): ReviewIntegrityRepairResult {
  const lessonRows = db
    .prepare(
      `SELECT lesson_id FROM review_sets WHERE status != 'deleted'
       UNION
       SELECT lesson_id FROM retrieval_items
       WHERE status != 'deleted' AND lesson_id IS NOT NULL`,
    )
    .all() as Array<{ lesson_id: string }>;

  const lessons: InvalidReviewMaterial[] = [];
  for (const { lesson_id: lessonId } of lessonRows) {
    if (findLessonCompletionEvidence(db, { lessonId })) continue;
    const reviewSetIds = (
      db
        .prepare("SELECT id FROM review_sets WHERE lesson_id = ? AND status != 'deleted'")
        .all(lessonId) as Array<{ id: string }>
    ).map((row) => row.id);
    const itemIds = (
      db
        .prepare("SELECT id FROM retrieval_items WHERE lesson_id = ? AND status != 'deleted'")
        .all(lessonId) as Array<{ id: string }>
    ).map((row) => row.id);
    lessons.push({ lessonId, reviewSetIds, itemIds, itemCount: itemIds.length });
  }

  if (options.apply && lessons.length > 0) {
    db.transaction(() => {
      const ts = new Date().toISOString();
      for (const invalid of lessons) {
        db.prepare(
          "UPDATE review_sets SET status = 'deleted', updated_at = ? WHERE lesson_id = ? AND status != 'deleted'",
        ).run(ts, invalid.lessonId);
        db.prepare(
          "UPDATE retrieval_items SET status = 'deleted', updated_at = ? WHERE lesson_id = ? AND status != 'deleted'",
        ).run(ts, invalid.lessonId);
        recordAuditEvent(db, {
          actor: options.actor ?? 'review-integrity-repair',
          action: 'soft_delete_invalid_review_material',
          entityType: 'generated_lesson',
          entityId: invalid.lessonId,
          metadata: {
            reviewSetIds: invalid.reviewSetIds,
            itemIds: invalid.itemIds,
            itemCount: invalid.itemCount,
          },
        });
      }
    })();
  }

  return {
    applied: options.apply === true,
    affectedLessonCount: lessons.length,
    affectedReviewSetCount: lessons.reduce((sum, lesson) => sum + lesson.reviewSetIds.length, 0),
    affectedItemCount: lessons.reduce((sum, lesson) => sum + lesson.itemCount, 0),
    lessons,
  };
}
