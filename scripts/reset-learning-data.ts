#!/usr/bin/env npx tsx
/**
 * Safe local data reset for Microlearn.
 *
 *   npm run reset:learning    — clears progress/reviews/adaptive data only
 *   npm run reset:all-data    — also clears curriculum, lessons, and sources
 *
 * Requires MICROLEARN_CONFIRM_RESET=true and always backs up the SQLite file
 * to server/backups/ first. Never touches source code or .env.
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';

dotenv.config();

type ResetMode = 'learning' | 'all';

const DEFAULT_DB_PATH = 'server/data/microlearn.local.db';
const BACKUP_DIR = 'server/backups';

/** Progress, retrieval, and adaptive-learning tables. Safe to clear anytime. */
const LEARNING_TABLES = [
  'learning_events',
  'concept_mastery',
  'weakness_observations',
  'diagnostic_items',
  'diagnostic_sessions',
  'remediation_queue',
  'learning_snapshots',
  'lesson_concepts',
  'retrieval_attempts',
  'retrieval_sessions',
  'retrieval_items',
  'review_sets',
  'progress_events',
  'lesson_outcomes',
  'daily_activity',
  'learning_streaks',
  'user_achievements',
] as const;

/** Curriculum and content tables, cleared only in "all" mode. */
const CURRICULUM_TABLES = [
  'generated_lessons',
  'lesson_blueprints',
  'lesson_nodes',
  'roadmap_units',
  'roadmaps',
  'content_versions',
  'retrieval_items',
  'source_documents',
  'concepts',
  'audit_events',
] as const;

function parseMode(arg: string | undefined): ResetMode {
  if (arg === 'all' || arg === 'all-data') return 'all';
  if (arg === 'learning' || arg === undefined) return 'learning';
  throw new Error(`Unknown reset mode "${arg}". Use "learning" or "all".`);
}

function resolveDbPath(): string {
  const raw = process.env.MICROLEARN_DB_PATH?.trim() || DEFAULT_DB_PATH;
  return path.resolve(process.cwd(), raw);
}

/**
 * Backs up the live database, then reopens the copy to confirm it really holds the
 * rows we are about to delete. The server opens SQLite in WAL mode (server/src/db.ts),
 * so committed rows may still sit in the -wal sidecar: copying the main file alone can
 * yield a syntactically valid but near-empty backup. Checkpointing first folds the WAL
 * back into the main file.
 */
function backupDatabase(
  db: Database.Database,
  dbPath: string,
  expectedCounts: Record<string, number>,
): string {
  const dir = path.resolve(process.cwd(), BACKUP_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(dir, `microlearn-pre-reset-${stamp}.db`);

  db.pragma('wal_checkpoint(TRUNCATE)');
  fs.copyFileSync(dbPath, target);

  const size = fs.statSync(target).size;
  if (size === 0) throw new Error(`Backup at ${target} is empty; aborting reset.`);

  const verify = new Database(target, { readonly: true });
  try {
    for (const [table, expected] of Object.entries(expectedCounts)) {
      const row = verify.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
      if (row.n !== expected) {
        throw new Error(
          `Backup at ${target} has ${row.n} row(s) in ${table} but the live database has ${expected}; aborting reset.`,
        );
      }
    }
  } finally {
    verify.close();
    // Opening the copy leaves -wal/-shm sidecars behind; the backup is self-contained without them.
    for (const suffix of ['-wal', '-shm']) fs.rmSync(`${target}${suffix}`, { force: true });
  }

  return target;
}

function tableExists(db: Database.Database, table: string): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table) as { name?: string } | undefined;
  return Boolean(row?.name);
}

function countRows(db: Database.Database, tables: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const table of tables) {
    if (!tableExists(db, table)) continue;
    const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
    counts[table] = row.n;
  }
  return counts;
}

function printCounts(label: string, counts: Record<string, number>): void {
  const entries = Object.entries(counts).filter(([, n]) => n > 0);
  console.log(`\n${label}`);
  if (entries.length === 0) {
    console.log('  (all listed tables empty)');
    return;
  }
  for (const [table, n] of entries) {
    console.log(`  ${table.padEnd(24)} ${n}`);
  }
}

function main(): void {
  const mode = parseMode(process.argv[2]);
  const dryRun = process.argv.includes('--dry-run');

  const dbPath = resolveDbPath();
  if (!fs.existsSync(dbPath)) {
    console.log(`No database at ${dbPath}. Nothing to reset.`);
    return;
  }

  const tables =
    mode === 'all' ? [...new Set([...LEARNING_TABLES, ...CURRICULUM_TABLES])] : [...LEARNING_TABLES];

  const db = new Database(dbPath);
  db.pragma('foreign_keys = OFF');

  const before = countRows(db, tables);
  printCounts(`Row counts before (${mode} reset):`, before);

  if (dryRun) {
    console.log(`\nDry run: would clear ${Object.keys(before).length} table(s). No changes made.`);
    db.close();
    return;
  }

  if (process.env.MICROLEARN_CONFIRM_RESET !== 'true') {
    db.close();
    console.error(
      '\nRefusing to reset. Set MICROLEARN_CONFIRM_RESET=true to confirm.\n' +
        `  MICROLEARN_CONFIRM_RESET=true npm run reset:${mode === 'all' ? 'all-data' : 'learning'}`,
    );
    process.exitCode = 1;
    return;
  }

  let backupPath: string;
  try {
    backupPath = backupDatabase(db, dbPath, before);
  } catch (err) {
    db.close();
    console.error(`\nBackup failed, aborting reset: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
    return;
  }
  console.log(`\nBackup written to ${path.relative(process.cwd(), backupPath)}`);

  const clear = db.transaction(() => {
    for (const table of tables) {
      if (!tableExists(db, table)) continue;
      db.prepare(`DELETE FROM ${table}`).run();
    }
  });
  clear();

  db.pragma('foreign_keys = ON');
  const after = countRows(db, tables);
  printCounts('Row counts after:', after);

  const remaining = Object.values(after).reduce((sum, n) => sum + n, 0);
  db.close();

  console.log(
    `\n${mode === 'all' ? 'Full' : 'Learning'} reset complete. ${remaining} row(s) remain in the cleared tables.`,
  );
  console.log('Source code and .env were not touched.');
}

main();
