import { randomUUID } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../context';
import { runTool } from '../toolSchemas';
import { runAuditedTool } from '../../audit/auditRun';
import { assertConfirmation, assertWriteEnabled } from '../guards';
import { createLesson, createRoadmap } from '../../curriculum/curriculumRepository';
import {
  extractDocumentSourceTool,
  getSerializedSource,
  listSourceDocuments,
  requireReadySource,
} from '../../sources/sourceRepository';
import {
  buildDraftLessonFromSource,
  buildDraftRoadmapFromSource,
  buildSingleLessonRoadmapInput,
} from '../../sources/sourceFromDocument';
import * as S from './sourceSchemas';

const CONFIRM_ROADMAP = 'create Microlearn roadmap from source';
const CONFIRM_LESSON = 'create Microlearn lesson from source';

function sourceAudit(args: unknown): Record<string, unknown> {
  const a = args as Record<string, unknown>;
  return {
    sourceId: a.sourceId,
    url: a.url,
    depth: a.depth,
    masteryLevel: a.masteryLevel,
  };
}

/** Registers document source read + mutation MCP tools. */
export function registerSourceTools(server: McpServer, ctx: ToolContext): void {
  const { db } = ctx;

  server.registerTool(
    'extract_document_source',
    {
      title: 'Extract document source',
      description: 'Fetch and extract text from a public document URL (PDF, text, markdown, HTML).',
      inputSchema: S.extractDocumentSourceInput,
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      runTool(async () => ({
        source: await extractDocumentSourceTool(db, { url: args.url, force: args.force }),
      })),
  );

  server.registerTool(
    'get_document_source',
    {
      title: 'Get document source',
      description: 'Return one source document with optional full extracted text.',
      inputSchema: S.getDocumentSourceInput,
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      runTool(() => ({
        source: getSerializedSource(db, args.sourceId, args.includeText ?? false),
      })),
  );

  server.registerTool(
    'list_document_sources',
    {
      title: 'List document sources',
      description: 'List recent extracted source documents.',
      inputSchema: S.listDocumentSourcesInput,
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      runTool(() => ({
        sources: listSourceDocuments(db, { status: args.status, limit: args.limit ?? 50 }).map((row) =>
          getSerializedSource(db, row.id, false),
        ),
      })),
  );

  server.registerTool(
    'create_roadmap_from_source',
    {
      title: 'Create roadmap from source',
      description: 'Create a validated draft roadmap from a ready source document (write tool).',
      inputSchema: S.createRoadmapFromSourceInput,
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      runAuditedTool(
        db,
        {
          action: 'create_roadmap_from_source',
          entityType: 'source_document',
          entityId: args.sourceId,
          toolName: 'create_roadmap_from_source',
          args,
          metadata: () => sourceAudit(args),
        },
        () => {
          assertWriteEnabled(ctx.config);
          assertConfirmation(args.confirm ?? '', CONFIRM_ROADMAP);
          const source = requireReadySource(db, args.sourceId);
          const draft = buildDraftRoadmapFromSource(source, {
            title: args.title,
            goal: args.goal,
            masteryLevel: args.masteryLevel,
            depth: args.depth,
          });
          const roadmap = createRoadmap(db, draft);
          return {
            roadmap,
            sourceDocumentId: source.id,
            note: 'Draft roadmap created from extracted source text. Not auto-published.',
          };
        },
      ),
  );

  server.registerTool(
    'create_lesson_from_source',
    {
      title: 'Create lesson from source',
      description: 'Create a backend-generated lesson from a ready source document (write tool).',
      inputSchema: S.createLessonFromSourceInput,
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      runAuditedTool(
        db,
        {
          action: 'create_lesson_from_source',
          entityType: 'source_document',
          entityId: args.sourceId,
          toolName: 'create_lesson_from_source',
          args,
          metadata: () => sourceAudit(args),
        },
        () => {
          assertWriteEnabled(ctx.config);
          assertConfirmation(args.confirm ?? '', CONFIRM_LESSON);
          const source = requireReadySource(db, args.sourceId);
          const lessonNodeId = randomUUID();
          const roadmapInput = buildSingleLessonRoadmapInput(source, lessonNodeId, {
            title: args.title,
            goal: args.goal,
            masteryLevel: args.masteryLevel,
            depth: args.depth,
          });
          const roadmap = createRoadmap(db, roadmapInput);
          const lessonPayload = buildDraftLessonFromSource(source, {
            title: args.title,
            goal: args.goal,
            masteryLevel: args.masteryLevel,
            depth: args.depth,
          });
          const lesson = createLesson(db, {
            roadmapId: roadmap.id,
            lessonNodeId,
            lesson: lessonPayload,
            model: 'heuristic-source-v1',
            promptVersion: 'phase4',
            changeSummary: `Created lesson from source document ${source.id}`,
          });
          return {
            roadmapId: roadmap.id,
            lessonNodeId,
            lesson,
            sourceDocumentId: source.id,
            note: 'Backend-generated lesson stored in generated_lessons. App may fetch via /api/lessons/:id.',
          };
        },
      ),
  );
}
