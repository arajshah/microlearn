import { randomUUID } from 'node:crypto';
import type { Db } from '../db';

export interface ContentVersionRow {
  id: string;
  entity_type: string;
  entity_id: string;
  version: number;
  state: string;
  snapshot_json: string;
  change_summary: string;
  created_at: string;
}

export interface CreateContentVersionInput {
  entityType: string;
  entityId: string;
  state: string;
  snapshot: unknown;
  changeSummary: string;
  /** Optional explicit version; defaults to latest + 1 for the entity. */
  version?: number;
}

/** Returns the highest content-version number recorded for an entity (0 if none). */
export function getLatestVersionNumber(db: Db, entityType: string, entityId: string): number {
  const row = db
    .prepare(
      'SELECT MAX(version) AS maxVersion FROM content_versions WHERE entity_type = ? AND entity_id = ?',
    )
    .get(entityType, entityId) as { maxVersion: number | null } | undefined;
  return row?.maxVersion ?? 0;
}

/** Inserts a content-version snapshot row and returns it. */
export function createContentVersion(db: Db, input: CreateContentVersionInput): ContentVersionRow {
  const version = input.version ?? getLatestVersionNumber(db, input.entityType, input.entityId) + 1;
  const row: ContentVersionRow = {
    id: randomUUID(),
    entity_type: input.entityType,
    entity_id: input.entityId,
    version,
    state: input.state,
    snapshot_json: JSON.stringify(input.snapshot),
    change_summary: input.changeSummary,
    created_at: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO content_versions
       (id, entity_type, entity_id, version, state, snapshot_json, change_summary, created_at)
     VALUES (@id, @entity_type, @entity_id, @version, @state, @snapshot_json, @change_summary, @created_at)`,
  ).run(row);
  return row;
}

/** Returns content versions for an entity, newest first. */
export function getContentVersionsForEntity(
  db: Db,
  entityType: string,
  entityId: string,
  limit = 50,
): ContentVersionRow[] {
  return db
    .prepare(
      `SELECT * FROM content_versions
       WHERE entity_type = ? AND entity_id = ?
       ORDER BY version DESC, created_at DESC
       LIMIT ?`,
    )
    .all(entityType, entityId, limit) as ContentVersionRow[];
}

/** Returns a single content version by id. */
export function getContentVersionById(db: Db, id: string): ContentVersionRow | undefined {
  return db.prepare('SELECT * FROM content_versions WHERE id = ?').get(id) as
    | ContentVersionRow
    | undefined;
}

export function serializeContentVersion(row: ContentVersionRow) {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    version: row.version,
    state: row.state,
    changeSummary: row.change_summary,
    createdAt: row.created_at,
  };
}
