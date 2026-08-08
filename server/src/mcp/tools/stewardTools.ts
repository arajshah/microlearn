import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../context';
import { runAuditedTool, type AuditedToolSpec } from '../../audit/auditRun';
import { assertWriteEnabled } from '../guards';
import { runTool } from '../toolSchemas';
import {
  beginCurriculumStewardRun,
  completeCurriculumStewardRun,
  failCurriculumStewardRun,
  getCurriculumStewardCharter,
  getCurriculumStewardState,
  getCurriculumStrategy,
  getRecentCurriculumStewardRuns,
  updateCurriculumStewardCharter,
  updateCurriculumStrategy,
} from '../../steward/stewardRepository';
import * as S from './stewardSchemas';

function mutate(
  ctx: ToolContext,
  spec: Omit<AuditedToolSpec, 'metadata' | 'args'> & { args: unknown },
  handler: () => unknown,
) {
  return runAuditedTool(
    ctx.db,
    { actor: 'curriculum_steward', ...spec, args: spec.args, metadata: () => ({ steward: true }) },
    () => {
      assertWriteEnabled(ctx.config);
      return handler();
    },
  );
}

/** State and lifecycle tools for an external, MCP-connected Curriculum Steward. */
export function registerStewardTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'get_curriculum_steward_state',
    {
      title: 'Get Curriculum Steward state',
      description: 'Return a bounded planning snapshot with charter, strategy, curriculum, learning evidence, diagnostics, and recent runs.',
      inputSchema: S.getCurriculumStewardStateInput,
      annotations: { readOnlyHint: true },
    },
    async (args) => runTool(() => getCurriculumStewardState(ctx.db, args)),
  );

  server.registerTool(
    'get_curriculum_steward_charter',
    {
      title: 'Get Curriculum Steward charter',
      description: 'Return the active, versioned long-term Curriculum Steward charter.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => runTool(() => ({ charter: getCurriculumStewardCharter(ctx.db) })),
  );

  server.registerTool(
    'update_curriculum_steward_charter',
    {
      title: 'Update Curriculum Steward charter',
      description: 'Create a new active charter version, optionally guarded by expectedVersion.',
      inputSchema: S.updateCurriculumStewardCharterInput,
      annotations: { readOnlyHint: false },
    },
    async (args) => mutate(
      ctx,
      {
        action: 'update_curriculum_steward_charter',
        entityType: 'curriculum_steward_charter',
        entityId: (result) => (result as { charter: { id: string } }).charter.id,
        toolName: 'update_curriculum_steward_charter',
        args,
      },
      () => ({ charter: updateCurriculumStewardCharter(ctx.db, args) }),
    ),
  );

  server.registerTool(
    'get_curriculum_strategy',
    {
      title: 'Get curriculum strategy',
      description: 'Return the latest machine-readable Curriculum Steward strategy.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => runTool(() => ({ strategy: getCurriculumStrategy(ctx.db) })),
  );

  server.registerTool(
    'update_curriculum_strategy',
    {
      title: 'Update curriculum strategy',
      description: 'Persist a new structured strategy version, optionally guarded by expectedVersion.',
      inputSchema: S.updateCurriculumStrategyInput,
      annotations: { readOnlyHint: false },
    },
    async (args) => mutate(
      ctx,
      {
        action: 'update_curriculum_strategy',
        entityType: 'curriculum_strategy',
        entityId: (result) => (result as { strategy: { id: string } }).strategy.id,
        toolName: 'update_curriculum_strategy',
        args,
      },
      () => ({ strategy: updateCurriculumStrategy(ctx.db, args) }),
    ),
  );

  server.registerTool(
    'get_recent_curriculum_steward_runs',
    {
      title: 'Get recent Curriculum Steward runs',
      description: 'Return bounded run summaries, newest first.',
      inputSchema: S.getRecentCurriculumStewardRunsInput,
      annotations: { readOnlyHint: true },
    },
    async (args) => runTool(() => ({ runs: getRecentCurriculumStewardRuns(ctx.db, args.limit) })),
  );

  server.registerTool(
    'begin_curriculum_steward_run',
    {
      title: 'Begin Curriculum Steward run',
      description: 'Begin one idempotency-aware steward run. Rejects overlapping active runs.',
      inputSchema: S.beginCurriculumStewardRunInput,
      annotations: { readOnlyHint: false },
    },
    async (args) => mutate(
      ctx,
      {
        action: 'begin_curriculum_steward_run',
        entityType: 'curriculum_steward_run',
        entityId: (result) => (result as { run: { id: string } }).run.id,
        toolName: 'begin_curriculum_steward_run',
        args,
      },
      () => beginCurriculumStewardRun(ctx.db, { ...args, actor: 'curriculum_steward' }),
    ),
  );

  server.registerTool(
    'complete_curriculum_steward_run',
    {
      title: 'Complete Curriculum Steward run',
      description: 'Complete a run as completed or no_change with concise action summaries only.',
      inputSchema: S.completeCurriculumStewardRunInput,
      annotations: { readOnlyHint: false },
    },
    async (args) => mutate(
      ctx,
      {
        action: 'complete_curriculum_steward_run',
        entityType: 'curriculum_steward_run',
        entityId: () => args.runId,
        toolName: 'complete_curriculum_steward_run',
        args,
      },
      () => completeCurriculumStewardRun(ctx.db, args),
    ),
  );

  server.registerTool(
    'fail_curriculum_steward_run',
    {
      title: 'Fail Curriculum Steward run',
      description: 'Close a run with a bounded safe error code/message and no private reasoning.',
      inputSchema: S.failCurriculumStewardRunInput,
      annotations: { readOnlyHint: false },
    },
    async (args) => mutate(
      ctx,
      {
        action: 'fail_curriculum_steward_run',
        entityType: 'curriculum_steward_run',
        entityId: () => args.runId,
        toolName: 'fail_curriculum_steward_run',
        args,
      },
      () => failCurriculumStewardRun(ctx.db, args),
    ),
  );
}
