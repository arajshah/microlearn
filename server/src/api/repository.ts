import { randomUUID } from 'node:crypto';
import type { Db } from '../db';
import { notFound, badRequest } from './apiError';
import { resolveRoadmapNodeId } from '../roadmaps/nodeIdResolver';
import {
  serializeGeneratedLesson,
  serializeRoadmap,
  serializeRoadmapSummary,
  type GeneratedLessonRow,
  type LessonNodeRow,
  type RoadmapRow,
  type RoadmapSummaryCountRow,
  type UnitRow,
} from './serializers';
import type { LessonPatchInput, LessonUpsertInput, RoadmapCreateInput, RoadmapNodePatchInput, RoadmapPatchInput, RoadmapStatus } from './validators';

function now(): string {
  return new Date().toISOString();
}

function recordContentVersion(
  db: Db,
  entityType: string,
  entityId: string,
  version: number,
  state: string,
  snapshot: unknown,
  changeSummary: string,
): void {
  db.prepare(
    `INSERT INTO content_versions (id, entity_type, entity_id, version, state, snapshot_json, change_summary, created_at)
     VALUES (@id, @entityType, @entityId, @version, @state, @snapshot, @changeSummary, @createdAt)`,
  ).run({
    id: randomUUID(),
    entityType,
    entityId,
    version,
    state,
    snapshot: JSON.stringify(snapshot),
    changeSummary,
    createdAt: now(),
  });
}

function loadRoadmapRow(db: Db, id: string): RoadmapRow | undefined {
  return db.prepare('SELECT * FROM roadmaps WHERE id = ?').get(id) as RoadmapRow | undefined;
}

function loadNested(db: Db, roadmap: RoadmapRow) {
  const units = db
    .prepare('SELECT * FROM roadmap_units WHERE roadmap_id = ? ORDER BY unit_order ASC')
    .all(roadmap.id) as UnitRow[];
  const nodes = db
    .prepare('SELECT * FROM lesson_nodes WHERE roadmap_id = ? ORDER BY node_order ASC')
    .all(roadmap.id) as LessonNodeRow[];

  return serializeRoadmap(
    roadmap,
    units.map((unit) => ({ unit, nodes: nodes.filter((n) => n.unit_id === unit.id) })),
  );
}

/** Returns a fully nested roadmap or throws 404. */
export function getRoadmap(db: Db, id: string) {
  const row = loadRoadmapRow(db, id);
  if (!row) throw notFound(`Roadmap "${id}" not found.`);
  return loadNested(db, row);
}

/** Lists roadmap summaries, optionally filtered by status. */
export function listRoadmaps(db: Db, status?: RoadmapStatus) {
  const where = status ? 'WHERE roadmaps.status = ?' : "WHERE roadmaps.status NOT IN ('archived', 'deleted')";
  const rows = db
    .prepare(
      `SELECT roadmaps.*,
         COUNT(DISTINCT roadmap_units.id) AS unit_count,
         COUNT(lesson_nodes.id) AS lesson_count,
         COALESCE(SUM(CASE WHEN lesson_nodes.status = 'completed' THEN 1 ELSE 0 END), 0)
           AS completed_lesson_count
       FROM roadmaps
       LEFT JOIN roadmap_units ON roadmap_units.roadmap_id = roadmaps.id
       LEFT JOIN lesson_nodes ON lesson_nodes.roadmap_id = roadmaps.id
         AND lesson_nodes.unit_id = roadmap_units.id
       ${where}
       GROUP BY roadmaps.id
       ORDER BY roadmaps.updated_at DESC`,
    )
    .all(...(status ? [status] : [])) as Array<RoadmapRow & RoadmapSummaryCountRow>;
  return rows.map((row) => serializeRoadmapSummary(row, row));
}

/** Creates a roadmap with nested units and lesson nodes in a single transaction. */
export function createRoadmap(db: Db, input: RoadmapCreateInput) {
  if (input.id) {
    const existing = loadRoadmapRow(db, input.id);
    if (existing) {
      if (existing.status === 'deleted') {
        throw badRequest(`Roadmap "${input.id}" was deleted. Create a new roadmap instead.`, 'ROADMAP_DELETED');
      }
      return loadNested(db, existing);
    }
  }

  const ts = now();
  const roadmapId = input.id ?? randomUUID();

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO roadmaps
        (id, title, topic, goal, description, mastery_level, depth, status, estimated_total_minutes, created_at, updated_at, published_at, version)
       VALUES (@id, @title, @topic, @goal, @description, @masteryLevel, @depth, @status, @estimated, @createdAt, @updatedAt, @publishedAt, 1)`,
    ).run({
      id: roadmapId,
      title: input.title,
      topic: input.topic,
      goal: input.goal,
      description: input.description ?? '',
      masteryLevel: input.masteryLevel ?? 3,
      depth: input.depth ?? 'standard',
      status: input.status ?? 'draft',
      estimated: input.estimatedTotalMinutes ?? 0,
      createdAt: ts,
      updatedAt: ts,
      publishedAt: input.status === 'published' ? ts : null,
    });

    input.units.forEach((unit, unitIdx) => {
      const unitId = unit.id ?? randomUUID();
      db.prepare(
        `INSERT INTO roadmap_units (id, roadmap_id, title, description, unit_order, created_at, updated_at)
         VALUES (@id, @roadmapId, @title, @description, @order, @createdAt, @updatedAt)`,
      ).run({
        id: unitId,
        roadmapId,
        title: unit.title,
        description: unit.description ?? '',
        order: unit.order ?? unitIdx,
        createdAt: ts,
        updatedAt: ts,
      });

      unit.lessons.forEach((node, nodeIdx) => {
        db.prepare(
          `INSERT INTO lesson_nodes
            (id, roadmap_id, unit_id, title, short_description, learning_objective, estimated_minutes, difficulty, node_order, prerequisite_ids_json, key_ideas_json, status, generated_lesson_id, created_at, updated_at)
           VALUES (@id, @roadmapId, @unitId, @title, @shortDescription, @learningObjective, @estimatedMinutes, @difficulty, @order, @prereqs, @keyIdeas, @status, @generatedLessonId, @createdAt, @updatedAt)`,
        ).run({
          id: node.id ?? randomUUID(),
          roadmapId,
          unitId,
          title: node.title,
          shortDescription: node.shortDescription ?? '',
          learningObjective: node.learningObjective ?? '',
          estimatedMinutes: node.estimatedMinutes ?? 0,
          difficulty: node.difficulty ?? 1,
          order: node.order ?? nodeIdx,
          prereqs: JSON.stringify(node.prerequisiteIds ?? []),
          keyIdeas: JSON.stringify(node.keyIdeas ?? []),
          status: node.status ?? 'locked',
          generatedLessonId: node.generatedLessonId ?? null,
          createdAt: ts,
          updatedAt: ts,
        });
      });
    });

    const nested = loadNested(db, loadRoadmapRow(db, roadmapId) as RoadmapRow);
    recordContentVersion(db, 'roadmap', roadmapId, 1, input.status ?? 'draft', nested, 'Created roadmap');
    return nested;
  });

  return tx();
}

const PATCH_COLUMNS: Record<keyof RoadmapPatchInput, string> = {
  title: 'title',
  topic: 'topic',
  goal: 'goal',
  description: 'description',
  masteryLevel: 'mastery_level',
  depth: 'depth',
  status: 'status',
  estimatedTotalMinutes: 'estimated_total_minutes',
  publishedAt: 'published_at',
};

/** Updates roadmap metadata/status via a fixed column whitelist and snapshots the result. */
export function patchRoadmap(db: Db, id: string, patch: RoadmapPatchInput) {
  const tx = db.transaction(() => {
    const existing = loadRoadmapRow(db, id);
    if (!existing) throw notFound(`Roadmap "${id}" not found.`);

    const sets: string[] = [];
    const params: Record<string, unknown> = { id };
    for (const [key, column] of Object.entries(PATCH_COLUMNS)) {
      const value = (patch as Record<string, unknown>)[key];
      if (value !== undefined) {
        sets.push(`${column} = @${key}`);
        params[key] = value;
      }
    }

    const nextVersion = existing.version + 1;
    sets.push('version = @version');
    params.version = nextVersion;
    sets.push('updated_at = @updatedAt');
    params.updatedAt = now();
    if (patch.status === 'published' && !existing.published_at) {
      sets.push('published_at = @autoPublishedAt');
      params.autoPublishedAt = now();
    }

    db.prepare(`UPDATE roadmaps SET ${sets.join(', ')} WHERE id = @id`).run(params);

    const nested = loadNested(db, loadRoadmapRow(db, id) as RoadmapRow);
    recordContentVersion(db, 'roadmap', id, nextVersion, patch.status ?? existing.status, nested, 'Updated roadmap');
    return nested;
  });

  return tx();
}

/** Soft-deletes a roadmap (status = deleted) and snapshots the change. */
export function softDeleteRoadmap(db: Db, id: string) {
  const tx = db.transaction(() => {
    const existing = loadRoadmapRow(db, id);
    if (!existing) throw notFound(`Roadmap "${id}" not found.`);

    const nextVersion = existing.version + 1;
    db.prepare('UPDATE roadmaps SET status = ?, version = ?, updated_at = ? WHERE id = ?').run(
      'deleted',
      nextVersion,
      now(),
      id,
    );
    recordContentVersion(db, 'roadmap', id, nextVersion, 'deleted', { id, status: 'deleted' }, 'Soft-deleted roadmap');
    return { id, status: 'deleted' as const };
  });

  return tx();
}

const NODE_PATCH_COLUMNS: Record<keyof RoadmapNodePatchInput, string> = {
  status: 'status',
  generatedLessonId: 'generated_lesson_id',
};

/** Updates a lesson node within a roadmap (status, generated lesson link). */
export function patchLessonNode(
  db: Db,
  roadmapId: string,
  nodeId: string,
  patch: RoadmapNodePatchInput,
) {
  const tx = db.transaction(() => {
    const roadmap = loadRoadmapRow(db, roadmapId);
    if (!roadmap) throw notFound(`Roadmap "${roadmapId}" not found.`);
    if (roadmap.status === 'deleted') throw notFound(`Roadmap "${roadmapId}" was deleted.`);

    const canonicalNodeId = resolveRoadmapNodeId(db, roadmapId, nodeId);
    if (!canonicalNodeId) throw notFound(`Lesson node "${nodeId}" not found in roadmap.`);

    const node = db
      .prepare('SELECT * FROM lesson_nodes WHERE id = ? AND roadmap_id = ?')
      .get(canonicalNodeId, roadmapId) as LessonNodeRow | undefined;
    if (!node) throw notFound(`Lesson node "${nodeId}" not found in roadmap.`);

    const sets: string[] = [];
    const params: Record<string, unknown> = { nodeId: canonicalNodeId, roadmapId };
    for (const [key, column] of Object.entries(NODE_PATCH_COLUMNS)) {
      const value = (patch as Record<string, unknown>)[key];
      if (value !== undefined) {
        sets.push(`${column} = @${key}`);
        params[key] = value;
      }
    }
    if (sets.length === 0) throw badRequest('At least one node field is required.');

    sets.push('updated_at = @updatedAt');
    params.updatedAt = now();
    db.prepare(`UPDATE lesson_nodes SET ${sets.join(', ')} WHERE id = @nodeId AND roadmap_id = @roadmapId`).run(
      params,
    );

    db.prepare('UPDATE roadmaps SET updated_at = ? WHERE id = ?').run(now(), roadmapId);
    return loadNested(db, loadRoadmapRow(db, roadmapId) as RoadmapRow);
  });

  return tx();
}

function lessonTitleFromJson(lessonJson: Record<string, unknown>, fallback?: string): string {
  const title = typeof lessonJson.title === 'string' ? lessonJson.title.trim() : '';
  return title || fallback || 'Untitled lesson';
}

/** Lists active generated lessons (standalone and roadmap-linked). */
export function listGeneratedLessons(db: Db) {
  const rows = db
    .prepare("SELECT * FROM generated_lessons WHERE status = 'active' ORDER BY updated_at DESC")
    .all() as GeneratedLessonRow[];
  return rows.map(serializeGeneratedLesson);
}

/** Creates or updates a generated lesson and links it to its node when roadmap-linked. */
export function upsertGeneratedLesson(db: Db, input: LessonUpsertInput) {
  const tx = db.transaction(() => {
    const ts = now();
    const isRoadmapLinked = Boolean(input.roadmapId && input.lessonNodeId);
    let node: LessonNodeRow | undefined;

    if (isRoadmapLinked) {
      const roadmap = loadRoadmapRow(db, input.roadmapId!);
      if (!roadmap) throw notFound(`Roadmap "${input.roadmapId}" not found.`);
      const canonicalNodeId = resolveRoadmapNodeId(db, input.roadmapId!, input.lessonNodeId!);
      if (!canonicalNodeId) {
        throw notFound(`Lesson node "${input.lessonNodeId}" not found in roadmap.`);
      }
      node = db.prepare('SELECT * FROM lesson_nodes WHERE id = ? AND roadmap_id = ?').get(
        canonicalNodeId,
        input.roadmapId!,
      ) as LessonNodeRow | undefined;
      if (!node) throw notFound(`Lesson node "${input.lessonNodeId}" not found in roadmap.`);
      input = { ...input, lessonNodeId: canonicalNodeId };
    }

    const existing = input.id
      ? (db.prepare('SELECT * FROM generated_lessons WHERE id = ?').get(input.id) as GeneratedLessonRow | undefined)
      : isRoadmapLinked
        ? (db
            .prepare('SELECT * FROM generated_lessons WHERE lesson_node_id = ?')
            .get(input.lessonNodeId!) as GeneratedLessonRow | undefined)
        : undefined;

    const lessonId = input.id ?? existing?.id ?? randomUUID();
    const version = input.version ?? (existing ? existing.version + 1 : 1);
    const title = input.title ?? lessonTitleFromJson(input.lessonJson, existing?.title ?? undefined);

    db.prepare(
      `INSERT INTO generated_lessons
        (id, roadmap_id, lesson_node_id, blueprint_id, version, lesson_json, model, prompt_version, status, subject_id, topic, title, deleted_at, created_at, updated_at)
       VALUES (@id, @roadmapId, @lessonNodeId, @blueprintId, @version, @lessonJson, @model, @promptVersion, 'active', @subjectId, @topic, @title, NULL, @createdAt, @updatedAt)
       ON CONFLICT(id) DO UPDATE SET
        roadmap_id = @roadmapId,
        lesson_node_id = @lessonNodeId,
        blueprint_id = @blueprintId,
        version = @version,
        lesson_json = @lessonJson,
        model = @model,
        prompt_version = @promptVersion,
        status = 'active',
        subject_id = @subjectId,
        topic = @topic,
        title = @title,
        deleted_at = NULL,
        updated_at = @updatedAt`,
    ).run({
      id: lessonId,
      roadmapId: input.roadmapId ?? null,
      lessonNodeId: input.lessonNodeId ?? null,
      blueprintId: input.blueprintId ?? null,
      version,
      lessonJson: JSON.stringify(input.lessonJson),
      model: input.model ?? null,
      promptVersion: input.promptVersion ?? null,
      subjectId: input.subjectId ?? existing?.subject_id ?? null,
      topic: input.topic ?? existing?.topic ?? null,
      title,
      createdAt: existing?.created_at ?? ts,
      updatedAt: ts,
    });

    if (isRoadmapLinked && node) {
      db.prepare('UPDATE lesson_nodes SET generated_lesson_id = ?, updated_at = ? WHERE id = ?').run(
        lessonId,
        ts,
        input.lessonNodeId!,
      );
    }

    const row = db.prepare('SELECT * FROM generated_lessons WHERE id = ?').get(lessonId) as GeneratedLessonRow;
    recordContentVersion(db, 'generated_lesson', lessonId, version, 'saved', { id: lessonId, version }, 'Upserted generated lesson');
    return serializeGeneratedLesson(row);
  });

  return tx();
}

/** Patches lesson metadata/json. */
export function patchGeneratedLesson(db: Db, id: string, patch: LessonPatchInput) {
  const tx = db.transaction(() => {
    const existing = db.prepare('SELECT * FROM generated_lessons WHERE id = ?').get(id) as GeneratedLessonRow | undefined;
    if (!existing || existing.status === 'deleted') throw notFound(`Lesson "${id}" not found.`);

    const ts = now();
    const nextJson = patch.lessonJson ?? parseJsonObject(existing.lesson_json);
    const title = patch.title ?? existing.title ?? lessonTitleFromJson(nextJson as Record<string, unknown>);
    const version = existing.version + 1;

    db.prepare(
      `UPDATE generated_lessons SET
        lesson_json = @lessonJson,
        topic = COALESCE(@topic, topic),
        title = @title,
        subject_id = COALESCE(@subjectId, subject_id),
        model = COALESCE(@model, model),
        prompt_version = COALESCE(@promptVersion, prompt_version),
        status = COALESCE(@status, status),
        deleted_at = CASE WHEN @status = 'deleted' THEN @updatedAt ELSE deleted_at END,
        version = @version,
        updated_at = @updatedAt
       WHERE id = @id`,
    ).run({
      id,
      lessonJson: JSON.stringify(nextJson),
      topic: patch.topic ?? null,
      title,
      subjectId: patch.subjectId ?? null,
      model: patch.model ?? null,
      promptVersion: patch.promptVersion ?? null,
      status: patch.status ?? null,
      version,
      updatedAt: ts,
    });

    const row = db.prepare('SELECT * FROM generated_lessons WHERE id = ?').get(id) as GeneratedLessonRow;
    recordContentVersion(db, 'generated_lesson', id, version, row.status, { id, version }, 'Patched generated lesson');
    return serializeGeneratedLesson(row);
  });

  return tx();
}

/** Soft-deletes a generated lesson. */
export function softDeleteGeneratedLesson(db: Db, id: string) {
  const tx = db.transaction(() => {
    const existing = db.prepare('SELECT * FROM generated_lessons WHERE id = ?').get(id) as GeneratedLessonRow | undefined;
    if (!existing || existing.status === 'deleted') throw notFound(`Lesson "${id}" not found.`);

    const ts = now();
    const version = existing.version + 1;
    db.prepare(
      `UPDATE generated_lessons SET status = 'deleted', deleted_at = ?, version = ?, updated_at = ? WHERE id = ?`,
    ).run(ts, version, ts, id);

    if (existing.lesson_node_id) {
      db.prepare('UPDATE lesson_nodes SET generated_lesson_id = NULL, updated_at = ? WHERE id = ?').run(ts, existing.lesson_node_id);
    }

    recordContentVersion(db, 'generated_lesson', id, version, 'deleted', { id, status: 'deleted' }, 'Soft-deleted generated lesson');
    return { id, status: 'deleted' as const };
  });

  return tx();
}

function parseJsonObject(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** Returns a generated lesson by id or throws 404. */
export function getGeneratedLesson(db: Db, id: string) {
  const row = db.prepare('SELECT * FROM generated_lessons WHERE id = ?').get(id) as
    | GeneratedLessonRow
    | undefined;
  if (!row || row.status === 'deleted') throw notFound(`Lesson "${id}" not found.`);
  return serializeGeneratedLesson(row);
}

/** Lists generated lessons for a roadmap. */
export function listRoadmapLessons(db: Db, roadmapId: string) {
  const roadmap = loadRoadmapRow(db, roadmapId);
  if (!roadmap) throw notFound(`Roadmap "${roadmapId}" not found.`);
  const rows = db
    .prepare("SELECT * FROM generated_lessons WHERE roadmap_id = ? AND status = 'active' ORDER BY updated_at DESC")
    .all(roadmapId) as GeneratedLessonRow[];
  return rows.map(serializeGeneratedLesson);
}
