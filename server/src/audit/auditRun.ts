import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Db } from '../db';
import { ToolError } from '../mcp/repoSafety';
import { toolFail, toolOk } from '../mcp/toolSchemas';
import { recordAuditEvent } from './auditService';

export interface AuditedToolSpec {
  actor?: string;
  action: string;
  entityType?: string;
  entityId?: string | ((result: unknown) => string | undefined);
  before?: unknown | (() => unknown);
  metadata?: Record<string, unknown> | ((args: unknown) => Record<string, unknown>);
  toolName: string;
  args?: unknown;
}

/** Runs a mutation handler and records an audit event on success. */
export async function runAuditedTool(
  db: Db,
  spec: AuditedToolSpec,
  handler: () => Promise<unknown> | unknown,
): Promise<CallToolResult> {
  try {
    const before = typeof spec.before === 'function' ? spec.before() : spec.before;
    const data = await handler();
    const entityId =
      typeof spec.entityId === 'function' ? spec.entityId(data) : spec.entityId;
    const metadata = {
      toolName: spec.toolName,
      ...(typeof spec.metadata === 'function' && spec.args !== undefined
        ? spec.metadata(spec.args)
        : spec.metadata),
    };
    recordAuditEvent(db, {
      actor: spec.actor ?? 'mcp',
      action: spec.action,
      entityType: spec.entityType,
      entityId,
      before,
      after: data,
      metadata,
    });
    return toolOk(data);
  } catch (err) {
    if (err instanceof ToolError) return toolFail(err.code, err.message);
    const message = err instanceof Error ? err.message : 'Unexpected tool error.';
    return toolFail('INVALID_INPUT', message);
  }
}
