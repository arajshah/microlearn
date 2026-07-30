import { randomUUID } from 'node:crypto';
import type { Db } from '../db';

const MAX_SNAPSHOT_CHARS = 16_000;

export interface AuditEventRow {
  id: string;
  actor: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  before_json: string | null;
  after_json: string | null;
  metadata_json: string | null;
  created_at: string;
}

export interface RecordAuditInput {
  actor?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

/** Truncates and strips sensitive keys from audit snapshots. */
export function sanitizeAuditPayload(value: unknown): unknown {
  if (value === undefined || value === null) return value;
  if (typeof value === 'string') {
    return value.length > MAX_SNAPSHOT_CHARS ? `${value.slice(0, MAX_SNAPSHOT_CHARS)}…[truncated]` : value;
  }
  try {
    const json = JSON.stringify(value);
    if (json.length <= MAX_SNAPSHOT_CHARS) {
      return JSON.parse(json);
    }
    return { _truncated: true, preview: json.slice(0, MAX_SNAPSHOT_CHARS) };
  } catch {
    return { _note: 'unserializable snapshot' };
  }
}

function toJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(sanitizeAuditPayload(value));
}

/** Records one audit event. Never throws — audit failures must not break tool calls. */
export function recordAuditEvent(db: Db, input: RecordAuditInput): AuditEventRow | null {
  try {
    const row: AuditEventRow = {
      id: randomUUID(),
      actor: input.actor ?? 'mcp',
      action: input.action,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      before_json: toJson(input.before),
      after_json: toJson(input.after),
      metadata_json: input.metadata ? JSON.stringify(sanitizeAuditPayload(input.metadata)) : null,
      created_at: new Date().toISOString(),
    };
    db.prepare(
      `INSERT INTO audit_events
        (id, actor, action, entity_type, entity_id, before_json, after_json, metadata_json, created_at)
       VALUES (@id, @actor, @action, @entity_type, @entity_id, @before_json, @after_json, @metadata_json, @created_at)`,
    ).run(row);
    return row;
  } catch {
    return null;
  }
}

export interface ListAuditOptions {
  entityType?: string;
  entityId?: string;
  action?: string;
  limit?: number;
}

export function listAuditEvents(db: Db, options: ListAuditOptions = {}) {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (options.entityType) {
    clauses.push('entity_type = ?');
    params.push(options.entityType);
  }
  if (options.entityId) {
    clauses.push('entity_id = ?');
    params.push(options.entityId);
  }
  if (options.action) {
    clauses.push('action = ?');
    params.push(options.action);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db
    .prepare(`SELECT * FROM audit_events ${where} ORDER BY created_at DESC LIMIT ?`)
    .all(...params, limit) as AuditEventRow[];
  return rows.map(serializeAuditEventSummary);
}

export function getAuditEvent(db: Db, auditEventId: string) {
  const row = db.prepare('SELECT * FROM audit_events WHERE id = ?').get(auditEventId) as
    | AuditEventRow
    | undefined;
  if (!row) return null;
  return serializeAuditEventDetail(row);
}

function parseJson(raw: string | null): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function serializeAuditEventSummary(row: AuditEventRow) {
  return {
    id: row.id,
    actor: row.actor,
    action: row.action,
    entityType: row.entity_type ?? undefined,
    entityId: row.entity_id ?? undefined,
    createdAt: row.created_at,
  };
}

function serializeAuditEventDetail(row: AuditEventRow) {
  return {
    ...serializeAuditEventSummary(row),
    before: parseJson(row.before_json),
    after: parseJson(row.after_json),
    metadata: parseJson(row.metadata_json),
  };
}

export function countAuditEvents(db: Db): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM audit_events').get() as { c: number }).c;
}
