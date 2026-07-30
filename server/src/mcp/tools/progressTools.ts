import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../context';
import { runTool } from '../toolSchemas';
import {
  getProgressSummary,
  getRevisionTargets,
  suggestLessonRevision,
} from '../../progress/progressService';

const progressSummaryInput = {
  roadmapId: z.string().min(1).optional(),
};

const revisionTargetsInput = {
  roadmapId: z.string().min(1),
  limit: z.number().int().positive().max(50).optional(),
};

const suggestRevisionInput = {
  roadmapId: z.string().min(1),
  lessonNodeId: z.string().min(1),
};

/** Registers get_progress_summary, get_revision_targets, suggest_lesson_revision. */
export function registerProgressTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'get_progress_summary',
    {
      title: 'Get progress summary',
      description: 'Summarize stored lesson outcomes (no fabricated analytics).',
      inputSchema: progressSummaryInput,
      annotations: { readOnlyHint: true },
    },
    async (args) => runTool(() => getProgressSummary(ctx.db, args.roadmapId)),
  );

  server.registerTool(
    'get_revision_targets',
    {
      title: 'Get revision targets',
      description: 'Identify lesson nodes that may need revision based on stored outcomes.',
      inputSchema: revisionTargetsInput,
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      runTool(() => ({
        targets: getRevisionTargets(ctx.db, args.roadmapId, args.limit),
      })),
  );

  server.registerTool(
    'suggest_lesson_revision',
    {
      title: 'Suggest lesson revision',
      description: 'Read-only structured revision suggestions from roadmap, lesson, blueprint, and outcomes.',
      inputSchema: suggestRevisionInput,
      annotations: { readOnlyHint: true },
    },
    async (args) => runTool(() => suggestLessonRevision(ctx.db, args.roadmapId, args.lessonNodeId)),
  );
}
