import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../context';
import { ToolError } from '../repoSafety';
import { runTool } from '../toolSchemas';
import { getAuditEvent, listAuditEvents } from '../../audit/auditService';
import { z } from 'zod';

const listAuditInput = {
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  action: z.string().optional(),
  limit: z.number().int().positive().max(200).optional(),
};

const getAuditInput = {
  auditEventId: z.string().min(1),
};

/** Registers list_audit_events and get_audit_event. */
export function registerAuditTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'list_audit_events',
    {
      title: 'List audit events',
      description: 'List MCP write/publish audit events (default limit 50).',
      inputSchema: listAuditInput,
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      runTool(() => ({
        events: listAuditEvents(ctx.db, {
          entityType: args.entityType,
          entityId: args.entityId,
          action: args.action,
          limit: args.limit,
        }),
      })),
  );

  server.registerTool(
    'get_audit_event',
    {
      title: 'Get audit event',
      description: 'Return one audit event with before/after snapshots and metadata.',
      inputSchema: getAuditInput,
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      runTool(() => {
        const event = getAuditEvent(ctx.db, args.auditEventId);
        if (!event) throw new ToolError('NOT_FOUND', `Audit event "${args.auditEventId}" not found.`);
        return { event };
      }),
  );
}
