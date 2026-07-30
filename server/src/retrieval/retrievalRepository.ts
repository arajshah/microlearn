import { randomUUID } from 'node:crypto';
import type { Db } from '../db';
import { notFound, badRequest } from '../api/apiError';
import { getGeneratedLesson } from '../api/repository';
import { recordAuditEvent } from '../audit/auditService';
import { applyRating, initialSchedule, ratingToCorrect } from './retrievalScheduler';
import { mapLessonCardsToSeedCandidates } from './retrievalSeeding';
import {
  serializeRetrievalAttempt,
  serializeRetrievalItem,
  serializeReviewSet,
  serializeRetrievalSession,
  type SerializedRetrievalItem,
  type SerializedReviewSet,
} from './retrievalSerialization';
import type { RetrievalItemRow, RetrievalRating, ReviewSetRow, ScheduleState } from './retrievalTypes';
import { buildReviewSetCandidates } from './reviewSetBuilder';

function now(): string {
  return new Date().toISOString();
}

function getItemRow(db: Db, id: string): RetrievalItemRow {
  const row = db.prepare('SELECT * FROM retrieval_items WHERE id = ?').get(id) as RetrievalItemRow | undefined;
  if (!row || row.status === 'deleted') throw notFound(`Retrieval item "${id}" not found.`);
  return row;
}

export function countRetrievalItems(db: Db): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM retrieval_items').get() as { c: number }).c;
}

export function countRetrievalSessions(db: Db): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM retrieval_sessions').get() as { c: number }).c;
}

export function countRetrievalAttempts(db: Db): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM retrieval_attempts').get() as { c: number }).c;
}

export function listDueItems(
  db: Db,
  options: { roadmapId?: string; limit?: number } = {},
): SerializedRetrievalItem[] {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const ts = now();
  let rows: RetrievalItemRow[];
  if (options.roadmapId) {
    rows = db
      .prepare(
        `SELECT retrieval_items.*, review_sets.title AS review_set_title
         FROM retrieval_items
         LEFT JOIN review_sets ON review_sets.id = retrieval_items.review_set_id
         WHERE retrieval_items.status = 'active' AND retrieval_items.due_at <= ? AND retrieval_items.roadmap_id = ?
         ORDER BY retrieval_items.due_at ASC LIMIT ?`,
      )
      .all(ts, options.roadmapId, limit) as RetrievalItemRow[];
  } else {
    rows = db
      .prepare(
        `SELECT retrieval_items.*, review_sets.title AS review_set_title
         FROM retrieval_items
         LEFT JOIN review_sets ON review_sets.id = retrieval_items.review_set_id
         WHERE retrieval_items.status = 'active' AND retrieval_items.due_at <= ?
         ORDER BY retrieval_items.due_at ASC LIMIT ?`,
      )
      .all(ts, limit) as RetrievalItemRow[];
  }
  return rows.map(serializeRetrievalItem);
}

export function listScheduledItems(
  db: Db,
  options: { days?: number; roadmapId?: string } = {},
): Array<Omit<SerializedRetrievalItem, 'answer' | 'explanation'>> {
  const days = Math.min(Math.max(options.days ?? 7, 1), 45);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + days);

  const params: unknown[] = [start.toISOString(), end.toISOString()];
  let filter = "retrieval_items.status = 'active' AND retrieval_items.due_at >= ? AND retrieval_items.due_at < ?";
  if (options.roadmapId) {
    filter += ' AND retrieval_items.roadmap_id = ?';
    params.push(options.roadmapId);
  }

  const rows = db
    .prepare(
      `SELECT retrieval_items.*, review_sets.title AS review_set_title
       FROM retrieval_items
       LEFT JOIN review_sets ON review_sets.id = retrieval_items.review_set_id
       WHERE ${filter}
       ORDER BY retrieval_items.due_at ASC
       LIMIT 500`,
    )
    .all(...params) as RetrievalItemRow[];

  return rows.map((row) => {
    const { answer: _answer, explanation: _explanation, ...safe } = serializeRetrievalItem(row);
    return safe;
  });
}

export function getItemsByIds(db: Db, ids: string[]): SerializedRetrievalItem[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT retrieval_items.*, review_sets.title AS review_set_title
       FROM retrieval_items
       LEFT JOIN review_sets ON review_sets.id = retrieval_items.review_set_id
       WHERE retrieval_items.id IN (${placeholders}) AND retrieval_items.status != 'deleted'`,
    )
    .all(...ids) as RetrievalItemRow[];
  const order = new Map(ids.map((id, i) => [id, i]));
  return rows
    .map(serializeRetrievalItem)
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

function getReviewSetItems(db: Db, reviewSetId: string): SerializedRetrievalItem[] {
  const rows = db
    .prepare(
      `SELECT retrieval_items.*, review_sets.title AS review_set_title
       FROM retrieval_items
       LEFT JOIN review_sets ON review_sets.id = retrieval_items.review_set_id
       WHERE retrieval_items.review_set_id = ? AND retrieval_items.status != 'deleted'
       ORDER BY retrieval_items.created_at ASC`,
    )
    .all(reviewSetId) as RetrievalItemRow[];
  return rows.map(serializeRetrievalItem);
}

function serializeReviewSetWithCount(db: Db, id: string): SerializedReviewSet {
  const row = db
    .prepare(
      `SELECT review_sets.*, COUNT(retrieval_items.id) AS item_count
       FROM review_sets
       LEFT JOIN retrieval_items
         ON retrieval_items.review_set_id = review_sets.id
        AND retrieval_items.status != 'deleted'
       WHERE review_sets.id = ?
       GROUP BY review_sets.id`,
    )
    .get(id) as (ReviewSetRow & { item_count: number }) | undefined;
  if (!row) throw notFound(`Review set "${id}" not found.`);
  return serializeReviewSet(row);
}

export function listDueReviewSets(db: Db, options: { limit?: number } = {}): SerializedReviewSet[] {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const rows = db
    .prepare(
      `SELECT review_sets.*, COUNT(retrieval_items.id) AS item_count
       FROM review_sets
       LEFT JOIN retrieval_items
         ON retrieval_items.review_set_id = review_sets.id
        AND retrieval_items.status = 'active'
        AND retrieval_items.due_at <= ?
       WHERE review_sets.status = 'active' AND review_sets.due_at <= ?
       GROUP BY review_sets.id
       ORDER BY review_sets.due_at ASC
       LIMIT ?`,
    )
    .all(now(), now(), limit) as Array<ReviewSetRow & { item_count: number }>;
  return rows.map(serializeReviewSet);
}

export function createReviewSetFromLesson(
  db: Db,
  input: {
    lessonId: string;
    lesson?: Record<string, unknown>;
    roadmapId?: string;
    lessonNodeId?: string;
    force?: boolean;
    actor?: string;
  },
) {
  const generated = input.lesson ? null : getGeneratedLesson(db, input.lessonId);
  const lessonObj = input.lesson ?? (generated?.lesson as Record<string, unknown>);
  const roadmapId = input.roadmapId ?? generated?.roadmapId;
  const lessonNodeId = input.lessonNodeId ?? generated?.lessonNodeId;
  const { title, strategy, candidates } = buildReviewSetCandidates(input.lessonId, lessonObj);

  const existingSet = db
    .prepare("SELECT * FROM review_sets WHERE lesson_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1")
    .get(input.lessonId) as ReviewSetRow | undefined;

  if (existingSet && !input.force) {
    const items = getReviewSetItems(db, existingSet.id);
    return {
      reviewSet: serializeReviewSetWithCount(db, existingSet.id),
      items,
      created: 0,
      existing: items.length,
      totalCandidates: candidates.length,
    };
  }

  if (candidates.length === 0) {
    return {
      reviewSet: null,
      items: [] as SerializedRetrievalItem[],
      created: 0,
      existing: 0,
      totalCandidates: 0,
    };
  }

  const tx = db.transaction(() => {
    const ts = now();
    if (existingSet && input.force) {
      db.prepare("UPDATE review_sets SET status = 'deleted', updated_at = ? WHERE id = ?").run(ts, existingSet.id);
      db.prepare("UPDATE retrieval_items SET status = 'deleted', updated_at = ? WHERE review_set_id = ?").run(
        ts,
        existingSet.id,
      );
    }

    const schedule = initialSchedule(new Date(), false);
    const reviewSetId = randomUUID();
    db.prepare(
      `INSERT INTO review_sets
        (id, lesson_id, roadmap_id, lesson_node_id, title, strategy, status, due_at, created_at, updated_at, metadata_json)
       VALUES (@id, @lessonId, @roadmapId, @lessonNodeId, @title, @strategy, 'active', @dueAt, @ts, @ts, @metadata)`,
    ).run({
      id: reviewSetId,
      lessonId: input.lessonId,
      roadmapId: roadmapId ?? null,
      lessonNodeId: lessonNodeId ?? null,
      title,
      strategy,
      dueAt: schedule.dueAt,
      ts,
      metadata: JSON.stringify({ itemTarget: candidates.length }),
    });

    for (const candidate of candidates) {
      const id = randomUUID();
      db.prepare(
        `INSERT INTO retrieval_items
          (id, review_set_id, roadmap_id, lesson_node_id, lesson_id, source_type, source_ref, item_type, prompt, answer, explanation, concept, difficulty, status, due_at, last_reviewed_at, reps, lapses, ease, interval_days, choices_json, metadata_json, created_at, updated_at)
         VALUES (@id, @reviewSetId, @roadmapId, @lessonNodeId, @lessonId, 'review_set', @sourceRef, @itemType, @prompt, @answer, @explanation, @concept, @difficulty, 'active', @dueAt, NULL, 0, 0, 2.5, 0, @choices, @metadata, @ts, @ts)`,
      ).run({
        id,
        reviewSetId,
        roadmapId: roadmapId ?? null,
        lessonNodeId: lessonNodeId ?? null,
        lessonId: input.lessonId,
        sourceRef: candidate.sourceRef,
        itemType: candidate.itemType,
        prompt: candidate.prompt,
        answer: candidate.answer ?? null,
        explanation: candidate.explanation ?? null,
        concept: candidate.concept ?? null,
        difficulty: candidate.difficulty ?? null,
        dueAt: schedule.dueAt,
        choices: candidate.choices ? JSON.stringify(candidate.choices) : null,
        metadata: JSON.stringify(candidate.metadata ?? {}),
        ts,
      });
    }

    recordAuditEvent(db, {
      actor: input.actor ?? 'api',
      action: 'create_review_set',
      entityType: 'review_set',
      entityId: reviewSetId,
      metadata: { lessonId: input.lessonId, created: candidates.length, roadmapId, lessonNodeId, strategy },
    });

    return {
      reviewSet: serializeReviewSetWithCount(db, reviewSetId),
      items: getReviewSetItems(db, reviewSetId),
      created: candidates.length,
      existing: 0,
      totalCandidates: candidates.length,
    };
  });

  return tx();
}

export function seedRetrievalItems(
  db: Db,
  input: {
    lessonId: string;
    roadmapId?: string;
    lessonNodeId?: string;
    lesson?: Record<string, unknown>;
    force?: boolean;
    actor?: string;
  },
) {
  const generated = input.lesson ? null : getGeneratedLesson(db, input.lessonId);
  const lessonObj = input.lesson ?? (generated?.lesson as Record<string, unknown>);
  const roadmapId = input.roadmapId ?? generated?.roadmapId;
  const lessonNodeId = input.lessonNodeId ?? generated?.lessonNodeId;
  const candidates = mapLessonCardsToSeedCandidates(input.lessonId, lessonObj);

  if (candidates.length === 0) {
    return { created: 0, existing: 0, skipped: 0, totalCandidates: 0, items: [] as SerializedRetrievalItem[] };
  }

  const tx = db.transaction(() => {
    let created = 0;
    let existing = 0;
    const items: SerializedRetrievalItem[] = [];
    const ts = now();
    const schedule = initialSchedule(new Date(), false);

    for (const candidate of candidates) {
      const existingRow = db
        .prepare('SELECT * FROM retrieval_items WHERE lesson_id = ? AND source_ref = ? AND status != ?')
        .get(input.lessonId, candidate.sourceRef, 'deleted') as RetrievalItemRow | undefined;

      if (existingRow && !input.force) {
        existing += 1;
        items.push(serializeRetrievalItem(existingRow));
        continue;
      }

      if (existingRow && input.force) {
        db.prepare("UPDATE retrieval_items SET status = 'deleted', updated_at = ? WHERE id = ?").run(
          ts,
          existingRow.id,
        );
      }

      const id = randomUUID();
      db.prepare(
        `INSERT INTO retrieval_items
          (id, roadmap_id, lesson_node_id, lesson_id, source_type, source_ref, item_type, prompt, answer, explanation, concept, difficulty, status, due_at, last_reviewed_at, reps, lapses, ease, interval_days, metadata_json, created_at, updated_at)
         VALUES (@id,@roadmapId,@lessonNodeId,@lessonId,'lesson_card',@sourceRef,@itemType,@prompt,@answer,@explanation,@concept,@difficulty,'active',@dueAt,NULL,0,0,2.5,0,@metadata,@ts,@ts)`,
      ).run({
        id,
        roadmapId: roadmapId ?? null,
        lessonNodeId: lessonNodeId ?? null,
        lessonId: input.lessonId,
        sourceRef: candidate.sourceRef,
        itemType: candidate.itemType,
        prompt: candidate.prompt,
        answer: candidate.answer ?? null,
        explanation: candidate.explanation ?? null,
        concept: candidate.concept ?? null,
        difficulty: candidate.difficulty ?? null,
        dueAt: schedule.dueAt,
        metadata: JSON.stringify(candidate.metadata ?? {}),
        ts,
      });
      created += 1;
      items.push(serializeRetrievalItem(getItemRow(db, id)));
    }

    if (created > 0) {
      recordAuditEvent(db, {
        actor: input.actor ?? 'api',
        action: 'seed_retrieval_items',
        entityType: 'retrieval_item',
        entityId: input.lessonId,
        metadata: { lessonId: input.lessonId, created, existing, roadmapId, lessonNodeId },
      });
    }

    return { created, existing, skipped: 0, totalCandidates: candidates.length, items };
  });

  return tx();
}

export function createRetrievalSession(
  db: Db,
  input: { roadmapId?: string; itemIds: string[] },
) {
  if (!input.itemIds.length) throw badRequest('itemIds must not be empty.');
  const items = getItemsByIds(db, input.itemIds);
  if (items.length !== input.itemIds.length) {
    throw badRequest('One or more retrieval items were not found.');
  }

  const id = randomUUID();
  const ts = now();
  db.prepare(
    `INSERT INTO retrieval_sessions (id, roadmap_id, started_at, ended_at, total_items, remembered_count, partial_count, forgot_count, metadata_json)
     VALUES (@id, @roadmapId, @ts, NULL, @total, 0, 0, 0, @metadata)`,
  ).run({
    id,
    roadmapId: input.roadmapId ?? null,
    ts,
    total: items.length,
    metadata: JSON.stringify({ itemIds: input.itemIds }),
  });

  return { session: serializeRetrievalSession(db.prepare('SELECT * FROM retrieval_sessions WHERE id = ?').get(id) as never), items };
}

export function recordRetrievalAttempt(
  db: Db,
  input: {
    sessionId?: string;
    itemId: string;
    rating: RetrievalRating;
    responseText?: string;
    correct?: boolean;
    durationMs?: number;
    actor?: string;
  },
) {
  const tx = db.transaction(() => {
    const row = getItemRow(db, input.itemId);
    const previousDueAt = row.due_at;
    const updated = applyRating(
      {
        reps: row.reps,
        lapses: row.lapses,
        ease: row.ease,
        intervalDays: row.interval_days,
        status: row.status as ScheduleState['status'],
      },
      input.rating,
      new Date(),
    );

    const ts = now();
    db.prepare(
      `UPDATE retrieval_items SET
        reps = @reps, lapses = @lapses, ease = @ease, interval_days = @intervalDays,
        due_at = @dueAt, last_reviewed_at = @lastReviewedAt, status = @status, updated_at = @ts
       WHERE id = @id`,
    ).run({
      id: row.id,
      reps: updated.reps,
      lapses: updated.lapses,
      ease: updated.ease,
      intervalDays: updated.intervalDays,
      dueAt: updated.dueAt,
      lastReviewedAt: updated.lastReviewedAt,
      status: updated.status,
      ts,
    });

    const attemptId = randomUUID();
    const truncatedResponse =
      input.responseText && input.responseText.length > 500
        ? `${input.responseText.slice(0, 497)}...`
        : input.responseText;

    db.prepare(
      `INSERT INTO retrieval_attempts
        (id, session_id, item_id, rating, response_text, correct, duration_ms, previous_due_at, next_due_at, created_at, metadata_json)
       VALUES (@id, @sessionId, @itemId, @rating, @responseText, @correct, @durationMs, @previousDueAt, @nextDueAt, @ts, NULL)`,
    ).run({
      id: attemptId,
      sessionId: input.sessionId ?? null,
      itemId: input.itemId,
      rating: input.rating,
      responseText: truncatedResponse ?? null,
      correct: input.correct === undefined ? (ratingToCorrect(input.rating) ? 1 : 0) : input.correct ? 1 : 0,
      durationMs: input.durationMs ?? null,
      previousDueAt,
      nextDueAt: updated.dueAt,
      ts,
    });

    if (input.sessionId) {
      const column =
        input.rating === 'remembered' || input.rating === 'easy'
          ? 'remembered_count'
          : input.rating === 'partial'
            ? 'partial_count'
            : 'forgot_count';
      db.prepare(`UPDATE retrieval_sessions SET ${column} = ${column} + 1 WHERE id = ?`).run(input.sessionId);
    }

    recordAuditEvent(db, {
      actor: input.actor ?? 'api',
      action: 'record_retrieval_attempt',
      entityType: 'retrieval_item',
      entityId: input.itemId,
      metadata: {
        rating: input.rating,
        sessionId: input.sessionId,
        nextDueAt: updated.dueAt,
        responseLength: truncatedResponse?.length ?? 0,
      },
    });

    return {
      attempt: serializeRetrievalAttempt(
        db.prepare('SELECT * FROM retrieval_attempts WHERE id = ?').get(attemptId) as never,
      ),
      item: serializeRetrievalItem(getItemRow(db, input.itemId)),
    };
  });

  return tx();
}

export function finishRetrievalSession(db: Db, sessionId: string, endedAt?: string) {
  const session = db.prepare('SELECT * FROM retrieval_sessions WHERE id = ?').get(sessionId);
  if (!session) throw notFound(`Session "${sessionId}" not found.`);

  const end = endedAt ?? now();
  const counts = db
    .prepare(
      `SELECT rating, COUNT(*) AS c FROM retrieval_attempts WHERE session_id = ? GROUP BY rating`,
    )
    .all(sessionId) as Array<{ rating: RetrievalRating; c: number }>;

  let remembered = 0;
  let partial = 0;
  let forgot = 0;
  for (const row of counts) {
    if (row.rating === 'remembered' || row.rating === 'easy') remembered += row.c;
    else if (row.rating === 'partial') partial += row.c;
    else if (row.rating === 'forgot') forgot += row.c;
  }

  db.prepare(
    `UPDATE retrieval_sessions SET ended_at = @end, remembered_count = @remembered, partial_count = @partial, forgot_count = @forgot WHERE id = @id`,
  ).run({ id: sessionId, end, remembered, partial, forgot });

  return serializeRetrievalSession(
    db.prepare('SELECT * FROM retrieval_sessions WHERE id = ?').get(sessionId) as never,
  );
}

export function getRetrievalSummary(db: Db, roadmapId?: string) {
  const ts = now();
  const params: unknown[] = [];
  let filter = "status != 'deleted'";
  if (roadmapId) {
    filter += ' AND roadmap_id = ?';
    params.push(roadmapId);
  }

  const active = (
    db.prepare(`SELECT COUNT(*) AS c FROM retrieval_items WHERE ${filter} AND status = 'active'`).get(...params) as {
      c: number;
    }
  ).c;
  const due = (
    db
      .prepare(`SELECT COUNT(*) AS c FROM retrieval_items WHERE ${filter} AND status = 'active' AND due_at <= ?`)
      .get(...params, ts) as { c: number }
  ).c;
  const mastered = (
    db.prepare(`SELECT COUNT(*) AS c FROM retrieval_items WHERE ${filter} AND status = 'mastered'`).get(...params) as {
      c: number;
    }
  ).c;

  const nextDueRow = db
    .prepare(
      `SELECT due_at FROM retrieval_items WHERE ${filter} AND status = 'active' ORDER BY due_at ASC LIMIT 1`,
    )
    .get(...params) as { due_at: string } | undefined;

  const weakConcepts = db
    .prepare(
      `SELECT concept, SUM(lapses) AS lapseTotal
       FROM retrieval_items
       WHERE ${filter} AND concept IS NOT NULL AND concept != ''
       GROUP BY concept
       HAVING lapseTotal >= 2
       ORDER BY lapseTotal DESC
       LIMIT 8`,
    )
    .all(...params) as Array<{ concept: string; lapseTotal: number }>;

  const attemptJoinFilter = roadmapId
    ? 'ri.roadmap_id = ? AND ri.status != \'deleted\''
    : "ri.status != 'deleted'";
  const attemptParams = roadmapId ? [roadmapId, 10] : [10];
  const recentAttempts = db
    .prepare(
      `SELECT ra.* FROM retrieval_attempts ra
       INNER JOIN retrieval_items ri ON ri.id = ra.item_id
       WHERE ${attemptJoinFilter}
       ORDER BY ra.created_at DESC LIMIT ?`,
    )
    .all(...attemptParams) as never[];

  return {
    activeCount: active,
    dueCount: due,
    masteredCount: mastered,
    weakConcepts: weakConcepts.map((w) => ({ concept: w.concept, lapses: w.lapseTotal })),
    recentAttempts: recentAttempts.map(serializeRetrievalAttempt),
    nextDueAt: nextDueRow?.due_at,
  };
}

export function inspectRetrievalSchedule(db: Db, itemId: string) {
  const item = serializeRetrievalItem(getItemRow(db, itemId));
  const attempts = db
    .prepare('SELECT * FROM retrieval_attempts WHERE item_id = ? ORDER BY created_at DESC LIMIT 20')
    .all(itemId) as never[];
  return { item, attempts: attempts.map(serializeRetrievalAttempt) };
}

const DEMO_TITLE_PATTERNS = [
  /smoke\s*test/i,
  /placeholder/i,
  /\bdummy\b/i,
  /\bdemo\b/i,
  /audit\s*test/i,
  /graphs\s*101/i,
  /intro\s*to\s*graphs/i,
  /microlearn\s*mcp/i,
  /\bsample\b/i,
];

function isDemoTitle(title: string | null | undefined): boolean {
  if (!title?.trim()) return false;
  return DEMO_TITLE_PATTERNS.some((pattern) => pattern.test(title));
}

export function softDeleteReviewSet(db: Db, reviewSetId: string, actor = 'api') {
  const row = db
    .prepare("SELECT * FROM review_sets WHERE id = ? AND status != 'deleted'")
    .get(reviewSetId) as ReviewSetRow | undefined;
  if (!row) throw notFound(`Review set "${reviewSetId}" not found.`);

  const ts = now();
  const tx = db.transaction(() => {
    db.prepare("UPDATE review_sets SET status = 'deleted', updated_at = ? WHERE id = ?").run(ts, reviewSetId);
    db.prepare("UPDATE retrieval_items SET status = 'deleted', updated_at = ? WHERE review_set_id = ?").run(
      ts,
      reviewSetId,
    );
    recordAuditEvent(db, {
      actor,
      action: 'delete_review_set',
      entityType: 'review_set',
      entityId: reviewSetId,
      metadata: { lessonId: row.lesson_id },
    });
  });
  tx();
  return { ok: true as const, reviewSetId };
}

export function softDeleteRetrievalItem(db: Db, itemId: string, actor = 'api') {
  const row = getItemRow(db, itemId);
  const ts = now();
  db.prepare("UPDATE retrieval_items SET status = 'deleted', updated_at = ? WHERE id = ?").run(ts, itemId);
  recordAuditEvent(db, {
    actor,
    action: 'delete_retrieval_item',
    entityType: 'retrieval_item',
    entityId: itemId,
    metadata: { reviewSetId: row.review_set_id, lessonId: row.lesson_id },
  });
  return { ok: true as const, itemId };
}

/** Soft-delete demo/smoke review sets and orphaned active retrieval items. */
export function cleanupDemoRetrievalContent(db: Db, actor = 'api') {
  const ts = now();
  let reviewSets = 0;
  let items = 0;

  const activeSets = db
    .prepare(
      `SELECT rs.id, rs.title, gl.title AS lesson_title
       FROM review_sets rs
       LEFT JOIN generated_lessons gl ON gl.id = rs.lesson_id
       WHERE rs.status = 'active'`,
    )
    .all() as Array<{ id: string; title: string; lesson_title: string | null }>;

  const tx = db.transaction(() => {
    for (const set of activeSets) {
      if (!isDemoTitle(set.title) && !isDemoTitle(set.lesson_title)) continue;
      db.prepare("UPDATE review_sets SET status = 'deleted', updated_at = ? WHERE id = ?").run(ts, set.id);
      db.prepare("UPDATE retrieval_items SET status = 'deleted', updated_at = ? WHERE review_set_id = ?").run(
        ts,
        set.id,
      );
      reviewSets += 1;
    }

    const orphanItems = db
      .prepare(
        `SELECT ri.id, ri.prompt, rs.status AS review_set_status, gl.title AS lesson_title, gl.deleted_at AS lesson_deleted
         FROM retrieval_items ri
         LEFT JOIN review_sets rs ON rs.id = ri.review_set_id
         LEFT JOIN generated_lessons gl ON gl.id = ri.lesson_id
         WHERE ri.status = 'active'`,
      )
      .all() as Array<{
        id: string;
        prompt: string;
        review_set_status: string | null;
        lesson_title: string | null;
        lesson_deleted: string | null;
      }>;

    for (const item of orphanItems) {
      const demo =
        isDemoTitle(item.prompt) ||
        isDemoTitle(item.lesson_title) ||
        item.review_set_status === 'deleted' ||
        Boolean(item.lesson_deleted);
      if (!demo) continue;
      db.prepare("UPDATE retrieval_items SET status = 'deleted', updated_at = ? WHERE id = ?").run(ts, item.id);
      items += 1;
    }
  });
  tx();

  if (reviewSets > 0 || items > 0) {
    recordAuditEvent(db, {
      actor,
      action: 'cleanup_demo_retrieval',
      entityType: 'retrieval',
      entityId: 'cleanup',
      metadata: { reviewSets, items },
    });
  }

  return { ok: true as const, reviewSets, items };
}

export function listRetrievalAttempts(
  db: Db,
  options: { itemId?: string; roadmapId?: string; limit?: number },
) {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  if (options.itemId) {
    const rows = db
      .prepare('SELECT * FROM retrieval_attempts WHERE item_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(options.itemId, limit) as never[];
    return rows.map(serializeRetrievalAttempt);
  }
  if (options.roadmapId) {
    const rows = db
      .prepare(
        `SELECT ra.* FROM retrieval_attempts ra
         INNER JOIN retrieval_items ri ON ri.id = ra.item_id
         WHERE ri.roadmap_id = ?
         ORDER BY ra.created_at DESC LIMIT ?`,
      )
      .all(options.roadmapId, limit) as never[];
    return rows.map(serializeRetrievalAttempt);
  }
  const rows = db
    .prepare('SELECT * FROM retrieval_attempts ORDER BY created_at DESC LIMIT ?')
    .all(limit) as never[];
  return rows.map(serializeRetrievalAttempt);
}
