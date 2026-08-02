import { randomUUID } from 'node:crypto';
import type { Db } from '../db';
import { ApiError, notFound } from '../api/apiError';
import { resolveRoadmapNodeId } from '../roadmaps/nodeIdResolver';
import {
  createRoadmap,
  getGeneratedLesson,
  getRoadmap,
  patchLessonNode,
  upsertGeneratedLesson,
} from '../api/repository';
import type { GeneratedLessonRow, LessonNodeRow } from '../api/serializers';
import { recordAuditEvent } from '../audit/auditService';
import { createAiGenerationProvider } from './provider';
import { generateRoadmapDraft, type GenerateRoadmapRequest } from './roadmapBuilder';
import { generateLessonDraft, type GenerateLessonRequest } from './lessonBuilder';
import { buildLessonGenerationContext } from './continuity';
import { LESSON_GENERATION_PROMPT_VERSION } from './versions';
import type { LessonBlueprint } from './types';

interface GenerationJobRow {
  id: string;
  idempotency_key: string;
  entity_type: string;
  entity_id: string | null;
  status: 'in_progress' | 'completed' | 'failed';
  request_json: string;
  result_entity_id: string | null;
  error_code: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

type JobBegin =
  | { action: 'run'; job: GenerationJobRow }
  | { action: 'completed'; resultEntityId: string }
  | { action: 'in_progress' };

const STALE_JOB_MS = 10 * 60 * 1000;
const DEFAULT_SUBJECT_ID = 'computer-science';

function now(): string {
  return new Date().toISOString();
}

function parseJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function jobKey(prefix: string, explicit?: string): string {
  return explicit?.trim() ? `${prefix}:${explicit.trim()}` : `${prefix}:${randomUUID()}`;
}

function beginJob(
  db: Db,
  input: { key: string; entityType: string; entityId?: string; request: unknown },
): JobBegin {
  const ts = now();
  const inserted = db
    .prepare(
      `INSERT OR IGNORE INTO generation_jobs
        (id, idempotency_key, entity_type, entity_id, status, request_json, started_at, created_at, updated_at)
       VALUES (@id, @key, @entityType, @entityId, 'in_progress', @request, @ts, @ts, @ts)`,
    )
    .run({
      id: randomUUID(),
      key: input.key,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      request: JSON.stringify(input.request),
      ts,
    });

  const existing = db
    .prepare('SELECT * FROM generation_jobs WHERE idempotency_key = ?')
    .get(input.key) as GenerationJobRow;

  if (inserted.changes > 0) return { action: 'run', job: existing };
  if (existing.status === 'completed' && existing.result_entity_id) {
    return { action: 'completed', resultEntityId: existing.result_entity_id };
  }
  const updatedAt = Date.parse(existing.updated_at) || Date.parse(existing.started_at ?? '') || 0;
  const stale = Date.now() - updatedAt > STALE_JOB_MS;
  if (existing.status === 'in_progress' && !stale) return { action: 'in_progress' };

  db.prepare(
    `UPDATE generation_jobs
     SET status = 'in_progress',
       request_json = @request,
       error_code = NULL,
       error_message = NULL,
       result_entity_id = NULL,
       started_at = @ts,
       completed_at = NULL,
       updated_at = @ts
     WHERE id = @id`,
  ).run({ id: existing.id, request: JSON.stringify(input.request), ts });
  return {
    action: 'run',
    job: db.prepare('SELECT * FROM generation_jobs WHERE id = ?').get(existing.id) as GenerationJobRow,
  };
}

function completeJob(db: Db, jobId: string, resultEntityId: string): void {
  const ts = now();
  db.prepare(
    `UPDATE generation_jobs
     SET status = 'completed', result_entity_id = ?, completed_at = ?, updated_at = ?
     WHERE id = ?`,
  ).run(resultEntityId, ts, ts, jobId);
}

function failJob(db: Db, jobId: string, err: unknown): void {
  const apiErr = err instanceof ApiError ? err : new ApiError(500, 'Generation failed.', 'GENERATION_FAILED');
  const ts = now();
  db.prepare(
    `UPDATE generation_jobs
     SET status = 'failed', error_code = ?, error_message = ?, completed_at = ?, updated_at = ?
     WHERE id = ?`,
  ).run(apiErr.code ?? 'GENERATION_FAILED', apiErr.message, ts, ts, jobId);
}

function activeLessonForNode(db: Db, roadmapId: string, nodeId: string) {
  const canonicalNodeId = resolveRoadmapNodeId(db, roadmapId, nodeId) ?? nodeId;
  const row = db
    .prepare(
      `SELECT * FROM generated_lessons
       WHERE roadmap_id = ? AND lesson_node_id = ? AND status = 'active'
       ORDER BY updated_at DESC LIMIT 1`,
    )
    .get(roadmapId, canonicalNodeId) as GeneratedLessonRow | undefined;
  return row ? getGeneratedLesson(db, row.id) : null;
}

function insertBlueprint(
  db: Db,
  input: { roadmapId: string; lessonNodeId: string; blueprint: LessonBlueprint },
): { id: string; version: number } {
  const existing = db
    .prepare(
      'SELECT id, version, blueprint_json FROM lesson_blueprints WHERE roadmap_id = ? AND lesson_node_id = ? ORDER BY version DESC LIMIT 1',
    )
    .get(input.roadmapId, input.lessonNodeId) as
    | { id: string; version: number; blueprint_json: string }
    | undefined;

  const ts = now();
  const serialized = JSON.stringify(input.blueprint);
  if (existing && existing.blueprint_json === serialized) return existing;

  const id = randomUUID();
  const version = (existing?.version ?? 0) + 1;
  db.prepare(
    `INSERT INTO lesson_blueprints
      (id, roadmap_id, lesson_node_id, version, blueprint_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, input.roadmapId, input.lessonNodeId, version, serialized, ts, ts);
  return { id, version };
}

function loadNodeRow(db: Db, roadmapId: string, nodeId: string): LessonNodeRow {
  const canonicalNodeId = resolveRoadmapNodeId(db, roadmapId, nodeId);
  if (!canonicalNodeId) throw notFound(`Lesson node "${nodeId}" not found in roadmap.`);
  const row = db
    .prepare('SELECT * FROM lesson_nodes WHERE roadmap_id = ? AND id = ?')
    .get(roadmapId, canonicalNodeId) as LessonNodeRow | undefined;
  if (!row) throw notFound(`Lesson node "${nodeId}" not found in roadmap.`);
  return row;
}

function assertNodeEligible(db: Db, node: LessonNodeRow): void {
  if (node.status !== 'locked') return;
  const prereqs = parseJsonArray(node.prerequisite_ids_json);
  if (prereqs.length === 0) return;
  const completed = new Set(
    (db
      .prepare("SELECT id FROM lesson_nodes WHERE roadmap_id = ? AND status = 'completed'")
      .all(node.roadmap_id) as Array<{ id: string }>).map((row) => row.id),
  );
  const blocked = prereqs.some((id) => !completed.has(id));
  if (blocked) throw new ApiError(409, 'Complete prerequisites before generating this lesson.', 'NODE_LOCKED');
}

function safeGenerationError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  return new ApiError(500, 'Generation failed.', 'GENERATION_FAILED');
}

export async function generateRoadmap(db: Db, input: GenerateRoadmapRequest) {
  const begin = beginJob(db, {
    key: jobKey('roadmap', input.idempotencyKey),
    entityType: 'roadmap',
    request: input,
  });
  if (begin.action === 'completed') return getRoadmap(db, begin.resultEntityId);
  if (begin.action === 'in_progress') {
    throw new ApiError(409, 'Roadmap generation is already in progress.', 'GENERATION_IN_PROGRESS');
  }

  try {
    const provider = createAiGenerationProvider();
    const draft = await generateRoadmapDraft(provider, input);
    const roadmap = createRoadmap(db, draft);
    completeJob(db, begin.job.id, roadmap.id);
    recordAuditEvent(db, {
      actor: 'api',
      action: 'generation.roadmap.created',
      entityType: 'roadmap',
      entityId: roadmap.id,
      metadata: { jobId: begin.job.id, model: provider.model },
    });
    return roadmap;
  } catch (err) {
    failJob(db, begin.job.id, err);
    throw safeGenerationError(err);
  }
}

export async function generateStandaloneLesson(db: Db, input: GenerateLessonRequest) {
  const begin = beginJob(db, {
    key: jobKey('lesson', input.idempotencyKey),
    entityType: 'generated_lesson',
    request: input,
  });
  if (begin.action === 'completed') return getGeneratedLesson(db, begin.resultEntityId);
  if (begin.action === 'in_progress') {
    throw new ApiError(409, 'Lesson generation is already in progress.', 'GENERATION_IN_PROGRESS');
  }

  try {
    const provider = createAiGenerationProvider();
    const lessonJson = await generateLessonDraft(provider, input, db);
    const lesson = upsertGeneratedLesson(db, {
      subjectId: input.subjectId,
      topic: input.topic,
      title: String(lessonJson.title ?? input.topic),
      lessonJson,
      model: provider.model,
      promptVersion: LESSON_GENERATION_PROMPT_VERSION,
    });
    completeJob(db, begin.job.id, lesson.id);
    recordAuditEvent(db, {
      actor: 'api',
      action: 'generation.lesson.created',
      entityType: 'generated_lesson',
      entityId: lesson.id,
      metadata: {
        jobId: begin.job.id,
        model: provider.model,
        qualityScore: lessonJson.generationMetadata?.qualityScore,
      },
    });
    return lesson;
  } catch (err) {
    failJob(db, begin.job.id, err);
    throw safeGenerationError(err);
  }
}

export async function generateRoadmapNodeLesson(
  db: Db,
  input: { roadmapId: string; nodeId: string; subjectId?: string; idempotencyKey?: string },
) {
  const node = loadNodeRow(db, input.roadmapId, input.nodeId);
  const canonicalNodeId = node.id;
  const existing = activeLessonForNode(db, input.roadmapId, canonicalNodeId);
  if (existing) return { lesson: existing, reused: true };

  assertNodeEligible(db, node);
  const key = input.idempotencyKey?.trim()
    ? `node:${input.idempotencyKey.trim()}`
    : `node:${input.roadmapId}:${canonicalNodeId}`;
  const begin = beginJob(db, {
    key,
    entityType: 'roadmap_node_lesson',
    entityId: `${input.roadmapId}:${canonicalNodeId}`,
    request: input,
  });
  if (begin.action === 'completed') {
    return { lesson: getGeneratedLesson(db, begin.resultEntityId), reused: true };
  }
  if (begin.action === 'in_progress') {
    throw new ApiError(409, 'Lesson generation is already in progress for this node.', 'GENERATION_IN_PROGRESS');
  }

  patchLessonNode(db, input.roadmapId, canonicalNodeId, { status: 'generating' });
  try {
    const roadmap = getRoadmap(db, input.roadmapId);
    const ctx = buildLessonGenerationContext(db, {
      roadmapId: input.roadmapId,
      nodeId: canonicalNodeId,
      slidesPerLesson: Math.max(3, Math.min(20, node.estimated_minutes + 2)),
    });
    const provider = createAiGenerationProvider();
    const lessonJson = await generateLessonDraft(
      provider,
      {
        subjectId: input.subjectId ?? DEFAULT_SUBJECT_ID,
        topic: node.title,
        masteryLevel: roadmap.masteryLevel,
        slideCount: ctx.slidesPerLesson,
        roadmapId: input.roadmapId,
        roadmapNodeId: canonicalNodeId,
      },
      db,
    );
    const blueprint = insertBlueprint(db, {
      roadmapId: input.roadmapId,
      lessonNodeId: canonicalNodeId,
      blueprint: lessonJson.blueprint,
    });
    const lesson = upsertGeneratedLesson(db, {
      subjectId: input.subjectId ?? DEFAULT_SUBJECT_ID,
      topic: node.title,
      title: String(lessonJson.title ?? node.title),
      roadmapId: input.roadmapId,
      lessonNodeId: canonicalNodeId,
      blueprintId: blueprint.id,
      lessonJson: {
        ...lessonJson,
        roadmapId: input.roadmapId,
        roadmapNodeId: canonicalNodeId,
        blueprintId: blueprint.id,
        blueprintVersion: blueprint.version,
      },
      model: provider.model,
      promptVersion: LESSON_GENERATION_PROMPT_VERSION,
    });
    patchLessonNode(db, input.roadmapId, canonicalNodeId, {
      status: 'active',
      generatedLessonId: lesson.id,
    });
    completeJob(db, begin.job.id, lesson.id);
    recordAuditEvent(db, {
      actor: 'api',
      action: 'generation.roadmap_node_lesson.created',
      entityType: 'generated_lesson',
      entityId: lesson.id,
      metadata: {
        jobId: begin.job.id,
        roadmapId: input.roadmapId,
        nodeId: canonicalNodeId,
        model: provider.model,
        qualityScore: lessonJson.generationMetadata?.qualityScore,
      },
    });
    return { lesson: getGeneratedLesson(db, lesson.id), reused: false };
  } catch (err) {
    patchLessonNode(db, input.roadmapId, canonicalNodeId, { status: 'error' });
    failJob(db, begin.job.id, err);
    throw safeGenerationError(err);
  }
}

export async function pregenerateRoadmapLessons(
  db: Db,
  input: { roadmapId: string; fromNodeId?: string; count?: number },
) {
  const roadmap = getRoadmap(db, input.roadmapId);
  const flat = roadmap.units.flatMap((unit) => unit.lessons);
  const start = input.fromNodeId
    ? Math.max(
        0,
        flat.findIndex((node) => {
          const canonical = resolveRoadmapNodeId(db, input.roadmapId, input.fromNodeId!);
          return canonical ? node.id === canonical : false;
        }) + 1,
      )
    : 0;
  const limit = Math.min(5, Math.max(0, input.count ?? 2));
  const generated: string[] = [];
  const reused: string[] = [];
  const skipped: string[] = [];
  const failed: Array<{ nodeId: string; errorCode: string }> = [];

  for (const node of flat.slice(start)) {
    if (generated.length + reused.length >= limit) break;
    if (node.status === 'completed' || node.status === 'generating' || node.generatedLessonId) {
      skipped.push(node.id);
      continue;
    }
    try {
      const result = await generateRoadmapNodeLesson(db, {
        roadmapId: input.roadmapId,
        nodeId: node.id,
      });
      if (result.reused) reused.push(node.id);
      else generated.push(node.id);
    } catch (err) {
      const apiErr = safeGenerationError(err);
      if (apiErr.code === 'NODE_LOCKED') break;
      failed.push({ nodeId: node.id, errorCode: apiErr.code ?? 'GENERATION_FAILED' });
    }
  }

  return { generated, reused, skipped, failed };
}

const TUTOR_SYSTEM = `You are a warm, sharp personal tutor inside a microlearning app.
Be concise (2-5 sentences). Plain text only — no markdown. You may use "• " bullet lines.
Ground answers in the learner's current card context when provided.`;

export async function tutorReply(
  db: Db,
  input: { messages: Array<{ role: 'user' | 'assistant'; content: string }>; context?: string },
): Promise<string> {
  if (input.messages.length === 0) {
    throw new ApiError(400, 'At least one message is required.', 'INVALID_INPUT');
  }
  const provider = createAiGenerationProvider();
  const system = input.context
    ? `${TUTOR_SYSTEM}\n\nThe learner is currently studying:\n"""\n${input.context.slice(0, 4000)}\n"""`
    : TUTOR_SYSTEM;
  const reply = await provider.requestText(system, input.messages, 800);
  recordAuditEvent(db, {
    actor: 'api',
    action: 'generation.tutor.reply',
    entityType: 'generated_lesson',
    metadata: { model: provider.model, turns: input.messages.length },
  });
  return reply.trim();
}

export function repairStaleGenerationJobs(db: Db): number {
  const cutoff = new Date(Date.now() - STALE_JOB_MS).toISOString();
  const failed = db
    .prepare(
      `UPDATE generation_jobs
       SET status = 'failed', error_code = 'GENERATION_ABANDONED', error_message = 'Generation was interrupted and can be retried.', updated_at = ?
       WHERE status = 'in_progress' AND updated_at < ?`,
    )
    .run(now(), cutoff).changes;
  db.prepare("UPDATE lesson_nodes SET status = 'error', updated_at = ? WHERE status = 'generating'").run(now());
  return failed;
}
