import { randomUUID } from 'node:crypto';
import type { Db } from '../db';
import { setMetadata } from '../db';
import { ACHIEVEMENT_DEFINITIONS } from './achievementDefinitions';
import {
  emptyDailyActivity,
  serializeAchievement,
  serializeDailyActivity,
  serializeStreak,
  type SerializedAchievement,
  type SerializedDailyActivity,
  type SerializedProfileSummary,
} from './gamificationSerialization';
import type {
  AchievementRow,
  DailyActivityRow,
  LearningStreakRow,
  StreakType,
} from './gamificationTypes';
import { countRetrievalItems, getRetrievalSummary } from '../retrieval/retrievalRepository';

function now(): string {
  return new Date().toISOString();
}

export function dayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function countAchievements(db: Db): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM achievements').get() as { c: number }).c;
}

export function countUserAchievements(db: Db): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM user_achievements').get() as { c: number }).c;
}

export function countDailyActivityDays(db: Db): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM daily_activity').get() as { c: number }).c;
}

export function getStreakRow(db: Db, type: StreakType): LearningStreakRow | undefined {
  return db.prepare('SELECT * FROM learning_streaks WHERE streak_type = ?').get(type) as
    | LearningStreakRow
    | undefined;
}

/** Idempotently seeds achievement definitions and streak rows. */
export function seedGamificationCatalog(db: Db): void {
  const ts = now();
  const insert = db.prepare(
    `INSERT INTO achievements (id, key, title, description, category, tier, icon, accent, criteria_json, created_at, updated_at)
     VALUES (@id, @key, @title, @description, @category, @tier, @icon, @accent, @criteria, @ts, @ts)
     ON CONFLICT(key) DO UPDATE SET
       title = excluded.title,
       description = excluded.description,
       category = excluded.category,
       tier = excluded.tier,
       icon = excluded.icon,
       accent = excluded.accent,
       criteria_json = excluded.criteria_json,
       updated_at = excluded.updated_at`,
  );

  for (const def of ACHIEVEMENT_DEFINITIONS) {
    insert.run({
      id: randomUUID(),
      key: def.key,
      title: def.title,
      description: def.description,
      category: def.category,
      tier: def.tier,
      icon: def.icon ?? null,
      accent: def.accent ?? null,
      criteria: JSON.stringify(def.criteria),
      ts,
    });
  }

  for (const type of ['study', 'retrieval'] as StreakType[]) {
    db.prepare(
      `INSERT INTO learning_streaks (id, streak_type, current_count, best_count, last_active_day, updated_at)
       VALUES (@id, @type, 0, 0, NULL, @ts)
       ON CONFLICT(streak_type) DO NOTHING`,
    ).run({ id: randomUUID(), type, ts });
  }
}

export function getOrCreateDailyActivity(db: Db, day: string): DailyActivityRow {
  const existing = db.prepare('SELECT * FROM daily_activity WHERE day = ?').get(day) as
    | DailyActivityRow
    | undefined;
  if (existing) return existing;

  const ts = now();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO daily_activity
      (id, day, lessons_completed, retrieval_items_reviewed, retrieval_remembered, retrieval_partial, retrieval_forgot, xp_earned, active_minutes, roadmap_progress_events, created_at, updated_at)
     VALUES (@id, @day, 0, 0, 0, 0, 0, 0, 0, 0, @ts, @ts)`,
  ).run({ id, day, ts });
  return db.prepare('SELECT * FROM daily_activity WHERE day = ?').get(day) as DailyActivityRow;
}

export function bumpDailyActivity(
  db: Db,
  day: string,
  patch: Partial<{
    lessonsCompleted: number;
    retrievalItemsReviewed: number;
    retrievalRemembered: number;
    retrievalPartial: number;
    retrievalForgot: number;
    xpEarned: number;
    activeMinutes: number;
    roadmapProgressEvents: number;
  }>,
): DailyActivityRow {
  getOrCreateDailyActivity(db, day);
  const ts = now();
  db.prepare(
    `UPDATE daily_activity SET
      lessons_completed = lessons_completed + @lessonsCompleted,
      retrieval_items_reviewed = retrieval_items_reviewed + @retrievalItemsReviewed,
      retrieval_remembered = retrieval_remembered + @retrievalRemembered,
      retrieval_partial = retrieval_partial + @retrievalPartial,
      retrieval_forgot = retrieval_forgot + @retrievalForgot,
      xp_earned = xp_earned + @xpEarned,
      active_minutes = active_minutes + @activeMinutes,
      roadmap_progress_events = roadmap_progress_events + @roadmapProgressEvents,
      updated_at = @ts
     WHERE day = @day`,
  ).run({
    day,
    ts,
    lessonsCompleted: patch.lessonsCompleted ?? 0,
    retrievalItemsReviewed: patch.retrievalItemsReviewed ?? 0,
    retrievalRemembered: patch.retrievalRemembered ?? 0,
    retrievalPartial: patch.retrievalPartial ?? 0,
    retrievalForgot: patch.retrievalForgot ?? 0,
    xpEarned: patch.xpEarned ?? 0,
    activeMinutes: patch.activeMinutes ?? 0,
    roadmapProgressEvents: patch.roadmapProgressEvents ?? 0,
  });
  return db.prepare('SELECT * FROM daily_activity WHERE day = ?').get(day) as DailyActivityRow;
}

function daysBetween(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00.000Z`).getTime();
  const db = new Date(`${b}T00:00:00.000Z`).getTime();
  return Math.round((db - da) / 86_400_000);
}

/** Updates a streak for the given day; returns whether a comeback occurred (3+ day gap). */
export function updateStreak(db: Db, type: StreakType, day: string): { comeback: boolean } {
  const row = getStreakRow(db, type);
  if (!row) return { comeback: false };

  const ts = now();
  let current = row.current_count;
  let best = row.best_count;
  let comeback = false;

  if (!row.last_active_day) {
    current = 1;
  } else if (row.last_active_day === day) {
    // same day — no streak change
  } else {
    const gap = daysBetween(row.last_active_day, day);
    if (gap === 1) {
      current += 1;
    } else {
  if (type === 'study' && gap >= 3) {
      comeback = true;
      setMetadata(db, 'comeback_eligible', '1');
    }
      current = 1;
    }
  }

  best = Math.max(best, current);
  db.prepare(
    `UPDATE learning_streaks SET current_count = @current, best_count = @best, last_active_day = @day, updated_at = @ts WHERE streak_type = @type`,
  ).run({ current, best, day, ts, type });

  return { comeback };
}

export function listDailyActivityRows(db: Db, days: number): DailyActivityRow[] {
  const limit = Math.min(Math.max(days, 1), 90);
  return db
    .prepare('SELECT * FROM daily_activity ORDER BY day DESC LIMIT ?')
    .all(limit) as DailyActivityRow[];
}

export function listAchievementsWithStatus(
  db: Db,
  options: { category?: string; unlockedOnly?: boolean } = {},
): SerializedAchievement[] {
  let sql = `SELECT a.*, ua.id AS ua_id, ua.unlocked_at, ua.progress_value
    FROM achievements a
    LEFT JOIN user_achievements ua ON ua.achievement_id = a.id`;
  const params: unknown[] = [];
  const clauses: string[] = [];
  if (options.category) {
    clauses.push('a.category = ?');
    params.push(options.category);
  }
  if (options.unlockedOnly) {
    clauses.push('ua.id IS NOT NULL');
  }
  if (clauses.length) sql += ` WHERE ${clauses.join(' AND ')}`;
  sql += ' ORDER BY a.category, a.tier, a.title';

  const rows = db.prepare(sql).all(...params) as Array<
    AchievementRow & { ua_id?: string; unlocked_at?: string; progress_value?: number }
  >;

  return rows.map((r) =>
    serializeAchievement(r, r.ua_id ? { id: r.ua_id, achievement_id: r.id, unlocked_at: r.unlocked_at!, progress_value: r.progress_value ?? 0, metadata_json: null } : undefined),
  );
}

export function unlockAchievement(db: Db, achievementId: string, progressValue = 0): boolean {
  const existing = db
    .prepare('SELECT id FROM user_achievements WHERE achievement_id = ?')
    .get(achievementId) as { id: string } | undefined;
  if (existing) return false;

  db.prepare(
    `INSERT INTO user_achievements (id, achievement_id, unlocked_at, progress_value, metadata_json)
     VALUES (@id, @achievementId, @ts, @progress, NULL)`,
  ).run({ id: randomUUID(), achievementId, ts: now(), progress: progressValue });
  return true;
}

export function getTotalXp(db: Db): number {
  return (db.prepare('SELECT COALESCE(SUM(xp_earned), 0) AS s FROM daily_activity').get() as { s: number }).s;
}

export function getRoadmapCounts(db: Db): { activeCount: number; completedCount: number } {
  const roadmaps = db
    .prepare("SELECT id FROM roadmaps WHERE status != 'deleted'")
    .all() as Array<{ id: string }>;
  let completedCount = 0;
  for (const r of roadmaps) {
    const stats = db
      .prepare(
        `SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS done
         FROM lesson_nodes WHERE roadmap_id = ?`,
      )
      .get(r.id) as { total: number; done: number };
    if (stats.total > 0 && stats.done >= stats.total) completedCount += 1;
  }
  return { activeCount: roadmaps.length - completedCount, completedCount };
}

export function buildProfileSummary(db: Db): SerializedProfileSummary {
  const today = dayKey();
  const todayRow = getOrCreateDailyActivity(db, today);
  const last7 = listDailyActivityRows(db, 7).map(serializeDailyActivity).reverse();

  const pad7: SerializedDailyActivity[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const key = dayKey(d);
    const found = last7.find((a) => a.day === key);
    pad7.push(found ?? emptyDailyActivity(key));
  }

  const achievements = listAchievementsWithStatus(db);
  const unlocked = achievements.filter((a) => a.unlocked);
  const recent = [...unlocked]
    .sort((a, b) => (b.unlockedAt ?? '').localeCompare(a.unlockedAt ?? ''))
    .slice(0, 5);

  const retrievalSummary = getRetrievalSummary(db);
  const reviewedCount = (db.prepare('SELECT COUNT(*) AS c FROM retrieval_attempts').get() as { c: number }).c;
  const remembered = (db.prepare("SELECT COUNT(*) AS c FROM retrieval_attempts WHERE rating IN ('remembered','easy')").get() as { c: number }).c;
  const rememberedRate = reviewedCount > 0 ? Math.round((remembered / reviewedCount) * 100) / 100 : undefined;

  return {
    xp: getTotalXp(db),
    streaks: {
      study: serializeStreak(getStreakRow(db, 'study')),
      retrieval: serializeStreak(getStreakRow(db, 'retrieval')),
    },
    achievements: {
      unlockedCount: unlocked.length,
      totalCount: achievements.length,
      recent,
    },
    retrieval: {
      reviewedCount,
      masteredCount: retrievalSummary.masteredCount,
      dueCount: retrievalSummary.dueCount,
      rememberedRate,
    },
    roadmaps: getRoadmapCounts(db),
    activity: {
      today: serializeDailyActivity(todayRow),
      last7Days: pad7,
    },
  };
}

export function getAchievementByKey(db: Db, key: string): AchievementRow | undefined {
  return db.prepare('SELECT * FROM achievements WHERE key = ?').get(key) as AchievementRow | undefined;
}

export function getMetricsSnapshot(db: Db): Record<string, number> {
  const retrievalReviews = (db.prepare('SELECT COUNT(*) AS c FROM retrieval_attempts').get() as { c: number }).c;
  const perfectSessions = (db.prepare(
    `SELECT COUNT(*) AS c FROM retrieval_sessions WHERE ended_at IS NOT NULL AND forgot_count = 0 AND total_items > 0`,
  ).get() as { c: number }).c;
  const maxCombo = (db.prepare(
    `SELECT COALESCE(MAX(CAST(json_extract(metadata_json, '$.maxCombo') AS INTEGER)), 0) AS m FROM retrieval_sessions`,
  ).get() as { m: number }).m;
  const studyDays = countDailyActivityDays(db);
  const studyStreak = getStreakRow(db, 'study')?.current_count ?? 0;
  const roadmapsStarted = (db.prepare("SELECT COUNT(*) AS c FROM roadmaps WHERE status != 'deleted'").get() as { c: number }).c;
  const roadmapsCompleted = getRoadmapCounts(db).completedCount;
  const deepPath = (db.prepare(
    `SELECT COALESCE(MAX(done), 0) AS m FROM (
       SELECT roadmap_id, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS done
       FROM lesson_nodes GROUP BY roadmap_id
     )`,
  ).get() as { m: number }).m;
  const hasGenerated = (db.prepare('SELECT COUNT(*) AS c FROM generated_lessons').get() as { c: number }).c > 0;
  const hasRoadmap = (db.prepare("SELECT COUNT(*) AS c FROM roadmaps WHERE status != 'deleted'").get() as { c: number }).c > 0;
  const paperLearner = (db.prepare(
    `SELECT COUNT(*) AS c FROM source_documents WHERE status = 'ready'`,
  ).get() as { c: number }).c;
  const masteredItems = (db.prepare("SELECT COUNT(*) AS c FROM retrieval_items WHERE status = 'mastered'").get() as { c: number }).c;
  const lessonsInRoadmap = (db.prepare(
    `SELECT COALESCE(MAX(cnt), 0) AS m FROM (
       SELECT roadmap_id, COUNT(*) AS cnt FROM lesson_outcomes GROUP BY roadmap_id
     )`,
  ).get() as { m: number }).m;
  const comebackEligible =
    (db.prepare("SELECT value FROM app_metadata WHERE key = 'comeback_eligible'").get() as
      | { value: string }
      | undefined)?.value === '1'
      ? 1
      : 0;

  return {
    retrieval_reviews_total: retrievalReviews,
    perfect_sessions: perfectSessions,
    retrieval_combo: maxCombo,
    study_days_total: studyDays,
    study_streak: studyStreak,
    roadmaps_started: roadmapsStarted,
    roadmaps_completed: roadmapsCompleted,
    roadmap_lessons_completed: deepPath,
    creations: hasGenerated || hasRoadmap ? 1 : 0,
    paper_learner: paperLearner > 0 ? 1 : 0,
    mastered_items: masteredItems,
    lessons_in_roadmap: lessonsInRoadmap,
    comeback: comebackEligible,
  };
}

export { countRetrievalItems };
