import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { ServerConfig } from './config';
import { logger } from './logger';

export type Db = Database.Database;

/** Ensures the data directory exists, opens/creates the SQLite database, and applies the minimal schema. */
export function initDatabase(config: ServerConfig): Db {
  const dir = path.dirname(config.dbPath);
  fs.mkdirSync(dir, { recursive: true });

  const db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS app_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  setMetadata(db, 'server_started_at', new Date().toISOString());

  logger.info('SQLite database ready', { path: config.dbPath });
  return db;
}

/** Inserts or updates a single metadata key/value pair. */
export function setMetadata(db: Db, key: string, value: string): void {
  db.prepare(
    `INSERT INTO app_metadata (key, value, updated_at)
     VALUES (@key, @value, @updatedAt)
     ON CONFLICT(key) DO UPDATE SET value = @value, updated_at = @updatedAt`,
  ).run({ key, value, updatedAt: new Date().toISOString() });
}

/** Runs a trivial query to confirm the database is readable. Returns false on any failure. */
export function checkDatabaseHealth(db: Db): boolean {
  try {
    const row = db.prepare('SELECT COUNT(*) AS count FROM app_metadata').get() as
      | { count: number }
      | undefined;
    return typeof row?.count === 'number';
  } catch (err) {
    logger.error('Database health check failed', err);
    return false;
  }
}
