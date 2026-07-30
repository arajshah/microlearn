import type { Db } from '../db';
import { logger } from '../logger';
import { MIGRATIONS } from './schema';

/** Ensures the migrations table exists and applies any pending migrations in order. */
export function runMigrations(db: Db): { applied: string[]; alreadyApplied: number } {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const has = db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?');
  const insert = db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)');
  const applied: string[] = [];
  let alreadyApplied = 0;

  const apply = db.transaction((migrationId: string, sql: string) => {
    db.exec(sql);
    insert.run(migrationId, new Date().toISOString());
  });

  for (const migration of MIGRATIONS) {
    if (has.get(migration.id)) {
      alreadyApplied += 1;
      continue;
    }
    apply(migration.id, migration.sql);
    applied.push(migration.id);
  }

  if (applied.length > 0) {
    logger.info('Applied database migrations', { applied });
  }
  return { applied, alreadyApplied };
}
