import type { Db } from '../db';
import { getMetricsSnapshot, unlockAchievement } from '../gamification/gamificationRepository';

/** Reconciles earned records strictly from persisted metrics and stored criteria. */
export function recalculateAchievementRecords(db: Db) {
  const metrics = getMetricsSnapshot(db);
  const definitions = db.prepare('SELECT id, key, criteria_json FROM achievements').all() as Array<{
    id: string;
    key: string;
    criteria_json: string;
  }>;
  const awarded: string[] = [];
  const revoked: string[] = [];
  const preservedHistorical: string[] = [];
  let unchangedCount = 0;

  db.transaction(() => {
    for (const definition of definitions) {
      let criteria: { metric?: string; min?: number };
      try {
        criteria = JSON.parse(definition.criteria_json) as { metric?: string; min?: number };
      } catch {
        unchangedCount += 1;
        continue;
      }
      if (!criteria.metric) {
        unchangedCount += 1;
        continue;
      }
      const value = metrics[criteria.metric] ?? 0;
      const earned = value >= (criteria.min ?? 1);
      const existing = db.prepare('SELECT id FROM user_achievements WHERE achievement_id=?').get(definition.id) as { id: string } | undefined;
      if (earned && !existing) {
        unlockAchievement(db, definition.id, value);
        awarded.push(definition.key);
      } else if (!earned && existing) {
        // Existing achievement rules are one-way unlocks; current streak/path metrics may later fall.
        preservedHistorical.push(definition.key);
        unchangedCount += 1;
      } else {
        if (earned && existing) db.prepare('UPDATE user_achievements SET progress_value=? WHERE id=?').run(value, existing.id);
        unchangedCount += 1;
      }
    }
  })();
  return { awarded, revoked, preservedHistorical, unchangedCount, evidenceMetrics: metrics };
}
