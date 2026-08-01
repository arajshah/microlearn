import { randomUUID } from 'node:crypto';
import type { Db } from '../db';
import type { McpAuthContext } from '../auth/mcpAuth';
import { recordAuditEvent, sanitizeAuditPayload } from '../audit/auditService';
import { ToolError } from '../mcp/repoSafety';
import type {
  AutomationCapability,
  AutomationGrantStatus,
  ExecutionWindow,
  TrustedAutomationGrant,
} from './types';

const FAILURE_LIMIT = 3;

interface GrantRow {
  id: string;
  user_id: string;
  oauth_client_id: string | null;
  status: AutomationGrantStatus;
  capabilities_json: string;
  roadmap_ids_json: string | null;
  daily_operation_limit: number | null;
  daily_operation_count: number;
  daily_operation_day: string | null;
  execution_windows_json: string | null;
  timezone: string;
  expires_at: string | null;
  failure_count: number;
  circuit_breaker_state: 'closed' | 'open';
  circuit_breaker_reason: string | null;
  allow_whole_roadmap_delete: number;
  allow_badge_definition_changes: number;
  audit_metadata_json: string | null;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
}

function now(): string {
  return new Date().toISOString();
}

function json<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function automationIdentity(auth: McpAuthContext): { userId: string; clientId?: string } {
  if (auth.kind === 'oauth') {
    if (!auth.subject) throw new ToolError('AUTOMATION_IDENTITY_REQUIRED', 'OAuth subject is required for Trusted Automation.');
    return { userId: auth.subject, clientId: auth.clientId ?? undefined };
  }
  return { userId: 'static-token-user', clientId: 'static-token-client' };
}

function serializeGrant(row: GrantRow): TrustedAutomationGrant {
  return {
    id: row.id,
    userId: row.user_id,
    oauthClientId: row.oauth_client_id ?? undefined,
    status: row.status,
    capabilities: json<AutomationCapability[]>(row.capabilities_json, []),
    roadmapIds: json<string[] | undefined>(row.roadmap_ids_json, undefined),
    dailyOperationLimit: row.daily_operation_limit ?? undefined,
    dailyOperationCount: row.daily_operation_count,
    executionWindows: json<ExecutionWindow[] | undefined>(row.execution_windows_json, undefined),
    timezone: row.timezone,
    expiresAt: row.expires_at ?? undefined,
    failureCount: row.failure_count,
    circuitBreaker: {
      state: row.circuit_breaker_state,
      reason: row.circuit_breaker_reason ?? undefined,
    },
    allowWholeRoadmapDelete: Boolean(row.allow_whole_roadmap_delete),
    allowBadgeDefinitionChanges: Boolean(row.allow_badge_definition_changes),
    auditMetadata: json<Record<string, unknown> | undefined>(row.audit_metadata_json, undefined),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUsedAt: row.last_used_at ?? undefined,
  };
}

export function getGrantById(db: Db, grantId: string): TrustedAutomationGrant | null {
  const row = db.prepare('SELECT * FROM trusted_automation_grants WHERE id = ?').get(grantId) as GrantRow | undefined;
  return row ? serializeGrant(row) : null;
}

export function getGrantForAuth(db: Db, auth: McpAuthContext): TrustedAutomationGrant | null {
  const identity = automationIdentity(auth);
  const row = db.prepare(
    `SELECT * FROM trusted_automation_grants
     WHERE user_id = ? AND IFNULL(oauth_client_id, '') = IFNULL(?, '')
       AND status IN ('active', 'paused', 'circuit-broken')
     ORDER BY created_at DESC LIMIT 1`,
  ).get(identity.userId, identity.clientId ?? null) as GrantRow | undefined;
  return row ? serializeGrant(row) : null;
}

export interface CreateGrantInput {
  capabilities: AutomationCapability[];
  roadmapIds?: string[];
  dailyOperationLimit?: number;
  executionWindows?: ExecutionWindow[];
  timezone: string;
  expiresAt?: string;
  allowWholeRoadmapDelete: boolean;
  allowBadgeDefinitionChanges: boolean;
  auditMetadata?: Record<string, unknown>;
}

export function createGrant(db: Db, auth: McpAuthContext, input: CreateGrantInput): TrustedAutomationGrant {
  const identity = automationIdentity(auth);
  const existing = getGrantForAuth(db, auth);
  if (existing) {
    throw new ToolError('AUTOMATION_GRANT_EXISTS', 'Pause, revoke, or update the existing Trusted Automation grant.');
  }
  const ts = now();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO trusted_automation_grants (
       id, user_id, oauth_client_id, status, capabilities_json, roadmap_ids_json,
       daily_operation_limit, execution_windows_json, timezone, expires_at,
       allow_whole_roadmap_delete, allow_badge_definition_changes, audit_metadata_json,
       created_at, updated_at
     ) VALUES (
       @id, @userId, @clientId, 'active', @capabilities, @roadmapIds,
       @dailyLimit, @windows, @timezone, @expiresAt,
       @allowDelete, @allowBadgeDefinitions, @auditMetadata, @ts, @ts
     )`,
  ).run({
    id,
    userId: identity.userId,
    clientId: identity.clientId ?? null,
    capabilities: JSON.stringify([...new Set(input.capabilities)]),
    roadmapIds: input.roadmapIds ? JSON.stringify([...new Set(input.roadmapIds)]) : null,
    dailyLimit: input.dailyOperationLimit ?? null,
    windows: input.executionWindows ? JSON.stringify(input.executionWindows) : null,
    timezone: input.timezone,
    expiresAt: input.expiresAt ?? null,
    allowDelete: input.allowWholeRoadmapDelete ? 1 : 0,
    allowBadgeDefinitions: input.allowBadgeDefinitionChanges ? 1 : 0,
    auditMetadata: input.auditMetadata ? JSON.stringify(sanitizeAuditPayload(input.auditMetadata)) : null,
    ts,
  });
  const grant = getGrantById(db, id)!;
  recordAutomationAudit(db, auth, {
    grantId: id,
    toolName: 'enable_trusted_automation',
    capability: 'automation.manage',
    result: 'created',
    after: grant,
  });
  return grant;
}

export interface UpdateGrantInput {
  capabilities?: AutomationCapability[];
  roadmapIds?: string[] | null;
  dailyOperationLimit?: number | null;
  executionWindows?: ExecutionWindow[] | null;
  timezone?: string;
  expiresAt?: string | null;
  allowWholeRoadmapDelete?: boolean;
  allowBadgeDefinitionChanges?: boolean;
  auditMetadata?: Record<string, unknown>;
}

function requireOwnedGrant(db: Db, auth: McpAuthContext, grantId: string): TrustedAutomationGrant {
  const grant = getGrantById(db, grantId);
  const identity = automationIdentity(auth);
  if (!grant || grant.userId !== identity.userId || (grant.oauthClientId ?? '') !== (identity.clientId ?? '')) {
    throw new ToolError('AUTOMATION_GRANT_NOT_FOUND', 'Trusted Automation grant was not found for this user and client.');
  }
  return grant;
}

export function updateGrant(db: Db, auth: McpAuthContext, grantId: string, patch: UpdateGrantInput): TrustedAutomationGrant {
  const before = requireOwnedGrant(db, auth, grantId);
  if (before.status === 'revoked') throw new ToolError('AUTOMATION_REVOKED', 'A revoked grant cannot be updated.');
  const ts = now();
  const next = {
    capabilities: patch.capabilities ?? before.capabilities,
    roadmapIds: patch.roadmapIds === undefined ? before.roadmapIds : patch.roadmapIds ?? undefined,
    dailyOperationLimit: patch.dailyOperationLimit === undefined ? before.dailyOperationLimit : patch.dailyOperationLimit ?? undefined,
    executionWindows: patch.executionWindows === undefined ? before.executionWindows : patch.executionWindows ?? undefined,
    timezone: patch.timezone ?? before.timezone,
    expiresAt: patch.expiresAt === undefined ? before.expiresAt : patch.expiresAt ?? undefined,
    allowWholeRoadmapDelete: patch.allowWholeRoadmapDelete ?? before.allowWholeRoadmapDelete,
    allowBadgeDefinitionChanges: patch.allowBadgeDefinitionChanges ?? before.allowBadgeDefinitionChanges,
    auditMetadata: patch.auditMetadata ?? before.auditMetadata,
  };
  db.prepare(
    `UPDATE trusted_automation_grants SET
       capabilities_json=@capabilities, roadmap_ids_json=@roadmapIds,
       daily_operation_limit=@dailyLimit, execution_windows_json=@windows,
       timezone=@timezone, expires_at=@expiresAt,
       allow_whole_roadmap_delete=@allowDelete,
       allow_badge_definition_changes=@allowBadgeDefinitions,
       audit_metadata_json=@auditMetadata, updated_at=@ts
     WHERE id=@id`,
  ).run({
    id: grantId,
    capabilities: JSON.stringify([...new Set(next.capabilities)]),
    roadmapIds: next.roadmapIds ? JSON.stringify([...new Set(next.roadmapIds)]) : null,
    dailyLimit: next.dailyOperationLimit ?? null,
    windows: next.executionWindows ? JSON.stringify(next.executionWindows) : null,
    timezone: next.timezone,
    expiresAt: next.expiresAt ?? null,
    allowDelete: next.allowWholeRoadmapDelete ? 1 : 0,
    allowBadgeDefinitions: next.allowBadgeDefinitionChanges ? 1 : 0,
    auditMetadata: next.auditMetadata ? JSON.stringify(sanitizeAuditPayload(next.auditMetadata)) : null,
    ts,
  });
  const after = getGrantById(db, grantId)!;
  recordAutomationAudit(db, auth, {
    grantId,
    toolName: 'update_trusted_automation',
    capability: 'automation.manage',
    result: 'updated',
    before,
    after,
  });
  return after;
}

export function setGrantStatus(
  db: Db,
  auth: McpAuthContext,
  grantId: string,
  status: Extract<AutomationGrantStatus, 'active' | 'paused' | 'revoked'>,
): TrustedAutomationGrant {
  const before = requireOwnedGrant(db, auth, grantId);
  if (before.status === 'revoked') throw new ToolError('AUTOMATION_REVOKED', 'A revoked grant cannot be resumed.');
  const ts = now();
  db.transaction(() => {
    db.prepare(
      `UPDATE trusted_automation_grants SET status=?, circuit_breaker_state='closed',
         circuit_breaker_reason=NULL, failure_count=0, updated_at=? WHERE id=?`,
    ).run(status, ts, grantId);
    if (status !== 'active') {
      db.prepare("UPDATE automation_schedules SET status='paused', updated_at=? WHERE grant_id=? AND status='active'").run(ts, grantId);
      db.prepare("UPDATE automation_reminders SET status='paused', updated_at=? WHERE grant_id=? AND status='active'").run(ts, grantId);
    }
  })();
  const after = getGrantById(db, grantId)!;
  recordAutomationAudit(db, auth, {
    grantId,
    toolName: status === 'paused' ? 'pause_trusted_automation' : status === 'revoked' ? 'revoke_trusted_automation' : 'update_trusted_automation',
    capability: 'automation.manage',
    result: status,
    before,
    after,
  });
  return after;
}

export interface AutomationAuditInput {
  grantId?: string;
  jobId?: string;
  toolName: string;
  targetIds?: string[];
  capability?: string;
  result: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

function safeJson(value: unknown): string | null {
  if (value === undefined) return null;
  return JSON.stringify(sanitizeAuditPayload(value));
}

export function recordAutomationAudit(db: Db, auth: McpAuthContext, input: AutomationAuditInput): void {
  const identity = automationIdentity(auth);
  const ts = now();
  db.prepare(
    `INSERT INTO automation_audit_events (
       id, user_id, oauth_client_id, grant_id, job_id, tool_name, target_ids_json,
       capability, result, before_json, after_json, metadata_json, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(), identity.userId, identity.clientId ?? null, input.grantId ?? null,
    input.jobId ?? null, input.toolName, safeJson(input.targetIds), input.capability ?? null,
    input.result, safeJson(input.before), safeJson(input.after), safeJson(input.metadata), ts,
  );
  recordAuditEvent(db, {
    actor: `mcp:${identity.userId}`,
    action: input.toolName,
    entityType: input.jobId ? 'automation_job' : input.grantId ? 'automation_grant' : 'automation',
    entityId: input.jobId ?? input.grantId,
    before: input.before,
    after: input.after,
    metadata: {
      clientId: identity.clientId,
      grantId: input.grantId,
      targetIds: input.targetIds,
      capability: input.capability,
      result: input.result,
      ...input.metadata,
    },
  });
}

export function tripCircuitBreaker(db: Db, grantId: string, reason: string, auth?: McpAuthContext): TrustedAutomationGrant {
  const ts = now();
  db.transaction(() => {
    db.prepare(
      `UPDATE trusted_automation_grants SET status='circuit-broken', circuit_breaker_state='open',
         circuit_breaker_reason=?, updated_at=? WHERE id=? AND status != 'revoked'`,
    ).run(reason, ts, grantId);
    db.prepare("UPDATE automation_schedules SET status='paused', updated_at=? WHERE grant_id=? AND status='active'").run(ts, grantId);
    db.prepare("UPDATE automation_reminders SET status='paused', updated_at=? WHERE grant_id=? AND status='active'").run(ts, grantId);
  })();
  const grant = getGrantById(db, grantId);
  if (!grant) throw new ToolError('AUTOMATION_GRANT_NOT_FOUND', 'Trusted Automation grant not found.');
  if (auth) {
    recordAutomationAudit(db, auth, {
      grantId,
      toolName: 'trusted_automation_circuit_breaker',
      capability: 'automation.manage',
      result: 'circuit-broken',
      after: { reason },
    });
  }
  return grant;
}

export function noteAutomationFailure(db: Db, grantId: string, reason: string, auth?: McpAuthContext): void {
  db.prepare('UPDATE trusted_automation_grants SET failure_count=failure_count+1, updated_at=? WHERE id=?').run(now(), grantId);
  const grant = getGrantById(db, grantId);
  if (grant && grant.failureCount >= FAILURE_LIMIT) tripCircuitBreaker(db, grantId, reason, auth);
}

function localParts(date: Date, timezone: string): { day: number; time: string } {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    throw new ToolError('INVALID_TIMEZONE', `Unsupported timezone "${timezone}".`);
  }
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const days: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { day: days[parts.weekday] ?? 0, time: `${parts.hour}:${parts.minute}` };
}

export function isWithinExecutionWindow(grant: TrustedAutomationGrant, date = new Date()): boolean {
  if (!grant.executionWindows?.length) return true;
  const local = localParts(date, grant.timezone);
  return grant.executionWindows.some((window) =>
    (!window.days?.length || window.days.includes(local.day))
      && (window.start <= window.end
        ? local.time >= window.start && local.time <= window.end
        : local.time >= window.start || local.time <= window.end),
  );
}

export function consumeGrantOperation(db: Db, grantId: string): TrustedAutomationGrant {
  const grant = getGrantById(db, grantId);
  if (!grant) throw new ToolError('AUTOMATION_GRANT_NOT_FOUND', 'Trusted Automation grant not found.');
  const day = now().slice(0, 10);
  const row = db.prepare('SELECT daily_operation_day FROM trusted_automation_grants WHERE id=?').get(grantId) as { daily_operation_day: string | null };
  const current = row.daily_operation_day === day ? grant.dailyOperationCount : 0;
  if (grant.dailyOperationLimit !== undefined && current >= grant.dailyOperationLimit) {
    throw new ToolError('AUTOMATION_DAILY_LIMIT', 'Trusted Automation daily operation limit has been reached.');
  }
  const ts = now();
  db.prepare(
    `UPDATE trusted_automation_grants SET daily_operation_day=?, daily_operation_count=?,
       last_used_at=?, updated_at=? WHERE id=?`,
  ).run(day, current + 1, ts, ts, grantId);
  return getGrantById(db, grantId)!;
}

/** Revalidates persistent authority at execution time; schedules never inherit stale approval. */
export function consumeScheduledGrantOperation(
  db: Db,
  input: {
    grantId: string;
    capability: AutomationCapability;
    roadmapId?: string;
    at?: Date;
  },
): TrustedAutomationGrant {
  const grant = getGrantById(db, input.grantId);
  if (!grant) throw new ToolError('AUTOMATION_GRANT_NOT_FOUND', 'Trusted Automation grant not found.');
  if (grant.status === 'circuit-broken' || grant.circuitBreaker.state === 'open') {
    throw new ToolError('AUTOMATION_CIRCUIT_BROKEN', grant.circuitBreaker.reason ?? 'Trusted Automation circuit breaker is open.');
  }
  if (grant.status !== 'active') throw new ToolError('AUTOMATION_INACTIVE', `Trusted Automation grant is ${grant.status}.`);
  const at = input.at ?? new Date();
  if (grant.expiresAt && Date.parse(grant.expiresAt) <= at.getTime()) {
    throw new ToolError('AUTOMATION_EXPIRED', 'Trusted Automation grant has expired.');
  }
  if (!grant.capabilities.includes(input.capability)) {
    throw new ToolError('AUTOMATION_CAPABILITY_DENIED', `Grant does not allow capability "${input.capability}".`);
  }
  if (!isWithinExecutionWindow(grant, at)) {
    throw new ToolError('AUTOMATION_OUTSIDE_WINDOW', 'Operation is outside the grant execution window.');
  }
  if (grant.roadmapIds?.length) {
    if (!input.roadmapId || !grant.roadmapIds.includes(input.roadmapId)) {
      throw new ToolError('AUTOMATION_ROADMAP_DENIED', 'Scheduled target roadmap is outside this grant.');
    }
  }
  return consumeGrantOperation(db, grant.id);
}
