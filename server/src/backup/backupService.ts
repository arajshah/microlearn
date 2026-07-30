import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { Db } from '../db';
import type { ServerConfig } from '../config';
import { countAuditEvents } from '../audit/auditService';

const BACKUP_DIR = 'server/backups';

export interface BackupFileInfo {
  name: string;
  path: string;
  sizeBytes: number;
  modifiedAt: string;
  kind: 'json' | 'db' | 'other';
}

function backupRoot(repoRoot: string): string {
  return path.join(repoRoot, BACKUP_DIR);
}

function ensureBackupDir(repoRoot: string): string {
  const dir = backupRoot(repoRoot);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function timestampLabel(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function safeBackupPath(repoRoot: string, filename: string): string {
  const dir = ensureBackupDir(repoRoot);
  const resolved = path.resolve(dir, filename);
  if (!resolved.startsWith(path.resolve(dir) + path.sep) && resolved !== path.resolve(dir)) {
    throw new Error('Invalid backup path.');
  }
  return resolved;
}

export function listBackupFiles(repoRoot: string, limit = 50): BackupFileInfo[] {
  const dir = ensureBackupDir(repoRoot);
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile())
    .map((e) => {
      const full = path.join(dir, e.name);
      const stat = fs.statSync(full);
      const ext = path.extname(e.name).toLowerCase();
      const kind: BackupFileInfo['kind'] = ext === '.json' ? 'json' : ext === '.db' ? 'db' : 'other';
      return {
        name: e.name,
        path: path.relative(repoRoot, full),
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        kind,
      };
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  return files.slice(0, Math.min(Math.max(limit, 1), 200));
}

export function countBackups(repoRoot: string): number {
  const dir = backupRoot(repoRoot);
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter((n) => fs.statSync(path.join(dir, n)).isFile()).length;
}

export function exportCurriculumBackup(db: Db, repoRoot: string, includeDeleted = false) {
  const roadmaps = includeDeleted
    ? (db.prepare('SELECT * FROM roadmaps ORDER BY updated_at DESC').all() as Record<string, unknown>[])
    : (db.prepare("SELECT * FROM roadmaps WHERE status != 'deleted' ORDER BY updated_at DESC").all() as Record<string, unknown>[]);

  const payload = {
    exportedAt: new Date().toISOString(),
    counts: {
      roadmaps: roadmaps.length,
      units: (db.prepare('SELECT COUNT(*) AS c FROM roadmap_units').get() as { c: number }).c,
      lessonNodes: (db.prepare('SELECT COUNT(*) AS c FROM lesson_nodes').get() as { c: number }).c,
      blueprints: (db.prepare('SELECT COUNT(*) AS c FROM lesson_blueprints').get() as { c: number }).c,
      generatedLessons: (db.prepare('SELECT COUNT(*) AS c FROM generated_lessons').get() as { c: number }).c,
      outcomes: (db.prepare('SELECT COUNT(*) AS c FROM lesson_outcomes').get() as { c: number }).c,
      contentVersions: (db.prepare('SELECT COUNT(*) AS c FROM content_versions').get() as { c: number }).c,
      auditEvents: countAuditEvents(db),
      sourceDocuments: (db.prepare('SELECT COUNT(*) AS c FROM source_documents').get() as { c: number }).c,
      retrievalItems: (db.prepare('SELECT COUNT(*) AS c FROM retrieval_items').get() as { c: number }).c,
      retrievalSessions: (db.prepare('SELECT COUNT(*) AS c FROM retrieval_sessions').get() as { c: number }).c,
      retrievalAttempts: (db.prepare('SELECT COUNT(*) AS c FROM retrieval_attempts').get() as { c: number }).c,
      achievements: (db.prepare('SELECT COUNT(*) AS c FROM achievements').get() as { c: number }).c,
      userAchievements: (db.prepare('SELECT COUNT(*) AS c FROM user_achievements').get() as { c: number }).c,
      dailyActivityDays: (db.prepare('SELECT COUNT(*) AS c FROM daily_activity').get() as { c: number }).c,
    },
    roadmaps,
    roadmap_units: db.prepare('SELECT * FROM roadmap_units').all(),
    lesson_nodes: db.prepare('SELECT * FROM lesson_nodes').all(),
    lesson_blueprints: db.prepare('SELECT * FROM lesson_blueprints').all(),
    generated_lessons: db.prepare('SELECT * FROM generated_lessons').all(),
    lesson_outcomes: db.prepare('SELECT * FROM lesson_outcomes').all(),
    content_versions: db.prepare('SELECT * FROM content_versions ORDER BY created_at DESC LIMIT 500').all(),
    source_documents: db.prepare('SELECT id, source_type, url, normalized_url, title, mime_type, status, summary_json, metadata_json, error_code, error_message, created_at, updated_at FROM source_documents ORDER BY updated_at DESC').all(),
    retrieval_items: db.prepare('SELECT id, roadmap_id, lesson_node_id, lesson_id, source_type, source_ref, item_type, prompt, concept, difficulty, status, due_at, last_reviewed_at, reps, lapses, ease, interval_days, metadata_json, created_at, updated_at FROM retrieval_items ORDER BY updated_at DESC').all(),
    retrieval_sessions: db.prepare('SELECT * FROM retrieval_sessions ORDER BY started_at DESC LIMIT 500').all(),
    retrieval_attempts: db.prepare('SELECT id, session_id, item_id, rating, correct, duration_ms, previous_due_at, next_due_at, created_at FROM retrieval_attempts ORDER BY created_at DESC LIMIT 1000').all(),
    achievements: db.prepare('SELECT id, key, title, category, tier, icon, accent, created_at FROM achievements ORDER BY category, tier').all(),
    user_achievements: db.prepare('SELECT id, achievement_id, unlocked_at, progress_value FROM user_achievements ORDER BY unlocked_at DESC').all(),
    daily_activity: db.prepare('SELECT day, lessons_completed, retrieval_items_reviewed, retrieval_remembered, retrieval_partial, retrieval_forgot, xp_earned, active_minutes, roadmap_progress_events FROM daily_activity ORDER BY day DESC LIMIT 365').all(),
    learning_streaks: db.prepare('SELECT streak_type, current_count, best_count, last_active_day, updated_at FROM learning_streaks').all(),
    audit_summary: db.prepare('SELECT action, COUNT(*) AS count FROM audit_events GROUP BY action').all(),
  };

  const filename = `curriculum-backup-${timestampLabel()}.json`;
  const outPath = safeBackupPath(repoRoot, filename);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
  const stat = fs.statSync(outPath);
  return {
    path: path.relative(repoRoot, outPath),
    sizeBytes: stat.size,
    timestamp: payload.exportedAt,
    counts: payload.counts,
  };
}

/** WAL checkpoint helper — uses a short-lived connection to the live DB file. */
function checkpointDb(dbPath: string): void {
  const conn = new Database(dbPath);
  try {
    conn.pragma('wal_checkpoint(TRUNCATE)');
  } finally {
    conn.close();
  }
}

/** Copies the SQLite database to server/backups/ using the backup API when possible. */
export function exportSqliteBackup(config: ServerConfig): { path: string; sizeBytes: number } {
  const filename = `sqlite-backup-${timestampLabel()}.db`;
  const dest = safeBackupPath(config.repoRoot, filename);

  checkpointDb(config.dbPath);
  const source = new Database(config.dbPath, { readonly: true });
  try {
    source.backup(dest);
  } finally {
    source.close();
  }

  const stat = fs.statSync(dest);
  return { path: path.relative(config.repoRoot, dest), sizeBytes: stat.size };
}
