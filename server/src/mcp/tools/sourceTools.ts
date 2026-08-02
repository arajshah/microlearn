import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../context';
import { runTool } from '../toolSchemas';
import { runAuditedTool } from '../../audit/auditRun';
import { assertWriteEnabled } from '../guards';
import { assertConfirmationOrTrusted } from '../trustedAuthorization';
import {
  extractDocumentSourceTool,
  getSerializedSource,
  listSourceDocuments,
  requireReadySource,
} from '../../sources/sourceRepository';
import { generateRoadmap, generateStandaloneLesson } from '../../generation/generationService';
import * as S from './sourceSchemas';

const CONFIRM_ROADMAP = 'create Microlearn roadmap from source';
const CONFIRM_LESSON = 'create Microlearn lesson from source';

const DEPTH_LESSON_COUNT = { quick: 6, standard: 10, deep: 16 } as const;
const DEPTH_SLIDES = { quick: 6, standard: 8, deep: 10 } as const;

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
        async () => {
          assertWriteEnabled(ctx.config);
          assertConfirmationOrTrusted(ctx, 'create_roadmap_from_source', args, args.confirm, CONFIRM_ROADMAP);
          const source = requireReadySource(db, args.sourceId);
          const serialized = getSerializedSource(db, source.id, true);
          const roadmap = await generateRoadmap(db, {
            topic: args.title ?? serialized.title ?? 'Source roadmap',
            goal: args.goal,
            masteryLevel: args.masteryLevel,
            depth: args.depth,
            lessonCount: DEPTH_LESSON_COUNT[args.depth],
            slidesPerLesson: DEPTH_SLIDES[args.depth],
            preferences: serialized.extractedText?.slice(0, 9000),
            sourceUrl: serialized.url,
            sourceExtractionId: serialized.id,
          });
          return {
            roadmap,
            sourceDocumentId: source.id,
            note: 'AI-generated roadmap persisted from extracted source text.',
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
        async () => {
          assertWriteEnabled(ctx.config);
          assertConfirmationOrTrusted(ctx, 'create_lesson_from_source', args, args.confirm, CONFIRM_LESSON);
          const source = requireReadySource(db, args.sourceId);
          const serialized = getSerializedSource(db, source.id, true);
          const lesson = await generateStandaloneLesson(db, {
            subjectId: 'general',
            topic: args.title ?? serialized.title ?? 'Source lesson',
            masteryLevel: args.masteryLevel,
            slideCount: DEPTH_SLIDES[args.depth],
            sourceText: serialized.extractedText,
            sourceUrl: serialized.url,
            sourceTitle: serialized.title,
          });
          return {
            lesson,
            sourceDocumentId: source.id,
            note: 'AI-generated lesson persisted from extracted source text.',
          };
        },
      ),
  );
}
