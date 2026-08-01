import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../context';
import { runTool } from '../toolSchemas';
import { runAuditedTool, type AuditedToolSpec } from '../../audit/auditRun';
import { assertWriteEnabled } from '../guards';
import { assertConfirmationOrTrusted } from '../trustedAuthorization';
import * as repo from '../../curriculum/curriculumRepository';
import * as S from './curriculumSchemas';

const CONFIRM_DELETE_UNIT = 'delete Microlearn unit';
const CONFIRM_DELETE_NODE = 'delete Microlearn lesson node';
const CONFIRM_PUBLISH = 'publish Microlearn roadmap';
const CONFIRM_ROLLBACK = 'rollback Microlearn roadmap';

function curriculumAudit(args: unknown): Record<string, unknown> {
  const a = args as Record<string, unknown>;
  return {
    changeSummary: a.changeSummary,
    roadmapId: a.roadmapId,
    confirmUsed: typeof a.confirm === 'string',
  };
}

function mutate(
  ctx: ToolContext,
  spec: Omit<AuditedToolSpec, 'metadata' | 'args'> & { args: unknown },
  handler: () => unknown,
) {
  return runAuditedTool(
    ctx.db,
    { ...spec, args: spec.args, metadata: () => curriculumAudit(spec.args) },
    () => {
      assertWriteEnabled(ctx.config);
      return handler();
    },
  );
}

/** Registers curriculum read + mutation tools. Mutations require the write flag. */
export function registerCurriculumTools(server: McpServer, ctx: ToolContext): void {
  const { db } = ctx;

  // ---- Read tools (no write flag required) ----

  server.registerTool(
    'list_roadmaps',
    {
      title: 'List roadmaps',
      description: 'List roadmap summaries. Excludes deleted by default; optional counts.',
      inputSchema: S.listRoadmapsInput,
      annotations: { readOnlyHint: true },
    },
    async (args) => runTool(() => ({ roadmaps: repo.listRoadmaps(db, { status: args.status, includeCounts: args.includeCounts }) })),
  );

  server.registerTool(
    'get_roadmap',
    {
      title: 'Get roadmap',
      description: 'Get one roadmap with nested units and lesson nodes; optional blueprints/lessons/outcomes/versions.',
      inputSchema: S.getRoadmapInput,
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      runTool(() => ({
        roadmap: repo.getRoadmapDetailed(db, args.roadmapId, {
          includeBlueprints: args.includeBlueprints,
          includeLessons: args.includeLessons,
          includeOutcomes: args.includeOutcomes,
          includeVersions: args.includeVersions,
        }),
      })),
  );

  server.registerTool(
    'validate_curriculum',
    {
      title: 'Validate curriculum',
      description: 'Validate a roadmap structure and prerequisites; returns errors, warnings, and stats.',
      inputSchema: S.validateCurriculumInput,
      annotations: { readOnlyHint: true },
    },
    async (args) => runTool(() => repo.validateRoadmap(db, args.roadmapId)),
  );

  server.registerTool(
    'read_learning_outcomes',
    {
      title: 'Read learning outcomes',
      description: 'Return stored lesson outcomes (default limit 20). Does not fabricate analytics.',
      inputSchema: S.readLearningOutcomesInput,
      annotations: { readOnlyHint: true },
    },
    async (args) => runTool(() => repo.readLearningOutcomes(db, { roadmapId: args.roadmapId, lessonNodeId: args.lessonNodeId, limit: args.limit })),
  );

  // ---- Mutation tools (require MICROLEARN_ENABLE_WRITE_TOOLS=true) ----

  server.registerTool(
    'create_roadmap',
    {
      title: 'Create roadmap (draft)',
      description: 'Create a new draft roadmap with units and lesson nodes. Validated and versioned.',
      inputSchema: S.createRoadmapInput,
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      mutate(
        ctx,
        {
          action: 'create_roadmap',
          entityType: 'roadmap',
          toolName: 'create_roadmap',
          entityId: (r) => (r as { roadmap: { id: string } }).roadmap.id,
          args,
        },
        () => ({ roadmap: repo.createRoadmap(db, args) }),
      ),
  );

  server.registerTool(
    'update_roadmap',
    {
      title: 'Update roadmap',
      description: 'Update roadmap metadata/status (rejects deleted; publishing validates first).',
      inputSchema: S.updateRoadmapInput,
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      mutate(
        ctx,
        {
          action: 'update_roadmap',
          entityType: 'roadmap',
          toolName: 'update_roadmap',
          entityId: () => args.roadmapId,
          args,
        },
        () => ({ roadmap: repo.updateRoadmap(db, args.roadmapId, args.patch, args.changeSummary) }),
      ),
  );

  server.registerTool(
    'create_unit',
    {
      title: 'Create unit',
      description: 'Add a unit to a draft/archived roadmap.',
      inputSchema: S.createUnitInput,
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      mutate(
        ctx,
        { action: 'create_unit', entityType: 'roadmap_unit', toolName: 'create_unit', entityId: () => args.roadmapId, args },
        () => repo.createUnit(db, args),
      ),
  );

  server.registerTool(
    'update_unit',
    {
      title: 'Update unit',
      description: 'Update unit fields; re-normalizes ordering when order changes.',
      inputSchema: S.updateUnitInput,
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      mutate(
        ctx,
        { action: 'update_unit', entityType: 'roadmap_unit', toolName: 'update_unit', entityId: () => args.unitId, args },
        () => ({ roadmap: repo.updateUnit(db, args) }),
      ),
  );

  server.registerTool(
    'delete_unit',
    {
      title: 'Delete unit',
      description: 'Delete an empty unit. Requires confirmation "delete Microlearn unit".',
      inputSchema: S.deleteUnitInput,
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async (args) =>
      mutate(
        ctx,
        { action: 'delete_unit', entityType: 'roadmap_unit', toolName: 'delete_unit', entityId: () => args.unitId, args },
        () => {
          assertConfirmationOrTrusted(ctx, 'delete_unit', args, args.confirm, CONFIRM_DELETE_UNIT);
          return repo.deleteUnit(db, args);
        },
      ),
  );

  server.registerTool(
    'create_lesson_node',
    {
      title: 'Create lesson node',
      description: 'Add a lesson node to a unit; validates prerequisites and sets initial status.',
      inputSchema: S.createLessonNodeInput,
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      mutate(
        ctx,
        {
          action: 'create_lesson_node',
          entityType: 'lesson_node',
          toolName: 'create_lesson_node',
          entityId: (r) => (r as { lessonNodeId: string }).lessonNodeId,
          args,
        },
        () => repo.createLessonNode(db, args),
      ),
  );

  server.registerTool(
    'update_lesson_node',
    {
      title: 'Update lesson node',
      description: 'Update a lesson node; validates prerequisite refs, rejects cycles/forward deps.',
      inputSchema: S.updateLessonNodeInput,
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      mutate(
        ctx,
        {
          action: 'update_lesson_node',
          entityType: 'lesson_node',
          toolName: 'update_lesson_node',
          entityId: () => args.lessonNodeId,
          args,
        },
        () => ({ roadmap: repo.updateLessonNode(db, args) }),
      ),
  );

  server.registerTool(
    'delete_lesson_node',
    {
      title: 'Delete lesson node',
      description: 'Delete a lesson node with no dependents. Requires confirmation "delete Microlearn lesson node".',
      inputSchema: S.deleteLessonNodeInput,
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async (args) =>
      mutate(
        ctx,
        {
          action: 'delete_lesson_node',
          entityType: 'lesson_node',
          toolName: 'delete_lesson_node',
          entityId: () => args.lessonNodeId,
          args,
        },
        () => {
          assertConfirmationOrTrusted(ctx, 'delete_lesson_node', args, args.confirm, CONFIRM_DELETE_NODE);
          return repo.deleteLessonNode(db, args);
        },
      ),
  );

  server.registerTool(
    'reorder_lesson_nodes',
    {
      title: 'Reorder lesson nodes',
      description: 'Reorder lesson nodes (roadmap-wide or within a unit); validates prerequisites.',
      inputSchema: S.reorderLessonNodesInput,
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      mutate(
        ctx,
        {
          action: 'reorder_lesson_nodes',
          entityType: 'roadmap',
          toolName: 'reorder_lesson_nodes',
          entityId: () => args.roadmapId,
          args,
        },
        () => ({ roadmap: repo.reorderLessonNodes(db, args) }),
      ),
  );

  server.registerTool(
    'create_lesson_blueprint',
    {
      title: 'Create lesson blueprint',
      description: 'Store a versioned blueprint for a node (requires title/primaryObjective/keyIdeas/estimatedMinutes).',
      inputSchema: S.createLessonBlueprintInput,
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      mutate(
        ctx,
        {
          action: 'create_lesson_blueprint',
          entityType: 'lesson_blueprint',
          toolName: 'create_lesson_blueprint',
          entityId: (r) => (r as { blueprint: { id: string } }).blueprint.id,
          args,
        },
        () => ({ blueprint: repo.createLessonBlueprint(db, args) }),
      ),
  );

  server.registerTool(
    'update_lesson_blueprint',
    {
      title: 'Update lesson blueprint',
      description: 'Store a new blueprint version for the node (non-destructive versioned insert).',
      inputSchema: S.updateLessonBlueprintInput,
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      mutate(
        ctx,
        {
          action: 'update_lesson_blueprint',
          entityType: 'lesson_blueprint',
          toolName: 'update_lesson_blueprint',
          entityId: (r) => (r as { blueprint: { id: string } }).blueprint.id,
          args,
        },
        () => ({ blueprint: repo.updateLessonBlueprint(db, args) }),
      ),
  );

  server.registerTool(
    'create_lesson',
    {
      title: 'Create generated lesson',
      description: 'Store a generated lesson version and link it to the node.',
      inputSchema: S.createLessonInput,
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      mutate(
        ctx,
        {
          action: 'create_lesson',
          entityType: 'generated_lesson',
          toolName: 'create_lesson',
          entityId: (r) => (r as { lesson: { id: string } }).lesson.id,
          args,
        },
        () => ({ lesson: repo.createLesson(db, args) }),
      ),
  );

  server.registerTool(
    'update_lesson',
    {
      title: 'Update generated lesson',
      description: 'Store a new generated lesson version and re-link the node to the newest lesson.',
      inputSchema: S.updateLessonInput,
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      mutate(
        ctx,
        {
          action: 'update_lesson',
          entityType: 'generated_lesson',
          toolName: 'update_lesson',
          entityId: (r) => (r as { lesson: { id: string } }).lesson.id,
          args,
        },
        () => ({ lesson: repo.updateLesson(db, args) }),
      ),
  );

  server.registerTool(
    'publish_version',
    {
      title: 'Publish roadmap version',
      description: 'Validate then publish a roadmap. Requires confirmation "publish Microlearn roadmap".',
      inputSchema: S.publishVersionInput,
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      mutate(
        ctx,
        {
          action: 'publish_version',
          entityType: 'roadmap',
          toolName: 'publish_version',
          entityId: () => args.roadmapId,
          args,
        },
        () => {
          assertConfirmationOrTrusted(ctx, 'publish_version', args, args.confirm, CONFIRM_PUBLISH);
          return repo.publishVersion(db, args.roadmapId, args.changeSummary);
        },
      ),
  );

  server.registerTool(
    'rollback_version',
    {
      title: 'Rollback roadmap version',
      description: 'Restore a roadmap from a roadmap-level content-version snapshot. Requires confirmation "rollback Microlearn roadmap".',
      inputSchema: S.rollbackVersionInput,
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      mutate(
        ctx,
        {
          action: 'rollback_version',
          entityType: 'roadmap',
          toolName: 'rollback_version',
          entityId: () => args.roadmapId,
          args,
        },
        () => {
          assertConfirmationOrTrusted(ctx, 'rollback_version', args, args.confirm, CONFIRM_ROLLBACK);
          return { roadmap: repo.rollbackVersion(db, args.roadmapId, args.versionId, args.changeSummary) };
        },
      ),
  );
}
