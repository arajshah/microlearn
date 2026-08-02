import type { Db } from '../db';
import { ApiError, badRequest } from '../api/apiError';

export const LESSON_NOT_COMPLETED_MESSAGE =
  'Complete this lesson before adding it to review.';

export type LessonCompletionEvidence =
  | 'lesson_node'
  | 'lesson_outcome'
  | 'learning_event';

interface CompletionInput {
  lessonId: string;
  roadmapId?: string;
  lessonNodeId?: string;
}

interface LessonLinkRow {
  roadmap_id: string | null;
  lesson_node_id: string | null;
}

function resolveLessonLink(db: Db, input: CompletionInput): LessonLinkRow | undefined {
  const lesson = db
    .prepare(
      "SELECT roadmap_id, lesson_node_id FROM generated_lessons WHERE id = ? AND status != 'deleted'",
    )
    .get(input.lessonId) as LessonLinkRow | undefined;
  if (!lesson) return undefined;

  if (input.roadmapId && lesson.roadmap_id !== input.roadmapId) {
    throw badRequest('The lesson does not belong to the supplied roadmap.', 'LESSON_CONTEXT_MISMATCH');
  }
  if (input.lessonNodeId && lesson.lesson_node_id !== input.lessonNodeId) {
    throw badRequest('The lesson does not belong to the supplied lesson node.', 'LESSON_CONTEXT_MISMATCH');
  }
  return lesson;
}

/** Returns persisted completion evidence without trusting request flags. */
export function findLessonCompletionEvidence(
  db: Db,
  input: CompletionInput,
): LessonCompletionEvidence | null {
  const link = resolveLessonLink(db, input);
  const roadmapId = link?.roadmap_id ?? input.roadmapId;
  const lessonNodeId = link?.lesson_node_id ?? input.lessonNodeId;

  if (roadmapId && lessonNodeId) {
    const completedNode = db
      .prepare(
        `SELECT 1 FROM lesson_nodes
         WHERE id = ? AND roadmap_id = ? AND status = 'completed'
           AND (generated_lesson_id = ? OR generated_lesson_id IS NULL)
         LIMIT 1`,
      )
      .get(lessonNodeId, roadmapId, input.lessonId);
    if (completedNode) return 'lesson_node';
  }

  const completedOutcome = db
    .prepare(
      `SELECT 1 FROM lesson_outcomes
       WHERE lesson_id = ? AND completed_at IS NOT NULL
       LIMIT 1`,
    )
    .get(input.lessonId);
  if (completedOutcome) return 'lesson_outcome';

  const completedEvent = db
    .prepare(
      `SELECT 1 FROM learning_events
       WHERE lesson_id = ? AND event_type = 'lesson_completed'
       LIMIT 1`,
    )
    .get(input.lessonId);
  if (completedEvent) return 'learning_event';

  return null;
}

/** Shared guard for every review-material creation path. */
export function assertLessonCompleted(db: Db, input: CompletionInput): LessonCompletionEvidence {
  const evidence = findLessonCompletionEvidence(db, input);
  if (!evidence) {
    throw new ApiError(409, LESSON_NOT_COMPLETED_MESSAGE, 'LESSON_NOT_COMPLETED');
  }
  return evidence;
}
