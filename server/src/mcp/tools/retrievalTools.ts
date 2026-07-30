import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../context';
import { runTool } from '../toolSchemas';
import { runAuditedTool } from '../../audit/auditRun';
import { assertWriteEnabled } from '../guards';
import {
  getRetrievalSummary,
  inspectRetrievalSchedule,
  listDueItems,
  listRetrievalAttempts,
  recordRetrievalAttempt,
  seedRetrievalItems,
} from '../../retrieval/retrievalRepository';
import * as S from './retrievalSchemas';

function retrievalAudit(args: unknown): Record<string, unknown> {
  const a = args as Record<string, unknown>;
  return {
    lessonId: a.lessonId,
    itemId: a.itemId,
    rating: a.rating,
    roadmapId: a.roadmapId,
  };
}

/** Registers retrieval read + write MCP tools. */
export function registerRetrievalTools(server: McpServer, ctx: ToolContext): void {
  const { db } = ctx;

  server.registerTool(
    'get_due_retrieval_items',
    {
      title: 'Get due retrieval items',
      description: 'List active retrieval items that are due now.',
      inputSchema: S.getDueRetrievalItemsInput,
      annotations: { readOnlyHint: true },
    },
    async (args) => runTool(() => ({ items: listDueItems(db, args) })),
  );

  server.registerTool(
    'get_retrieval_summary',
    {
      title: 'Get retrieval summary',
      description: 'Summarize retrieval counts, weak concepts, and recent attempts.',
      inputSchema: S.getRetrievalSummaryInput,
      annotations: { readOnlyHint: true },
    },
    async (args) => runTool(() => ({ summary: getRetrievalSummary(db, args.roadmapId) })),
  );

  server.registerTool(
    'inspect_retrieval_schedule',
    {
      title: 'Inspect retrieval schedule',
      description: 'Return one retrieval item schedule and recent attempts.',
      inputSchema: S.inspectRetrievalScheduleInput,
      annotations: { readOnlyHint: true },
    },
    async (args) => runTool(() => inspectRetrievalSchedule(db, args.itemId)),
  );

  server.registerTool(
    'list_retrieval_attempts',
    {
      title: 'List retrieval attempts',
      description: 'List recent retrieval attempts, optionally filtered.',
      inputSchema: S.listRetrievalAttemptsInput,
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      runTool(() => ({
        attempts: listRetrievalAttempts(db, {
          itemId: args.itemId,
          roadmapId: args.roadmapId,
          limit: args.limit ?? 50,
        }),
      })),
  );

  server.registerTool(
    'seed_retrieval_items',
    {
      title: 'Seed retrieval items',
      description: 'Create retrieval items from a generated lesson (write tool).',
      inputSchema: S.seedRetrievalItemsInput,
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      runAuditedTool(
        db,
        {
          action: 'seed_retrieval_items',
          entityType: 'retrieval_item',
          entityId: args.lessonId,
          toolName: 'seed_retrieval_items',
          args,
          metadata: () => retrievalAudit(args),
        },
        () => {
          assertWriteEnabled(ctx.config);
          return { result: seedRetrievalItems(db, { ...args, actor: 'mcp' }) };
        },
      ),
  );

  server.registerTool(
    'record_retrieval_attempt',
    {
      title: 'Record retrieval attempt',
      description: 'Record a retrieval rating and update item schedule (write tool).',
      inputSchema: S.recordRetrievalAttemptInput,
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      runAuditedTool(
        db,
        {
          action: 'record_retrieval_attempt',
          entityType: 'retrieval_item',
          entityId: args.itemId,
          toolName: 'record_retrieval_attempt',
          args,
          metadata: () => retrievalAudit(args),
        },
        () => {
          assertWriteEnabled(ctx.config);
          return recordRetrievalAttempt(db, { ...args, actor: 'mcp' });
        },
      ),
  );
}
