import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../context';
import { runTool } from '../toolSchemas';
import { ToolError } from '../repoSafety';
import { assertWriteEnabled } from '../guards';
import { listLearningEvents } from '../../adaptive/events';
import { listConceptMastery, listWeaknesses } from '../../adaptive/mastery';
import { createDiagnosticSession } from '../../adaptive/diagnostics';
import { createRemediationQueueItem, listRemediationQueue } from '../../adaptive/remediation';
import {
  buildCurrentLearningSnapshot,
  buildDailyLearningSnapshot,
  buildRoadmapLearningSnapshot,
  getLearningState,
  recommendNextLearningAction,
  storeLearningSnapshot,
} from '../../adaptive/snapshots';
import { conceptNameFromSlug, normalizeConceptSlug } from '../../adaptive/concepts';
import { LEARNING_EVENT_TYPES } from '../../adaptive/types';

const CREATE_DIAGNOSTIC_CONFIRM = 'create Microlearn diagnostic';
const CREATE_REMEDIATION_CONFIRM = 'create Microlearn remediation';

const getLearningStateInput = {
  includeEvents: z.boolean().optional().describe('Include raw recent learning events. Default false.'),
  includeWeaknesses: z.boolean().optional().describe('Include full active weakness records. Default false.'),
  includeDueReviews: z.boolean().optional().describe('Include due review concepts. Default true.'),
  limit: z.number().int().positive().max(50).optional().describe('Items per section. Default 10.'),
};

const listConceptMasteryInput = {
  sort: z.enum(['weakest', 'strongest', 'recent', 'due']).optional().describe('Sort order. Default weakest.'),
  subjectId: z.string().optional(),
  topic: z.string().optional(),
  limit: z.number().int().positive().max(200).optional().describe('Default 25.'),
};

const listLearningEventsInput = {
  conceptSlug: z.string().optional(),
  roadmapId: z.string().optional(),
  lessonId: z.string().optional(),
  eventType: z.enum(LEARNING_EVENT_TYPES as unknown as [string, ...string[]]).optional(),
  since: z.string().optional().describe('ISO timestamp lower bound.'),
  limit: z.number().int().positive().max(200).optional().describe('Default 25.'),
};

const listWeaknessesInput = {
  status: z.enum(['active', 'resolved', 'ignored']).optional().describe('Default active.'),
  limit: z.number().int().positive().max(100).optional().describe('Default 15.'),
};

const recommendNextActionInput = {
  goal: z.string().optional().describe('What the learner wants to achieve right now.'),
  availableMinutes: z.number().int().positive().max(600).optional(),
  roadmapId: z.string().optional().describe('Scope the recommendation to one roadmap.'),
};

const createDiagnosticInput = {
  roadmapId: z.string().min(1).describe('Roadmap to build the diagnostic from.'),
  conceptCount: z.number().int().min(1).max(20).optional().describe('Number of items. Default 5.'),
  confirm: z.string().optional().describe(`Must be exactly "${CREATE_DIAGNOSTIC_CONFIRM}".`),
};

const createRemediationInput = {
  conceptSlug: z.string().min(1),
  weaknessId: z.string().optional(),
  roadmapId: z.string().optional(),
  depth: z.enum(['quick', 'standard', 'deep']).optional().describe('Default standard.'),
  confirm: z.string().optional().describe(`Must be exactly "${CREATE_REMEDIATION_CONFIRM}".`),
};

const buildSnapshotInput = {
  type: z.enum(['current_state', 'daily', 'roadmap']).describe('Snapshot scope.'),
  roadmapId: z.string().optional().describe('Required when type is "roadmap".'),
};

/**
 * Registers the Adaptive Learning v1 tools. All read tools return compact JSON;
 * raw event dumps only appear when explicitly requested.
 */
export function registerAdaptiveTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'get_learning_state',
    {
      title: 'Get learning state',
      description:
        'Compact current learning state: mastery summary, recent activity, weakest concepts, due reviews, open remediation, and the recommended next action.',
      inputSchema: getLearningStateInput,
      annotations: { readOnlyHint: true },
    },
    async (args) => runTool(() => getLearningState(ctx.db, args)),
  );

  server.registerTool(
    'list_concept_mastery',
    {
      title: 'List concept mastery',
      description: 'Concept-level mastery scores, sortable by weakest, strongest, recent, or due.',
      inputSchema: listConceptMasteryInput,
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      runTool(() => {
        const mastery = listConceptMastery(ctx.db, {
          sort: args.sort ?? 'weakest',
          subjectId: args.subjectId,
          topic: args.topic,
          limit: args.limit ?? 25,
        });
        return { count: mastery.length, mastery };
      }),
  );

  server.registerTool(
    'list_learning_events',
    {
      title: 'List learning events',
      description: 'Filtered granular learning event log (newest first). Use filters to keep payloads small.',
      inputSchema: listLearningEventsInput,
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      runTool(() => {
        const events = listLearningEvents(ctx.db, {
          conceptSlug: args.conceptSlug,
          roadmapId: args.roadmapId,
          lessonId: args.lessonId,
          eventType: args.eventType,
          since: args.since,
          limit: args.limit ?? 25,
        });
        return { count: events.length, events };
      }),
  );

  server.registerTool(
    'list_weaknesses',
    {
      title: 'List weaknesses',
      description: 'Weakness observations with severity, evidence event ids, and recommended action.',
      inputSchema: listWeaknessesInput,
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      runTool(() => {
        const weaknesses = listWeaknesses(ctx.db, {
          status: args.status ?? 'active',
          limit: args.limit ?? 15,
        });
        return { count: weaknesses.length, weaknesses };
      }),
  );

  server.registerTool(
    'recommend_next_learning_action',
    {
      title: 'Recommend next learning action',
      description:
        'Returns a ranked next action (continue_lesson, review_due_concepts, generate_remediation, run_diagnostic, start_new_roadmap) with reason and evidence.',
      inputSchema: recommendNextActionInput,
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      runTool(() => {
        const actions = recommendNextLearningAction(ctx.db, {
          roadmapId: args.roadmapId,
          availableMinutes: args.availableMinutes,
          goal: args.goal,
        });
        return { recommended: actions[0] ?? null, alternatives: actions.slice(1) };
      }),
  );

  server.registerTool(
    'create_diagnostic_for_roadmap',
    {
      title: 'Create diagnostic for roadmap',
      description: `Creates a diagnostic session with deterministic items from roadmap lesson nodes. Requires confirm: "${CREATE_DIAGNOSTIC_CONFIRM}".`,
      inputSchema: createDiagnosticInput,
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      runTool(() => {
        assertWriteEnabled(ctx.config);
        if (args.confirm !== CREATE_DIAGNOSTIC_CONFIRM) {
          throw new ToolError(
            'CONFIRMATION_REQUIRED',
            `Set confirm to "${CREATE_DIAGNOSTIC_CONFIRM}" to create a diagnostic session.`,
          );
        }
        const session = createDiagnosticSession(ctx.db, {
          roadmapId: args.roadmapId,
          conceptCount: args.conceptCount ?? 5,
        });
        return {
          sessionId: session.id,
          topic: session.topic,
          itemCount: session.items.length,
          items: session.items.map((i) => ({
            id: i.id,
            conceptSlug: i.conceptSlug,
            question: i.question,
            options: i.options,
          })),
        };
      }),
  );

  server.registerTool(
    'create_remediation_lesson',
    {
      title: 'Create remediation lesson',
      description: `Queues a remediation item for a weak concept (v1 creates a queue entry, not a full lesson). Requires confirm: "${CREATE_REMEDIATION_CONFIRM}".`,
      inputSchema: createRemediationInput,
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      runTool(() => {
        assertWriteEnabled(ctx.config);
        if (args.confirm !== CREATE_REMEDIATION_CONFIRM) {
          throw new ToolError(
            'CONFIRMATION_REQUIRED',
            `Set confirm to "${CREATE_REMEDIATION_CONFIRM}" to queue a remediation lesson.`,
          );
        }
        const conceptSlug = normalizeConceptSlug(args.conceptSlug);
        if (!conceptSlug) throw new ToolError('INVALID_INPUT', 'conceptSlug could not be normalized.');

        const weakness = args.weaknessId
          ? listWeaknesses(ctx.db, { conceptSlug, limit: 50 }).find((w) => w.id === args.weaknessId)
          : listWeaknesses(ctx.db, { conceptSlug, status: 'active', limit: 1 })[0];

        const depth = args.depth ?? 'standard';
        const item = createRemediationQueueItem(ctx.db, {
          conceptSlug,
          roadmapId: args.roadmapId,
          severity: weakness?.severity ?? 0.6,
          reason:
            weakness?.evidenceSummary ??
            `Manual remediation request for ${conceptSlug} (${depth} depth).`,
          suggestedLessonTitle: `${conceptNameFromSlug(conceptSlug)} — targeted ${depth} review`,
        });

        return {
          queued: Boolean(item),
          item,
          weaknessId: weakness?.id ?? null,
          note: 'v1 queues remediation; lesson generation is a separate step.',
        };
      }),
  );

  server.registerTool(
    'build_learning_snapshot',
    {
      title: 'Build learning snapshot',
      description: 'Builds and stores a compact learning snapshot (current_state, daily, or roadmap).',
      inputSchema: buildSnapshotInput,
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      runTool(() => {
        assertWriteEnabled(ctx.config);
        if (args.type === 'roadmap' && !args.roadmapId) {
          throw new ToolError('INVALID_INPUT', 'roadmapId is required for roadmap snapshots.');
        }
        const snapshot =
          args.type === 'daily'
            ? buildDailyLearningSnapshot(ctx.db)
            : args.type === 'roadmap'
              ? buildRoadmapLearningSnapshot(ctx.db, args.roadmapId!)
              : buildCurrentLearningSnapshot(ctx.db);
        return { snapshot: storeLearningSnapshot(ctx.db, snapshot) };
      }),
  );

  server.registerTool(
    'list_remediation_queue',
    {
      title: 'List remediation queue',
      description: 'Open and generated remediation items ordered by severity.',
      inputSchema: {
        status: z.enum(['open', 'generated', 'dismissed', 'resolved']).optional(),
        limit: z.number().int().positive().max(100).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      runTool(() => {
        const items = listRemediationQueue(ctx.db, {
          status: args.status,
          limit: args.limit ?? 15,
        });
        return { count: items.length, items };
      }),
  );
}
