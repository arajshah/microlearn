import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../context';
import { runTool } from '../toolSchemas';
import { runAuditedTool } from '../../audit/auditRun';
import { assertWriteEnabled } from '../guards';
import {
  getAchievements,
  getDailyActivity,
  getProfileSummary,
  recordActivityEvent,
} from '../../gamification/gamificationService';
import * as S from './gamificationSchemas';

function activityAudit(args: unknown): Record<string, unknown> {
  const a = args as Record<string, unknown>;
  return { eventType: a.eventType };
}

/** Registers gamification read + write MCP tools. */
export function registerGamificationTools(server: McpServer, ctx: ToolContext): void {
  const { db } = ctx;

  server.registerTool(
    'get_gamification_summary',
    {
      title: 'Get gamification summary',
      description: 'Return profile summary: XP, streaks, achievements, retrieval, activity.',
      inputSchema: S.getGamificationSummaryInput,
      annotations: { readOnlyHint: true },
    },
    async () => runTool(() => ({ summary: getProfileSummary(db) })),
  );

  server.registerTool(
    'list_achievements',
    {
      title: 'List achievements',
      description: 'List all achievements with unlocked status.',
      inputSchema: S.listAchievementsInput,
      annotations: { readOnlyHint: true },
    },
    async (args) => runTool(() => ({ achievements: getAchievements(db, args) })),
  );

  server.registerTool(
    'inspect_daily_activity',
    {
      title: 'Inspect daily activity',
      description: 'Return recent daily activity rows.',
      inputSchema: S.inspectDailyActivityInput,
      annotations: { readOnlyHint: true },
    },
    async (args) => runTool(() => ({ activity: getDailyActivity(db, args.days ?? 14) })),
  );

  server.registerTool(
    'record_activity_event',
    {
      title: 'Record activity event',
      description: 'Record a learning activity event (write tool).',
      inputSchema: S.recordActivityEventInput,
      annotations: { destructiveHint: false },
    },
    async (args) =>
      runAuditedTool(
        db,
        {
          action: 'record_activity_event',
          entityType: 'daily_activity',
          entityId: String((args as { eventType?: string }).eventType ?? 'event'),
          toolName: 'record_activity_event',
          args,
          metadata: () => activityAudit(args),
        },
        () => {
          assertWriteEnabled(ctx.config);
          const a = args as {
            eventType: Parameters<typeof recordActivityEvent>[1];
            event?: Record<string, unknown>;
          };
          return { result: recordActivityEvent(db, a.eventType, a.event ?? {}, 'mcp') };
        },
      ),
  );
}
