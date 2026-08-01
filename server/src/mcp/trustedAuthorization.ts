import type { ToolContext } from './context';
import { ToolError } from './repoSafety';
import { policyForTool } from './scopePolicy';
import {
  consumeGrantOperation,
  getGrantForAuth,
  isWithinExecutionWindow,
  recordAutomationAudit,
  tripCircuitBreaker,
} from '../automation/automationRepository';
import type { TrustedAutomationGrant } from '../automation/types';

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function roadmapForEntity(ctx: ToolContext, table: string, id: string): string | undefined {
  const allowed: Record<string, string> = {
    roadmap_units: 'roadmap_units',
    lesson_nodes: 'lesson_nodes',
    lesson_blueprints: 'lesson_blueprints',
    generated_lessons: 'generated_lessons',
  };
  const safeTable = allowed[table];
  if (!safeTable) return undefined;
  const row = ctx.db.prepare(`SELECT roadmap_id FROM ${safeTable} WHERE id = ?`).get(id) as
    | { roadmap_id: string | null }
    | undefined;
  return row?.roadmap_id ?? undefined;
}

/** Resolves roadmap scope from explicit and entity IDs, and trips on cross-roadmap arguments. */
export function targetRoadmapIds(ctx: ToolContext, args: unknown): string[] {
  if (!args || typeof args !== 'object') return [];
  const input = args as Record<string, unknown>;
  const ids = new Set<string>();
  const add = (value: unknown) => {
    const id = stringValue(value);
    if (id) ids.add(id);
  };
  add(input.roadmapId);
  if (input.payload && typeof input.payload === 'object') add((input.payload as Record<string, unknown>).roadmapId);
  const scheduleId = stringValue(input.scheduleId);
  if (scheduleId) {
    const row = ctx.db.prepare("SELECT json_extract(payload_json, '$.roadmapId') AS roadmap_id FROM automation_schedules WHERE id=?")
      .get(scheduleId) as { roadmap_id: string | null } | undefined;
    add(row?.roadmap_id);
  }
  const reminderId = stringValue(input.reminderId);
  if (reminderId) {
    const row = ctx.db.prepare('SELECT roadmap_id FROM automation_reminders WHERE id=?').get(reminderId) as
      | { roadmap_id: string | null }
      | undefined;
    add(row?.roadmap_id);
  }
  const entityLookups: Array<[unknown, string]> = [
    [input.unitId, 'roadmap_units'],
    [input.lessonNodeId, 'lesson_nodes'],
    [input.blueprintId, 'lesson_blueprints'],
    [input.lessonId, 'generated_lessons'],
  ];
  for (const [value, table] of entityLookups) {
    const id = stringValue(value);
    if (!id) continue;
    const roadmapId = roadmapForEntity(ctx, table, id);
    if (roadmapId) ids.add(roadmapId);
  }
  return [...ids];
}

export interface TrustedAuthorizationOptions {
  requireWholeRoadmapDelete?: boolean;
  requireBadgeDefinitionChanges?: boolean;
  consume?: boolean;
}

function authorizationKey(ctx: ToolContext, toolName: string, args: unknown): string {
  const input = args && typeof args === 'object' ? args as Record<string, unknown> : {};
  const directIds = [
    'roadmapId', 'unitId', 'lessonNodeId', 'lessonId', 'blueprintId', 'scheduleId',
    'reminderId', 'sourceId', 'versionId', 'achievementId',
  ].map((key) => `${key}:${stringValue(input[key]) ?? ''}`);
  return [toolName, ...targetRoadmapIds(ctx, args).sort(), ...directIds].join('|');
}

function validateGrant(
  ctx: ToolContext,
  toolName: string,
  args: unknown,
  grant: TrustedAutomationGrant,
  options: TrustedAuthorizationOptions,
): void {
  const policy = policyForTool(toolName);
  if (!policy.mutation || !policy.trustedAutomationAllowed || !policy.capability) {
    throw new ToolError('AUTOMATION_NOT_ALLOWED', 'Trusted Automation cannot authorize this operation.');
  }
  if (grant.status === 'circuit-broken' || grant.circuitBreaker.state === 'open') {
    throw new ToolError('AUTOMATION_CIRCUIT_BROKEN', grant.circuitBreaker.reason ?? 'Trusted Automation circuit breaker is open.');
  }
  if (grant.status !== 'active') {
    throw new ToolError('AUTOMATION_INACTIVE', `Trusted Automation grant is ${grant.status}.`);
  }
  if (grant.expiresAt && Date.parse(grant.expiresAt) <= Date.now()) {
    throw new ToolError('AUTOMATION_EXPIRED', 'Trusted Automation grant has expired.');
  }
  if (policy.capability === 'automation.manage' || !grant.capabilities.includes(policy.capability)) {
    throw new ToolError('AUTOMATION_CAPABILITY_DENIED', `Grant does not allow capability "${policy.capability}".`);
  }
  if (!isWithinExecutionWindow(grant)) {
    throw new ToolError('AUTOMATION_OUTSIDE_WINDOW', 'Operation is outside the grant execution window.');
  }
  if (options.requireWholeRoadmapDelete && !grant.allowWholeRoadmapDelete) {
    throw new ToolError('AUTOMATION_ROADMAP_DELETE_DENIED', 'Grant does not explicitly allow whole-roadmap deletion.');
  }
  if (options.requireBadgeDefinitionChanges && !grant.allowBadgeDefinitionChanges) {
    throw new ToolError('AUTOMATION_BADGE_DEFINITION_DENIED', 'Grant does not allow global badge definition changes.');
  }

  const roadmapIds = targetRoadmapIds(ctx, args);
  if (roadmapIds.length > 1) {
    tripCircuitBreaker(ctx.db, grant.id, 'One operation unexpectedly crossed roadmap boundaries.', ctx.auth);
    throw new ToolError('AUTOMATION_CROSS_ROADMAP', 'Operation crossed roadmap boundaries; Trusted Automation was stopped.');
  }
  if (grant.roadmapIds?.length) {
    if (roadmapIds.length === 0) {
      throw new ToolError('AUTOMATION_ROADMAP_REQUIRED', 'This restricted grant requires an allowed roadmap target.');
    }
    if (!grant.roadmapIds.includes(roadmapIds[0])) {
      throw new ToolError('AUTOMATION_ROADMAP_DENIED', 'Target roadmap is outside this grant.');
    }
  }
}

export function requireTrustedAuthorization(
  ctx: ToolContext,
  toolName: string,
  args: unknown,
  options: TrustedAuthorizationOptions = {},
): TrustedAutomationGrant {
  const key = authorizationKey(ctx, toolName, args);
  const cached = ctx.trustedAuthorizations?.get(key);
  if (cached?.length) return cached.shift()!;
  const grant = getGrantForAuth(ctx.db, ctx.auth);
  if (!grant) throw new ToolError('AUTOMATION_GRANT_REQUIRED', 'An active Trusted Automation grant is required.');
  try {
    validateGrant(ctx, toolName, args, grant, options);
    const updated = options.consume === false ? grant : consumeGrantOperation(ctx.db, grant.id);
    recordAutomationAudit(ctx.db, ctx.auth, {
      grantId: grant.id,
      toolName,
      targetIds: targetRoadmapIds(ctx, args),
      capability: policyForTool(toolName).capability,
      result: 'authorized',
    });
    return updated;
  } catch (error) {
    recordAutomationAudit(ctx.db, ctx.auth, {
      grantId: grant.id,
      toolName,
      targetIds: targetRoadmapIds(ctx, args),
      capability: policyForTool(toolName).capability,
      result: 'rejected',
      metadata: { code: error instanceof ToolError ? error.code : 'AUTOMATION_REJECTED' },
    });
    throw error;
  }
}

interface JsonRpcToolCall {
  method?: unknown;
  params?: { name?: unknown; arguments?: unknown };
}

/** Validates each eligible mutation before dispatch; batch entries retain target-specific approvals. */
export function preauthorizeTrustedMutations(ctx: ToolContext, body: unknown): void {
  const requests = (Array.isArray(body) ? body : [body]) as JsonRpcToolCall[];
  const grant = getGrantForAuth(ctx.db, ctx.auth);
  if (!grant) return;
  ctx.trustedAuthorizations ??= new Map();
  for (const request of requests) {
    if (!request || request.method !== 'tools/call' || typeof request.params?.name !== 'string') continue;
    const toolName = request.params.name;
    const policy = policyForTool(toolName);
    if (!policy.mutation || !policy.trustedAutomationAllowed) continue;
    const args = request.params.arguments ?? {};
    const authorized = requireTrustedAuthorization(
      { ...ctx, trustedAuthorizations: undefined },
      toolName,
      args,
      { requireWholeRoadmapDelete: toolName === 'delete_roadmap' },
    );
    const key = authorizationKey(ctx, toolName, args);
    const entries = ctx.trustedAuthorizations.get(key) ?? [];
    entries.push(authorized);
    ctx.trustedAuthorizations.set(key, entries);
  }
}

/** Preserves legacy exact phrases while allowing a valid persistent grant to stand in for them. */
export function assertConfirmationOrTrusted(
  ctx: ToolContext,
  toolName: string,
  args: unknown,
  actual: string | undefined,
  expected: string,
  options: TrustedAuthorizationOptions = {},
): TrustedAutomationGrant | null {
  if (actual === expected) return null;
  return requireTrustedAuthorization(ctx, toolName, args, options);
}
