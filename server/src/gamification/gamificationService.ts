import type { Db } from '../db';
import { recordAuditEvent } from '../audit/auditService';
import type { ActivityEventType } from './gamificationTypes';
import {
  bumpDailyActivity,
  buildProfileSummary,
  dayKey,
  getAchievementByKey,
  getMetricsSnapshot,
  listAchievementsWithStatus,
  listDailyActivityRows,
  seedGamificationCatalog,
  unlockAchievement,
  updateStreak,
} from './gamificationRepository';
import { serializeDailyActivity } from './gamificationSerialization';
import type { RetrievalRating } from '../retrieval/retrievalTypes';

/** Evaluates criteria and unlocks newly earned achievements. Returns newly unlocked keys. */
export function evaluateAchievements(db: Db): string[] {
  const metrics = getMetricsSnapshot(db);
  const rows = db.prepare('SELECT * FROM achievements').all() as Array<{
    id: string;
    key: string;
    criteria_json: string;
  }>;

  const unlocked: string[] = [];
  for (const row of rows) {
    let criteria: { metric?: string; min?: number };
    try {
      criteria = JSON.parse(row.criteria_json) as { metric?: string; min?: number };
    } catch {
      continue;
    }
    const metric = criteria.metric;
    if (!metric) continue;
    const min = criteria.min ?? 1;
    const value = metrics[metric] ?? 0;
    if (value >= min && unlockAchievement(db, row.id, value)) {
      unlocked.push(row.key);
      if (row.key === 'comeback') {
        db.prepare("DELETE FROM app_metadata WHERE key = 'comeback_eligible'").run();
      }
    }
  }
  return unlocked;
}

/** Seeds catalog on startup; safe to call every boot. */
export function initGamification(db: Db): void {
  seedGamificationCatalog(db);
}

function sanitizeEvent(event: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const allowed = [
    'lessonId',
    'roadmapId',
    'lessonNodeId',
    'xp',
    'subjectId',
    'sourceType',
    'sessionId',
    'totalItems',
    'forgotCount',
    'rememberedCount',
    'durationMs',
  ];
  for (const key of allowed) {
    if (event[key] !== undefined) out[key] = event[key];
  }
  return out;
}

/** Generic activity event handler for REST/MCP/app fallback. */
export function processActivityEvent(
  db: Db,
  eventType: ActivityEventType,
  event: Record<string, unknown>,
  actor = 'api',
): { unlocked: string[] } {
  const safe = sanitizeEvent(event);
  const day = dayKey();
  let unlocked: string[] = [];

  switch (eventType) {
    case 'lesson_completed': {
      const xp = typeof safe.xp === 'number' ? Math.min(Math.max(safe.xp, 0), 500) : 10;
      bumpDailyActivity(db, day, { lessonsCompleted: 1, xpEarned: xp, roadmapProgressEvents: 1 });
      updateStreak(db, 'study', day);
      unlocked = evaluateAchievements(db);
      break;
    }
    case 'retrieval_completed': {
      const minutes = typeof safe.durationMs === 'number' ? Math.ceil(safe.durationMs / 60_000) : 1;
      bumpDailyActivity(db, day, { activeMinutes: Math.min(minutes, 120) });
      updateStreak(db, 'study', day);
      unlocked = evaluateAchievements(db);
      break;
    }
    case 'roadmap_started': {
      updateStreak(db, 'study', day);
      unlocked = evaluateAchievements(db);
      break;
    }
    case 'roadmap_completed': {
      bumpDailyActivity(db, day, { roadmapProgressEvents: 1 });
      updateStreak(db, 'study', day);
      unlocked = evaluateAchievements(db);
      break;
    }
    case 'creation_completed': {
      bumpDailyActivity(db, day, { xpEarned: 5 });
      updateStreak(db, 'study', day);
      if (safe.sourceType === 'document') {
        const paper = getAchievementByKey(db, 'paper_learner');
        if (paper) unlockAchievement(db, paper.id);
      }
      unlocked = evaluateAchievements(db);
      break;
    }
    default:
      break;
  }

  if (unlocked.length > 0) {
    recordAuditEvent(db, {
      actor,
      action: 'achievement_unlocked',
      entityType: 'achievement',
      metadata: { eventType, unlocked, event: safe },
    });
  }

  return { unlocked };
}

/** Called after each retrieval attempt is persisted. */
export function handleRetrievalAttempt(
  db: Db,
  input: {
    sessionId?: string;
    rating: RetrievalRating;
    durationMs?: number;
  },
): string[] {
  const day = dayKey();
  const patch: Parameters<typeof bumpDailyActivity>[2] = {
    retrievalItemsReviewed: 1,
    activeMinutes: input.durationMs ? Math.min(Math.ceil(input.durationMs / 60_000), 30) : 0,
  };
  if (input.rating === 'remembered' || input.rating === 'easy') patch.retrievalRemembered = 1;
  else if (input.rating === 'partial') patch.retrievalPartial = 1;
  else patch.retrievalForgot = 1;

  bumpDailyActivity(db, day, patch);
  updateStreak(db, 'retrieval', day);
  updateStreak(db, 'study', day);

  if (input.sessionId) {
    const session = db.prepare('SELECT metadata_json FROM retrieval_sessions WHERE id = ?').get(input.sessionId) as
      | { metadata_json: string | null }
      | undefined;
    let meta: Record<string, unknown> = {};
    if (session?.metadata_json) {
      try {
        meta = JSON.parse(session.metadata_json) as Record<string, unknown>;
      } catch {
        meta = {};
      }
    }
    let combo = typeof meta.combo === 'number' ? meta.combo : 0;
    let maxCombo = typeof meta.maxCombo === 'number' ? meta.maxCombo : 0;
    if (input.rating === 'remembered' || input.rating === 'easy') {
      combo += 1;
      maxCombo = Math.max(maxCombo, combo);
    } else {
      combo = 0;
    }
    meta.combo = combo;
    meta.maxCombo = maxCombo;
    db.prepare('UPDATE retrieval_sessions SET metadata_json = ? WHERE id = ?').run(
      JSON.stringify(meta),
      input.sessionId,
    );
  }

  const unlocked = evaluateAchievements(db);
  if (unlocked.length > 0) {
    recordAuditEvent(db, {
      actor: 'api',
      action: 'achievement_unlocked',
      entityType: 'achievement',
      metadata: { source: 'retrieval_attempt', unlocked },
    });
  }
  return unlocked;
}

/** Called after a retrieval session is finished. */
export function handleRetrievalSessionComplete(db: Db, sessionId: string): string[] {
  const session = db.prepare('SELECT * FROM retrieval_sessions WHERE id = ?').get(sessionId) as
    | {
        forgot_count: number;
        total_items: number;
        remembered_count: number;
        partial_count: number;
      }
    | undefined;
  if (!session) return [];

  processActivityEvent(db, 'retrieval_completed', {
    sessionId,
    totalItems: session.total_items,
    forgotCount: session.forgot_count,
    rememberedCount: session.remembered_count,
  });

  return evaluateAchievements(db);
}

/** Called after lesson outcome is stored. */
export function handleLessonOutcome(db: Db, input: {
  roadmapId: string;
  lessonNodeId: string;
  lessonId: string;
  outcome?: Record<string, unknown>;
}): string[] {
  const xp = typeof input.outcome?.masteryEstimate === 'number' ? 15 : 10;
  const result = processActivityEvent(db, 'lesson_completed', {
    roadmapId: input.roadmapId,
    lessonNodeId: input.lessonNodeId,
    lessonId: input.lessonId,
    xp,
  });

  const stats = db
    .prepare(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS done
       FROM lesson_nodes WHERE roadmap_id = ?`,
    )
    .get(input.roadmapId) as { total: number; done: number };
  if (stats.total > 0 && stats.done >= stats.total) {
    processActivityEvent(db, 'roadmap_completed', { roadmapId: input.roadmapId });
  }

  return result.unlocked;
}

export function getProfileSummary(db: Db) {
  return buildProfileSummary(db);
}

export function getAchievements(
  db: Db,
  options: { category?: string; unlockedOnly?: boolean } = {},
) {
  return listAchievementsWithStatus(db, options);
}

export function getDailyActivity(db: Db, days = 14) {
  return listDailyActivityRows(db, days).map(serializeDailyActivity);
}

export function recordActivityEvent(
  db: Db,
  eventType: ActivityEventType,
  event: Record<string, unknown>,
  actor = 'api',
) {
  return processActivityEvent(db, eventType, event, actor);
}
