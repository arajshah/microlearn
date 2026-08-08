import { randomUUID } from 'node:crypto';
import type { Db } from '../db';
import { ToolError } from '../mcp/repoSafety';
import {
  serializeGeneratedLesson,
  serializeRoadmap,
  serializeRoadmapSummary,
  type GeneratedLessonRow,
  type LessonNodeRow,
  type RoadmapRow,
  type RoadmapSummaryCountRow,
  type UnitRow,
} from '../api/serializers';
import {
  serializeBlueprint,
  serializeOutcome,
  type BlueprintRow,
  type OutcomeRow,
} from './curriculumSerialization';
import {
  createContentVersion,
  getContentVersionById,
  getContentVersionsForEntity,
  serializeContentVersion,
} from './curriculumVersions';
import { validateCurriculum, type ValidationResult } from './curriculumValidation';

type RoadmapStatus = 'draft' | 'published' | 'archived' | 'deleted';

function now(): string {
  return new Date().toISOString();
}

function notFound(message: string): ToolError {
  return new ToolError('NOT_FOUND', message);
}

function loadRoadmapRow(db: Db, id: string): RoadmapRow | undefined {
  return db.prepare('SELECT * FROM roadmaps WHERE id = ?').get(id) as RoadmapRow | undefined;
}

function loadUnits(db: Db, roadmapId: string): UnitRow[] {
  return db
    .prepare('SELECT * FROM roadmap_units WHERE roadmap_id = ? ORDER BY unit_order ASC')
    .all(roadmapId) as UnitRow[];
}

function loadNodes(db: Db, roadmapId: string): LessonNodeRow[] {
  return db
    .prepare('SELECT * FROM lesson_nodes WHERE roadmap_id = ? ORDER BY node_order ASC')
    .all(roadmapId) as LessonNodeRow[];
}

/** Serializes a roadmap row into the nested (units + lesson nodes) API shape. */
function buildNested(db: Db, roadmap: RoadmapRow) {
  const units = loadUnits(db, roadmap.id);
  const nodes = loadNodes(db, roadmap.id);
  return serializeRoadmap(
    roadmap,
    units.map((unit) => ({ unit, nodes: nodes.filter((n) => n.unit_id === unit.id) })),
  );
}

type NestedRoadmap = ReturnType<typeof buildNested>;

function generatedLessonIdSet(db: Db, roadmapId: string): Set<string> {
  const rows = db
    .prepare('SELECT id FROM generated_lessons WHERE roadmap_id = ?')
    .all(roadmapId) as Array<{ id: string }>;
  return new Set(rows.map((r) => r.id));
}

function validateNested(db: Db, nested: NestedRoadmap): ValidationResult {
  return validateCurriculum(
    {
      title: nested.title,
      topic: nested.topic,
      goal: nested.goal,
      units: nested.units.map((u) => ({
        id: u.id,
        title: u.title,
        order: u.order,
        lessons: u.lessons.map((l) => ({
          id: l.id,
          unitId: l.unitId,
          title: l.title,
          learningObjective: l.learningObjective,
          estimatedMinutes: l.estimatedMinutes,
          difficulty: l.difficulty,
          order: l.order,
          prerequisiteIds: l.prerequisiteIds,
          keyIdeas: l.keyIdeas,
          status: l.status,
          generatedLessonId: l.generatedLessonId,
        })),
      })),
    },
    generatedLessonIdSet(db, nested.id),
  );
}

/** Throws if the roadmap is missing, deleted, or published (not directly editable). */
function requireEditableRow(db: Db, roadmapId: string): RoadmapRow {
  const row = loadRoadmapRow(db, roadmapId);
  if (!row || row.status === 'deleted') throw notFound(`Roadmap "${roadmapId}" not found.`);
  if (row.status === 'published') {
    throw new ToolError(
      'ROADMAP_NOT_EDITABLE',
      'Published roadmaps cannot be edited directly. Archive it first or publish a new version.',
    );
  }
  return row;
}

function requireRow(db: Db, roadmapId: string, allowDeleted = false): RoadmapRow {
  const row = loadRoadmapRow(db, roadmapId);
  if (!row || (!allowDeleted && row.status === 'deleted')) {
    throw notFound(`Roadmap "${roadmapId}" not found.`);
  }
  return row;
}

function snapshotRoadmap(db: Db, roadmapId: string, changeSummary: string): NestedRoadmap {
  const row = loadRoadmapRow(db, roadmapId) as RoadmapRow;
  const nested = buildNested(db, row);
  createContentVersion(db, {
    entityType: 'roadmap',
    entityId: roadmapId,
    state: row.status,
    snapshot: nested,
    changeSummary,
  });
  return nested;
}

function touchRoadmap(db: Db, roadmapId: string): void {
  db.prepare('UPDATE roadmaps SET updated_at = ? WHERE id = ?').run(now(), roadmapId);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface ListRoadmapsOptions {
  status?: RoadmapStatus | 'all';
  includeCounts?: boolean;
}

export function listRoadmaps(db: Db, options: ListRoadmapsOptions = {}) {
  const { status } = options;
  const where =
    status === 'all'
      ? ''
      : status
        ? 'WHERE roadmaps.status = ?'
        : "WHERE roadmaps.status NOT IN ('archived', 'deleted')";
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
    .all(...(status && status !== 'all' ? [status] : [])) as Array<
    RoadmapRow & RoadmapSummaryCountRow
  >;
  return rows.map((row) => serializeRoadmapSummary(row, row));
}

export interface GetRoadmapOptions {
  includeBlueprints?: boolean;
  includeLessons?: boolean;
  includeOutcomes?: boolean;
  includeVersions?: boolean;
  allowDeleted?: boolean;
}

export function getRoadmapDetailed(db: Db, roadmapId: string, options: GetRoadmapOptions = {}) {
  const row = requireRow(db, roadmapId, options.allowDeleted);
  const nested = buildNested(db, row);
  const result: Record<string, unknown> = { ...nested };

  if (options.includeBlueprints) {
    const rows = db
      .prepare('SELECT * FROM lesson_blueprints WHERE roadmap_id = ? ORDER BY version DESC')
      .all(roadmapId) as BlueprintRow[];
    result.blueprints = rows.map(serializeBlueprint);
  }
  if (options.includeLessons) {
    const rows = db
      .prepare('SELECT * FROM generated_lessons WHERE roadmap_id = ? ORDER BY updated_at DESC')
      .all(roadmapId) as GeneratedLessonRow[];
    result.lessons = rows.map(serializeGeneratedLesson);
  }
  if (options.includeOutcomes) {
    const rows = db
      .prepare('SELECT * FROM lesson_outcomes WHERE roadmap_id = ? ORDER BY created_at DESC')
      .all(roadmapId) as OutcomeRow[];
    result.outcomes = rows.map(serializeOutcome);
  }
  if (options.includeVersions) {
    result.versions = getContentVersionsForEntity(db, 'roadmap', roadmapId, 50).map(serializeContentVersion);
  }
  return result;
}

export function validateRoadmap(db: Db, roadmapId: string): ValidationResult {
  const row = requireRow(db, roadmapId);
  return validateNested(db, buildNested(db, row));
}

export interface ReadOutcomesOptions {
  roadmapId?: string;
  lessonNodeId?: string;
  limit?: number;
}

export function readLearningOutcomes(db: Db, options: ReadOutcomesOptions = {}) {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 200);
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (options.roadmapId) {
    clauses.push('roadmap_id = ?');
    params.push(options.roadmapId);
  }
  if (options.lessonNodeId) {
    clauses.push('lesson_node_id = ?');
    params.push(options.lessonNodeId);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db
    .prepare(`SELECT * FROM lesson_outcomes ${where} ORDER BY created_at DESC LIMIT ?`)
    .all(...params, limit) as OutcomeRow[];
  return { count: rows.length, outcomes: rows.map(serializeOutcome) };
}

// ---------------------------------------------------------------------------
// Roadmap-level mutations
// ---------------------------------------------------------------------------

export interface CreateRoadmapInput {
  title: string;
  topic: string;
  goal: string;
  description: string;
  masteryLevel: number;
  depth: 'quick' | 'standard' | 'deep';
  estimatedTotalMinutes?: number;
  units: Array<{
    id?: string;
    title: string;
    description: string;
    order: number;
    lessons: Array<{
      id?: string;
      title: string;
      shortDescription: string;
      learningObjective: string;
      estimatedMinutes: number;
      difficulty: number;
      order: number;
      prerequisiteIds?: string[];
      keyIdeas: string[];
    }>;
  }>;
  changeSummary?: string;
}

export function createRoadmap(db: Db, input: CreateRoadmapInput) {
  const tx = db.transaction(() => {
    const ts = now();
    const roadmapId = randomUUID();
    const lessonMinutes = input.units.flatMap((u) => u.lessons.map((l) => l.estimatedMinutes || 0));
    const estimated =
      input.estimatedTotalMinutes ?? lessonMinutes.reduce((sum, m) => sum + m, 0);

    db.prepare(
      `INSERT INTO roadmaps
        (id, title, topic, goal, description, mastery_level, depth, status, estimated_total_minutes, created_at, updated_at, published_at, version)
       VALUES (@id,@title,@topic,@goal,@description,@masteryLevel,@depth,'draft',@estimated,@ts,@ts,NULL,1)`,
    ).run({
      id: roadmapId,
      title: input.title,
      topic: input.topic,
      goal: input.goal,
      description: input.description,
      masteryLevel: input.masteryLevel,
      depth: input.depth,
      estimated,
      ts,
    });

    const sortedUnits = [...input.units].sort((a, b) => a.order - b.order);
    sortedUnits.forEach((unit, unitIdx) => {
      const unitId = unit.id ?? randomUUID();
      db.prepare(
        `INSERT INTO roadmap_units (id, roadmap_id, title, description, unit_order, created_at, updated_at)
         VALUES (@id,@roadmapId,@title,@description,@order,@ts,@ts)`,
      ).run({ id: unitId, roadmapId, title: unit.title, description: unit.description, order: unitIdx, ts });

      const sortedLessons = [...unit.lessons].sort((a, b) => a.order - b.order);
      sortedLessons.forEach((lesson, lessonIdx) => {
        const prereqs = lesson.prerequisiteIds ?? [];
        const status = prereqs.length === 0 ? 'available' : 'locked';
        db.prepare(
          `INSERT INTO lesson_nodes
            (id, roadmap_id, unit_id, title, short_description, learning_objective, estimated_minutes, difficulty, node_order, prerequisite_ids_json, key_ideas_json, status, generated_lesson_id, created_at, updated_at)
           VALUES (@id,@roadmapId,@unitId,@title,@shortDescription,@learningObjective,@estimatedMinutes,@difficulty,@order,@prereqs,@keyIdeas,@status,NULL,@ts,@ts)`,
        ).run({
          id: lesson.id ?? randomUUID(),
          roadmapId,
          unitId,
          title: lesson.title,
          shortDescription: lesson.shortDescription,
          learningObjective: lesson.learningObjective,
          estimatedMinutes: lesson.estimatedMinutes,
          difficulty: lesson.difficulty,
          order: lessonIdx,
          prereqs: JSON.stringify(prereqs),
          keyIdeas: JSON.stringify(lesson.keyIdeas),
          status,
          ts,
        });
      });
    });

    const nested = buildNested(db, loadRoadmapRow(db, roadmapId) as RoadmapRow);
    const validation = validateNested(db, nested);
    if (!validation.ok) {
      throw new ToolError('VALIDATION_FAILED', `Roadmap failed validation: ${summarizeErrors(validation)}`);
    }
    createContentVersion(db, {
      entityType: 'roadmap',
      entityId: roadmapId,
      state: 'draft',
      snapshot: nested,
      changeSummary: input.changeSummary ?? 'Created draft roadmap',
    });
    return nested;
  });
  return tx();
}

export interface UpdateRoadmapPatch {
  title?: string;
  topic?: string;
  goal?: string;
  description?: string;
  masteryLevel?: number;
  depth?: 'quick' | 'standard' | 'deep';
  estimatedTotalMinutes?: number;
  status?: 'draft' | 'published' | 'archived';
}

const ROADMAP_PATCH_COLUMNS: Record<keyof UpdateRoadmapPatch, string> = {
  title: 'title',
  topic: 'topic',
  goal: 'goal',
  description: 'description',
  masteryLevel: 'mastery_level',
  depth: 'depth',
  estimatedTotalMinutes: 'estimated_total_minutes',
  status: 'status',
};

export function updateRoadmap(db: Db, roadmapId: string, patch: UpdateRoadmapPatch, changeSummary: string) {
  const tx = db.transaction(() => {
    const existing = requireRow(db, roadmapId);

    const wantsPublish = patch.status === 'published';
    const metadataKeys = Object.keys(patch).filter((k) => k !== 'status');
    const onlyArchiving = patch.status === 'archived' && metadataKeys.length === 0;
    const completedCount = (db.prepare(
      "SELECT COUNT(*) AS count FROM lesson_nodes WHERE roadmap_id = ? AND status = 'completed'",
    ).get(roadmapId) as { count: number }).count;

    if (existing.status === 'published' && !onlyArchiving) {
      throw new ToolError(
        'ROADMAP_NOT_EDITABLE',
        'Published roadmaps cannot be edited directly (only archived). Use rollback or publish a new version.',
      );
    }
    if (completedCount > 0 && metadataKeys.length > 0) {
      throw new ToolError(
        'COMPLETED_CURRICULUM_IMMUTABLE',
        'Roadmap metadata with completed lessons is historical evidence and cannot be rewritten. Archive it or create a superseding roadmap instead.',
      );
    }

    if (wantsPublish) {
      const validation = validateNested(db, buildNested(db, existing));
      if (!validation.ok) {
        throw new ToolError('VALIDATION_FAILED', `Cannot publish: ${summarizeErrors(validation)}`);
      }
    }

    const sets: string[] = [];
    const params: Record<string, unknown> = { id: roadmapId };
    for (const [key, column] of Object.entries(ROADMAP_PATCH_COLUMNS)) {
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
    if (wantsPublish && !existing.published_at) {
      sets.push('published_at = @publishedAt');
      params.publishedAt = now();
    }

    db.prepare(`UPDATE roadmaps SET ${sets.join(', ')} WHERE id = @id`).run(params);
    return snapshotRoadmap(db, roadmapId, changeSummary);
  });
  return tx();
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

function renormalizeUnitOrder(db: Db, roadmapId: string): void {
  const units = loadUnits(db, roadmapId);
  units.forEach((unit, idx) => {
    if (unit.unit_order !== idx) {
      db.prepare('UPDATE roadmap_units SET unit_order = ?, updated_at = ? WHERE id = ?').run(idx, now(), unit.id);
    }
  });
}

export function createUnit(
  db: Db,
  input: { roadmapId: string; title: string; description: string; order?: number; changeSummary: string },
) {
  const tx = db.transaction(() => {
    requireEditableRow(db, input.roadmapId);
    const ts = now();
    const unitId = randomUUID();
    const count = (db.prepare('SELECT COUNT(*) AS c FROM roadmap_units WHERE roadmap_id = ?').get(input.roadmapId) as { c: number }).c;
    const order = input.order ?? count;
    db.prepare(
      `INSERT INTO roadmap_units (id, roadmap_id, title, description, unit_order, created_at, updated_at)
       VALUES (@id,@roadmapId,@title,@description,@order,@ts,@ts)`,
    ).run({ id: unitId, roadmapId: input.roadmapId, title: input.title, description: input.description, order, ts });
    renormalizeUnitOrder(db, input.roadmapId);
    touchRoadmap(db, input.roadmapId);
    return { unitId, roadmap: snapshotRoadmap(db, input.roadmapId, input.changeSummary) };
  });
  return tx();
}

export function updateUnit(
  db: Db,
  input: { roadmapId: string; unitId: string; patch: { title?: string; description?: string; order?: number }; changeSummary: string },
) {
  const tx = db.transaction(() => {
    requireEditableRow(db, input.roadmapId);
    const unit = db.prepare('SELECT * FROM roadmap_units WHERE id = ? AND roadmap_id = ?').get(input.unitId, input.roadmapId) as UnitRow | undefined;
    if (!unit) throw notFound(`Unit "${input.unitId}" not found in roadmap.`);

    const sets: string[] = [];
    const params: Record<string, unknown> = { id: input.unitId };
    if (input.patch.title !== undefined) { sets.push('title = @title'); params.title = input.patch.title; }
    if (input.patch.description !== undefined) { sets.push('description = @description'); params.description = input.patch.description; }
    if (input.patch.order !== undefined) { sets.push('unit_order = @order'); params.order = input.patch.order; }
    sets.push('updated_at = @updatedAt');
    params.updatedAt = now();
    db.prepare(`UPDATE roadmap_units SET ${sets.join(', ')} WHERE id = @id`).run(params);

    if (input.patch.order !== undefined) renormalizeUnitOrder(db, input.roadmapId);
    touchRoadmap(db, input.roadmapId);
    return snapshotRoadmap(db, input.roadmapId, input.changeSummary);
  });
  return tx();
}

export function deleteUnit(
  db: Db,
  input: { roadmapId: string; unitId: string; changeSummary: string },
) {
  const tx = db.transaction(() => {
    requireEditableRow(db, input.roadmapId);
    const unit = db.prepare('SELECT * FROM roadmap_units WHERE id = ? AND roadmap_id = ?').get(input.unitId, input.roadmapId) as UnitRow | undefined;
    if (!unit) throw notFound(`Unit "${input.unitId}" not found in roadmap.`);
    const nodeCount = (db.prepare('SELECT COUNT(*) AS c FROM lesson_nodes WHERE unit_id = ?').get(input.unitId) as { c: number }).c;
    if (nodeCount > 0) throw new ToolError('UNIT_NOT_EMPTY', `Unit has ${nodeCount} lesson node(s); remove them first.`);

    db.prepare('DELETE FROM roadmap_units WHERE id = ?').run(input.unitId);
    renormalizeUnitOrder(db, input.roadmapId);
    touchRoadmap(db, input.roadmapId);
    return { deletedUnitId: input.unitId, roadmap: snapshotRoadmap(db, input.roadmapId, input.changeSummary) };
  });
  return tx();
}

// ---------------------------------------------------------------------------
// Lesson nodes
// ---------------------------------------------------------------------------

function renormalizeNodeOrder(db: Db, roadmapId: string): void {
  const nodes = loadNodes(db, roadmapId);
  nodes.forEach((node, idx) => {
    if (node.node_order !== idx) {
      db.prepare('UPDATE lesson_nodes SET node_order = ?, updated_at = ? WHERE id = ?').run(idx, now(), node.id);
    }
  });
}

/** Recalculates locked/available status for non-completed nodes based on prerequisite completion. */
function recalcNodeStatuses(db: Db, roadmapId: string): void {
  const nodes = loadNodes(db, roadmapId);
  const statusById = new Map(nodes.map((n) => [n.id, n.status]));
  for (const node of nodes) {
    if (node.status !== 'locked' && node.status !== 'available') continue;
    const prereqs = safeParseArray(node.prerequisite_ids_json);
    const unlocked = prereqs.every((p) => statusById.get(p) === 'completed');
    const next = unlocked ? 'available' : 'locked';
    if (next !== node.status) {
      db.prepare('UPDATE lesson_nodes SET status = ?, updated_at = ? WHERE id = ?').run(next, now(), node.id);
    }
  }
}

function safeParseArray(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function assertLessonNodeHasNoLearningHistory(db: Db, node: LessonNodeRow): void {
  const row = db.prepare(
    `SELECT
       (SELECT COUNT(*) FROM progress_events
        WHERE lesson_node_id = @nodeId
           OR lesson_id IN (SELECT id FROM generated_lessons WHERE lesson_node_id = @nodeId))
       + (SELECT COUNT(*) FROM lesson_outcomes WHERE lesson_node_id = @nodeId)
       + (SELECT COUNT(*) FROM learning_events
          WHERE lesson_node_id = @nodeId
             OR lesson_id IN (SELECT id FROM generated_lessons WHERE lesson_node_id = @nodeId))
       + (SELECT COUNT(*) FROM retrieval_items
          WHERE lesson_node_id = @nodeId
             OR lesson_id IN (SELECT id FROM generated_lessons WHERE lesson_node_id = @nodeId))
       + (SELECT COUNT(*) FROM review_sets
          WHERE lesson_node_id = @nodeId
             OR lesson_id IN (SELECT id FROM generated_lessons WHERE lesson_node_id = @nodeId))
       + (SELECT COUNT(*) FROM lesson_concepts WHERE lesson_node_id = @nodeId)
         AS evidenceCount`,
  ).get({ nodeId: node.id }) as { evidenceCount: number };

  if (node.status === 'completed' || row.evidenceCount > 0) {
    throw new ToolError(
      'LESSON_HISTORY_PRESERVED',
      'This lesson has learner progress or historical evidence and cannot be destructively changed. Archive its roadmap or create a superseding future lesson instead.',
    );
  }
}

export function createLessonNode(
  db: Db,
  input: {
    roadmapId: string;
    unitId: string;
    title: string;
    shortDescription: string;
    learningObjective: string;
    estimatedMinutes: number;
    difficulty: number;
    order?: number;
    prerequisiteIds?: string[];
    keyIdeas: string[];
    changeSummary: string;
  },
) {
  const tx = db.transaction(() => {
    requireEditableRow(db, input.roadmapId);
    const unit = db.prepare('SELECT * FROM roadmap_units WHERE id = ? AND roadmap_id = ?').get(input.unitId, input.roadmapId) as UnitRow | undefined;
    if (!unit) throw notFound(`Unit "${input.unitId}" not found in roadmap.`);

    const existingIds = new Set(loadNodes(db, input.roadmapId).map((n) => n.id));
    const prereqs = input.prerequisiteIds ?? [];
    for (const p of prereqs) {
      if (!existingIds.has(p)) throw new ToolError('INVALID_INPUT', `Prerequisite "${p}" does not exist in roadmap.`);
    }

    const ts = now();
    const nodeId = randomUUID();
    const count = (db.prepare('SELECT COUNT(*) AS c FROM lesson_nodes WHERE roadmap_id = ?').get(input.roadmapId) as { c: number }).c;
    const order = input.order ?? count;
    const status = prereqs.length === 0 ? 'available' : 'locked';

    db.prepare(
      `INSERT INTO lesson_nodes
        (id, roadmap_id, unit_id, title, short_description, learning_objective, estimated_minutes, difficulty, node_order, prerequisite_ids_json, key_ideas_json, status, generated_lesson_id, created_at, updated_at)
       VALUES (@id,@roadmapId,@unitId,@title,@shortDescription,@learningObjective,@estimatedMinutes,@difficulty,@order,@prereqs,@keyIdeas,@status,NULL,@ts,@ts)`,
    ).run({
      id: nodeId,
      roadmapId: input.roadmapId,
      unitId: input.unitId,
      title: input.title,
      shortDescription: input.shortDescription,
      learningObjective: input.learningObjective,
      estimatedMinutes: input.estimatedMinutes,
      difficulty: input.difficulty,
      order,
      prereqs: JSON.stringify(prereqs),
      keyIdeas: JSON.stringify(input.keyIdeas),
      status,
      ts,
    });

    renormalizeNodeOrder(db, input.roadmapId);
    recalcNodeStatuses(db, input.roadmapId);
    touchRoadmap(db, input.roadmapId);
    return { lessonNodeId: nodeId, roadmap: snapshotRoadmap(db, input.roadmapId, input.changeSummary) };
  });
  return tx();
}

export interface UpdateLessonNodePatch {
  unitId?: string;
  title?: string;
  shortDescription?: string;
  learningObjective?: string;
  estimatedMinutes?: number;
  difficulty?: number;
  order?: number;
  prerequisiteIds?: string[];
  keyIdeas?: string[];
  status?: 'locked' | 'available' | 'active' | 'completed' | 'generating' | 'error';
  generatedLessonId?: string | null;
}

export function updateLessonNode(
  db: Db,
  input: { roadmapId: string; lessonNodeId: string; patch: UpdateLessonNodePatch; changeSummary: string },
) {
  const tx = db.transaction(() => {
    requireEditableRow(db, input.roadmapId);
    const node = db.prepare('SELECT * FROM lesson_nodes WHERE id = ? AND roadmap_id = ?').get(input.lessonNodeId, input.roadmapId) as LessonNodeRow | undefined;
    if (!node) throw notFound(`Lesson node "${input.lessonNodeId}" not found in roadmap.`);
    if (node.status === 'completed') {
      const isCompletedNoop = Object.keys(input.patch).length === 1 && input.patch.status === 'completed';
      if (!isCompletedNoop) {
        throw new ToolError(
          'COMPLETED_LESSON_IMMUTABLE',
          'Completed lesson nodes are historical evidence and cannot be rewritten. Create a superseding future lesson instead.',
        );
      }
    }

    const allNodes = loadNodes(db, input.roadmapId);
    const idSet = new Set(allNodes.map((n) => n.id));

    if (input.patch.unitId !== undefined) {
      const unit = db.prepare('SELECT id FROM roadmap_units WHERE id = ? AND roadmap_id = ?').get(input.patch.unitId, input.roadmapId);
      if (!unit) throw notFound(`Unit "${input.patch.unitId}" not found in roadmap.`);
    }

    if (input.patch.prerequisiteIds !== undefined) {
      const prereqs = input.patch.prerequisiteIds;
      for (const p of prereqs) {
        if (p === input.lessonNodeId) throw new ToolError('INVALID_INPUT', 'A lesson cannot be its own prerequisite.');
        if (!idSet.has(p)) throw new ToolError('INVALID_INPUT', `Prerequisite "${p}" does not exist in roadmap.`);
      }
      // Reject introducing a cycle or forward dependency using a candidate validation.
      const candidate = buildCandidateWithPrereqs(allNodes, input.lessonNodeId, prereqs);
      const cycleOrForward = validateCurriculum(candidate).errors.filter(
        (e) => (e.code === 'PREREQ_CYCLE' || e.code === 'FORWARD_PREREQ') && e.entityId === input.lessonNodeId,
      );
      if (cycleOrForward.length > 0) {
        throw new ToolError('INVALID_INPUT', cycleOrForward.map((e) => e.message).join(' '));
      }
    }

    const sets: string[] = [];
    const params: Record<string, unknown> = { id: input.lessonNodeId };
    const p = input.patch;
    if (p.unitId !== undefined) { sets.push('unit_id = @unitId'); params.unitId = p.unitId; }
    if (p.title !== undefined) { sets.push('title = @title'); params.title = p.title; }
    if (p.shortDescription !== undefined) { sets.push('short_description = @shortDescription'); params.shortDescription = p.shortDescription; }
    if (p.learningObjective !== undefined) { sets.push('learning_objective = @learningObjective'); params.learningObjective = p.learningObjective; }
    if (p.estimatedMinutes !== undefined) { sets.push('estimated_minutes = @estimatedMinutes'); params.estimatedMinutes = p.estimatedMinutes; }
    if (p.difficulty !== undefined) { sets.push('difficulty = @difficulty'); params.difficulty = p.difficulty; }
    if (p.order !== undefined) { sets.push('node_order = @order'); params.order = p.order; }
    if (p.prerequisiteIds !== undefined) { sets.push('prerequisite_ids_json = @prereqs'); params.prereqs = JSON.stringify(p.prerequisiteIds); }
    if (p.keyIdeas !== undefined) { sets.push('key_ideas_json = @keyIdeas'); params.keyIdeas = JSON.stringify(p.keyIdeas); }
    if (p.status !== undefined) { sets.push('status = @status'); params.status = p.status; }
    if (p.generatedLessonId !== undefined) { sets.push('generated_lesson_id = @genId'); params.genId = p.generatedLessonId; }
    sets.push('updated_at = @updatedAt');
    params.updatedAt = now();

    db.prepare(`UPDATE lesson_nodes SET ${sets.join(', ')} WHERE id = @id`).run(params);

    if (p.order !== undefined) renormalizeNodeOrder(db, input.roadmapId);
    if (p.prerequisiteIds !== undefined) recalcNodeStatuses(db, input.roadmapId);
    touchRoadmap(db, input.roadmapId);
    return snapshotRoadmap(db, input.roadmapId, input.changeSummary);
  });
  return tx();
}

function buildCandidateWithPrereqs(nodes: LessonNodeRow[], nodeId: string, prereqs: string[]) {
  const byUnit = new Map<string, LessonNodeRow[]>();
  for (const n of nodes) {
    if (!byUnit.has(n.unit_id)) byUnit.set(n.unit_id, []);
    byUnit.get(n.unit_id)!.push(n);
  }
  return {
    title: 'x',
    topic: 'x',
    goal: 'x',
    units: [...byUnit.entries()].map(([unitId, unitNodes], idx) => ({
      id: unitId,
      title: 'u',
      order: idx,
      lessons: unitNodes.map((n) => ({
        id: n.id,
        unitId: n.unit_id,
        title: n.title,
        learningObjective: n.learning_objective,
        estimatedMinutes: n.estimated_minutes,
        difficulty: n.difficulty,
        order: n.node_order,
        prerequisiteIds: n.id === nodeId ? prereqs : safeParseArray(n.prerequisite_ids_json),
        keyIdeas: safeParseArray(n.key_ideas_json),
        status: n.status,
      })),
    })),
  };
}

export function deleteLessonNode(
  db: Db,
  input: { roadmapId: string; lessonNodeId: string; changeSummary: string },
) {
  const tx = db.transaction(() => {
    requireEditableRow(db, input.roadmapId);
    const node = db.prepare('SELECT * FROM lesson_nodes WHERE id = ? AND roadmap_id = ?').get(input.lessonNodeId, input.roadmapId) as LessonNodeRow | undefined;
    if (!node) throw notFound(`Lesson node "${input.lessonNodeId}" not found in roadmap.`);
    assertLessonNodeHasNoLearningHistory(db, node);

    const dependents = loadNodes(db, input.roadmapId).filter((n) =>
      safeParseArray(n.prerequisite_ids_json).includes(input.lessonNodeId),
    );
    if (dependents.length > 0) {
      throw new ToolError(
        'LESSON_HAS_DEPENDENTS',
        `Lesson node has ${dependents.length} dependent(s). Update their prerequisites first.`,
      );
    }

    db.prepare('DELETE FROM lesson_nodes WHERE id = ?').run(input.lessonNodeId);
    renormalizeNodeOrder(db, input.roadmapId);
    recalcNodeStatuses(db, input.roadmapId);
    touchRoadmap(db, input.roadmapId);
    return { deletedLessonNodeId: input.lessonNodeId, roadmap: snapshotRoadmap(db, input.roadmapId, input.changeSummary) };
  });
  return tx();
}

export function reorderLessonNodes(
  db: Db,
  input: { roadmapId: string; unitId?: string; orderedLessonNodeIds: string[]; changeSummary: string },
) {
  const tx = db.transaction(() => {
    requireEditableRow(db, input.roadmapId);
    const nodes = loadNodes(db, input.roadmapId);
    const idSet = new Set(nodes.map((n) => n.id));
    for (const id of input.orderedLessonNodeIds) {
      if (!idSet.has(id)) throw new ToolError('INVALID_INPUT', `Lesson node "${id}" is not in this roadmap.`);
    }

    let targetNodes: LessonNodeRow[];
    if (input.unitId) {
      const unitNodes = nodes.filter((n) => n.unit_id === input.unitId);
      const unitIds = new Set(unitNodes.map((n) => n.id));
      if (input.orderedLessonNodeIds.length !== unitNodes.length || !input.orderedLessonNodeIds.every((id) => unitIds.has(id))) {
        throw new ToolError('INVALID_INPUT', 'orderedLessonNodeIds must contain exactly the ids of the given unit.');
      }
      targetNodes = unitNodes;
    } else {
      if (input.orderedLessonNodeIds.length !== nodes.length) {
        throw new ToolError('INVALID_INPUT', 'orderedLessonNodeIds must contain exactly all roadmap lesson node ids.');
      }
      targetNodes = nodes;
    }

    // Apply the requested order. For unit-scoped reorder, keep other units' relative order.
    const newOrderIndex = new Map<string, number>();
    if (input.unitId) {
      // Rebuild a global order: nodes not in unit keep position, unit nodes take requested order.
      const remaining = nodes.filter((n) => n.unit_id !== input.unitId);
      const ordered = [...remaining, ...input.orderedLessonNodeIds.map((id) => nodes.find((n) => n.id === id)!)]
        .sort((a, b) => a.node_order - b.node_order);
      // Simpler deterministic approach: unit nodes replace their own slots in original order.
      void ordered;
      const unitPositions = targetNodes.map((n) => n.node_order).sort((a, b) => a - b);
      input.orderedLessonNodeIds.forEach((id, i) => newOrderIndex.set(id, unitPositions[i]));
      nodes.filter((n) => n.unit_id !== input.unitId).forEach((n) => newOrderIndex.set(n.id, n.node_order));
    } else {
      input.orderedLessonNodeIds.forEach((id, i) => newOrderIndex.set(id, i));
    }

    for (const node of nodes) {
      if (node.status === 'completed' && newOrderIndex.get(node.id) !== node.node_order) {
        throw new ToolError(
          'COMPLETED_LESSON_IMMUTABLE',
          'Reordering cannot move completed lesson nodes. Reorder only the remaining future curriculum.',
        );
      }
    }

    for (const [id, order] of newOrderIndex) {
      db.prepare('UPDATE lesson_nodes SET node_order = ?, updated_at = ? WHERE id = ?').run(order, now(), id);
    }
    renormalizeNodeOrder(db, input.roadmapId);

    const nested = buildNested(db, loadRoadmapRow(db, input.roadmapId) as RoadmapRow);
    const validation = validateNested(db, nested);
    const orderIssues = validation.errors.filter((e) => e.code === 'FORWARD_PREREQ' || e.code === 'PREREQ_CYCLE');
    if (orderIssues.length > 0) {
      throw new ToolError('INVALID_INPUT', `Reorder violates prerequisites: ${orderIssues.map((e) => e.message).join(' ')}`);
    }

    touchRoadmap(db, input.roadmapId);
    createContentVersion(db, { entityType: 'roadmap', entityId: input.roadmapId, state: 'draft', snapshot: nested, changeSummary: input.changeSummary });
    return nested;
  });
  return tx();
}

// ---------------------------------------------------------------------------
// Blueprints
// ---------------------------------------------------------------------------

const BLUEPRINT_REQUIRED = ['title', 'primaryObjective', 'keyIdeas', 'estimatedMinutes'];

function assertBlueprintShape(blueprint: Record<string, unknown>): void {
  const missing = BLUEPRINT_REQUIRED.filter((k) => blueprint[k] === undefined || blueprint[k] === null);
  if (missing.length > 0) {
    throw new ToolError('INVALID_INPUT', `Blueprint is missing required field(s): ${missing.join(', ')}.`);
  }
}

export function createLessonBlueprint(
  db: Db,
  input: { roadmapId: string; lessonNodeId: string; blueprint: Record<string, unknown>; changeSummary: string },
) {
  const tx = db.transaction(() => {
    requireRow(db, input.roadmapId);
    const node = db.prepare('SELECT * FROM lesson_nodes WHERE id = ? AND roadmap_id = ?').get(input.lessonNodeId, input.roadmapId) as LessonNodeRow | undefined;
    if (!node) throw notFound(`Lesson node "${input.lessonNodeId}" not found in roadmap.`);
    assertLessonNodeHasNoLearningHistory(db, node);
    assertBlueprintShape(input.blueprint);

    const ts = now();
    const blueprintId = randomUUID();
    const maxVersion = (db.prepare('SELECT MAX(version) AS v FROM lesson_blueprints WHERE lesson_node_id = ?').get(input.lessonNodeId) as { v: number | null }).v ?? 0;
    const version = maxVersion + 1;
    db.prepare(
      `INSERT INTO lesson_blueprints (id, roadmap_id, lesson_node_id, version, blueprint_json, created_at, updated_at)
       VALUES (@id,@roadmapId,@lessonNodeId,@version,@blueprint,@ts,@ts)`,
    ).run({ id: blueprintId, roadmapId: input.roadmapId, lessonNodeId: input.lessonNodeId, version, blueprint: JSON.stringify(input.blueprint), ts });

    createContentVersion(db, {
      entityType: 'lesson_blueprint',
      entityId: blueprintId,
      state: 'draft',
      snapshot: { roadmapId: input.roadmapId, lessonNodeId: input.lessonNodeId, version, blueprint: input.blueprint },
      changeSummary: input.changeSummary,
    });
    const row = db.prepare('SELECT * FROM lesson_blueprints WHERE id = ?').get(blueprintId) as BlueprintRow;
    return serializeBlueprint(row);
  });
  return tx();
}

export function updateLessonBlueprint(
  db: Db,
  input: { blueprintId: string; blueprint: Record<string, unknown>; changeSummary: string },
) {
  const tx = db.transaction(() => {
    const existing = db.prepare('SELECT * FROM lesson_blueprints WHERE id = ?').get(input.blueprintId) as BlueprintRow | undefined;
    if (!existing) throw notFound(`Blueprint "${input.blueprintId}" not found.`);
    const node = db.prepare('SELECT * FROM lesson_nodes WHERE id = ?').get(existing.lesson_node_id) as LessonNodeRow | undefined;
    if (node) assertLessonNodeHasNoLearningHistory(db, node);
    assertBlueprintShape(input.blueprint);

    // Versioned insert (new row) rather than destructive overwrite.
    const ts = now();
    const newId = randomUUID();
    const maxVersion = (db.prepare('SELECT MAX(version) AS v FROM lesson_blueprints WHERE lesson_node_id = ?').get(existing.lesson_node_id) as { v: number | null }).v ?? 0;
    const version = maxVersion + 1;
    db.prepare(
      `INSERT INTO lesson_blueprints (id, roadmap_id, lesson_node_id, version, blueprint_json, created_at, updated_at)
       VALUES (@id,@roadmapId,@lessonNodeId,@version,@blueprint,@ts,@ts)`,
    ).run({ id: newId, roadmapId: existing.roadmap_id, lessonNodeId: existing.lesson_node_id, version, blueprint: JSON.stringify(input.blueprint), ts });

    createContentVersion(db, {
      entityType: 'lesson_blueprint',
      entityId: newId,
      state: 'draft',
      snapshot: { roadmapId: existing.roadmap_id, lessonNodeId: existing.lesson_node_id, version, blueprint: input.blueprint, supersedes: existing.id },
      changeSummary: input.changeSummary,
    });
    const row = db.prepare('SELECT * FROM lesson_blueprints WHERE id = ?').get(newId) as BlueprintRow;
    return serializeBlueprint(row);
  });
  return tx();
}

// ---------------------------------------------------------------------------
// Generated lessons
// ---------------------------------------------------------------------------

function assertLessonShape(lesson: Record<string, unknown>): void {
  if (!lesson || typeof lesson !== 'object' || Object.keys(lesson).length === 0) {
    throw new ToolError('INVALID_INPUT', 'Lesson object must be a non-empty object.');
  }
  const hasTitleOrObjective = typeof lesson.title === 'string' || typeof lesson.objective === 'string' || typeof lesson.learningObjective === 'string';
  if (!hasTitleOrObjective) {
    throw new ToolError('INVALID_INPUT', 'Lesson must include a title or objective.');
  }
  const contentArray = lesson.cards ?? lesson.content ?? lesson.sections;
  if (!Array.isArray(contentArray)) {
    throw new ToolError('INVALID_INPUT', 'Lesson must include a content array (e.g. "cards").');
  }
}

export function createLesson(
  db: Db,
  input: {
    roadmapId: string;
    lessonNodeId: string;
    blueprintId?: string;
    lesson: Record<string, unknown>;
    model?: string;
    promptVersion?: string;
    changeSummary: string;
  },
) {
  const tx = db.transaction(() => {
    requireRow(db, input.roadmapId);
    const node = db.prepare('SELECT * FROM lesson_nodes WHERE id = ? AND roadmap_id = ?').get(input.lessonNodeId, input.roadmapId) as LessonNodeRow | undefined;
    if (!node) throw notFound(`Lesson node "${input.lessonNodeId}" not found in roadmap.`);
    assertLessonNodeHasNoLearningHistory(db, node);
    assertLessonShape(input.lesson);

    const ts = now();
    const lessonId = randomUUID();
    const maxVersion = (db.prepare('SELECT MAX(version) AS v FROM generated_lessons WHERE lesson_node_id = ?').get(input.lessonNodeId) as { v: number | null }).v ?? 0;
    const version = maxVersion + 1;
    db.prepare(
      `INSERT INTO generated_lessons (id, roadmap_id, lesson_node_id, blueprint_id, version, lesson_json, model, prompt_version, created_at, updated_at)
       VALUES (@id,@roadmapId,@lessonNodeId,@blueprintId,@version,@lessonJson,@model,@promptVersion,@ts,@ts)`,
    ).run({
      id: lessonId,
      roadmapId: input.roadmapId,
      lessonNodeId: input.lessonNodeId,
      blueprintId: input.blueprintId ?? null,
      version,
      lessonJson: JSON.stringify(input.lesson),
      model: input.model ?? null,
      promptVersion: input.promptVersion ?? null,
      ts,
    });
    db.prepare('UPDATE lesson_nodes SET generated_lesson_id = ?, updated_at = ? WHERE id = ?').run(lessonId, ts, input.lessonNodeId);

    createContentVersion(db, {
      entityType: 'generated_lesson',
      entityId: lessonId,
      state: 'saved',
      snapshot: { roadmapId: input.roadmapId, lessonNodeId: input.lessonNodeId, version, model: input.model, promptVersion: input.promptVersion },
      changeSummary: input.changeSummary,
    });
    const row = db.prepare('SELECT * FROM generated_lessons WHERE id = ?').get(lessonId) as GeneratedLessonRow;
    return serializeGeneratedLesson(row);
  });
  return tx();
}

export function updateLesson(
  db: Db,
  input: { lessonId: string; lesson: Record<string, unknown>; model?: string; promptVersion?: string; changeSummary: string },
) {
  const tx = db.transaction(() => {
    const existing = db.prepare('SELECT * FROM generated_lessons WHERE id = ?').get(input.lessonId) as GeneratedLessonRow | undefined;
    if (!existing) throw notFound(`Generated lesson "${input.lessonId}" not found.`);
    if (existing.lesson_node_id) {
      const node = db.prepare('SELECT * FROM lesson_nodes WHERE id = ?').get(existing.lesson_node_id) as LessonNodeRow | undefined;
      if (node) assertLessonNodeHasNoLearningHistory(db, node);
    }
    assertLessonShape(input.lesson);

    const ts = now();
    const newId = randomUUID();
    const maxVersion = (db.prepare('SELECT MAX(version) AS v FROM generated_lessons WHERE lesson_node_id = ?').get(existing.lesson_node_id) as { v: number | null }).v ?? 0;
    const version = maxVersion + 1;
    db.prepare(
      `INSERT INTO generated_lessons (id, roadmap_id, lesson_node_id, blueprint_id, version, lesson_json, model, prompt_version, created_at, updated_at)
       VALUES (@id,@roadmapId,@lessonNodeId,@blueprintId,@version,@lessonJson,@model,@promptVersion,@ts,@ts)`,
    ).run({
      id: newId,
      roadmapId: existing.roadmap_id,
      lessonNodeId: existing.lesson_node_id,
      blueprintId: existing.blueprint_id,
      version,
      lessonJson: JSON.stringify(input.lesson),
      model: input.model ?? existing.model,
      promptVersion: input.promptVersion ?? existing.prompt_version,
      ts,
    });
    db.prepare('UPDATE lesson_nodes SET generated_lesson_id = ?, updated_at = ? WHERE id = ?').run(newId, ts, existing.lesson_node_id);

    createContentVersion(db, {
      entityType: 'generated_lesson',
      entityId: newId,
      state: 'saved',
      snapshot: { roadmapId: existing.roadmap_id, lessonNodeId: existing.lesson_node_id, version, supersedes: existing.id },
      changeSummary: input.changeSummary,
    });
    const row = db.prepare('SELECT * FROM generated_lessons WHERE id = ?').get(newId) as GeneratedLessonRow;
    return serializeGeneratedLesson(row);
  });
  return tx();
}

// ---------------------------------------------------------------------------
// Publish / rollback
// ---------------------------------------------------------------------------

export function publishVersion(db: Db, roadmapId: string, changeSummary: string) {
  const tx = db.transaction(() => {
    const existing = requireRow(db, roadmapId);
    const validation = validateNested(db, buildNested(db, existing));
    if (!validation.ok) {
      throw new ToolError('VALIDATION_FAILED', `Cannot publish: ${summarizeErrors(validation)}`);
    }
    const nextVersion = existing.version + 1;
    db.prepare('UPDATE roadmaps SET status = ?, published_at = ?, version = ?, updated_at = ? WHERE id = ?').run(
      'published',
      existing.published_at ?? now(),
      nextVersion,
      now(),
      roadmapId,
    );
    const nested = snapshotRoadmap(db, roadmapId, `Published: ${changeSummary}`);
    return { roadmap: serializeRoadmapSummary(loadRoadmapRow(db, roadmapId) as RoadmapRow), validation, snapshotUnits: nested.units.length };
  });
  return tx();
}

export function rollbackVersion(db: Db, roadmapId: string, versionId: string, changeSummary: string) {
  const tx = db.transaction(() => {
    const existing = requireRow(db, roadmapId, true);
    const version = getContentVersionById(db, versionId);
    if (!version) throw notFound(`Content version "${versionId}" not found.`);
    if (version.entity_type !== 'roadmap' || version.entity_id !== roadmapId) {
      throw new ToolError(
        'ROLLBACK_UNSUPPORTED_SCOPE',
        'Rollback currently supports roadmap-level snapshots for the same roadmap only.',
      );
    }

    const snapshot = JSON.parse(version.snapshot_json) as NestedRoadmap;

    // Safety snapshot of the current state before overwriting.
    createContentVersion(db, {
      entityType: 'roadmap',
      entityId: roadmapId,
      state: existing.status,
      snapshot: buildNested(db, existing),
      changeSummary: `Pre-rollback snapshot (before restoring version ${version.version})`,
    });

    const ts = now();
    const restoredStatus: RoadmapStatus = snapshot.status === 'deleted' ? existing.status as RoadmapStatus : (snapshot.status as RoadmapStatus);
    db.prepare(
      `UPDATE roadmaps SET title=@title, topic=@topic, goal=@goal, description=@description, mastery_level=@mastery,
         depth=@depth, estimated_total_minutes=@estimated, status=@status, published_at=@publishedAt, version=@version, updated_at=@ts WHERE id=@id`,
    ).run({
      id: roadmapId,
      title: snapshot.title,
      topic: snapshot.topic,
      goal: snapshot.goal,
      description: snapshot.description,
      mastery: snapshot.masteryLevel,
      depth: snapshot.depth,
      estimated: snapshot.estimatedTotalMinutes,
      status: restoredStatus,
      publishedAt: snapshot.publishedAt ?? null,
      version: existing.version + 1,
      ts,
    });

    // Diff-based restore of units (UPDATE existing, INSERT new, DELETE removed).
    const snapUnitIds = new Set(snapshot.units.map((u) => u.id));
    const currentUnits = loadUnits(db, roadmapId);
    for (const cur of currentUnits) {
      if (!snapUnitIds.has(cur.id)) db.prepare('DELETE FROM roadmap_units WHERE id = ?').run(cur.id);
    }
    const currentUnitIds = new Set(loadUnits(db, roadmapId).map((u) => u.id));
    snapshot.units.forEach((u, idx) => {
      if (currentUnitIds.has(u.id)) {
        db.prepare('UPDATE roadmap_units SET title=?, description=?, unit_order=?, updated_at=? WHERE id=?').run(u.title, u.description, idx, ts, u.id);
      } else {
        db.prepare('INSERT INTO roadmap_units (id, roadmap_id, title, description, unit_order, created_at, updated_at) VALUES (?,?,?,?,?,?,?)').run(u.id, roadmapId, u.title, u.description, idx, ts, ts);
      }
    });

    // Diff-based restore of lesson nodes.
    const snapNodes = snapshot.units.flatMap((u) => u.lessons);
    const snapNodeIds = new Set(snapNodes.map((n) => n.id));
    for (const cur of loadNodes(db, roadmapId)) {
      if (!snapNodeIds.has(cur.id)) db.prepare('DELETE FROM lesson_nodes WHERE id = ?').run(cur.id);
    }
    const currentNodeIds = new Set(loadNodes(db, roadmapId).map((n) => n.id));
    snapNodes.forEach((n, idx) => {
      const common = {
        unitId: n.unitId,
        title: n.title,
        shortDescription: n.shortDescription,
        learningObjective: n.learningObjective,
        estimatedMinutes: n.estimatedMinutes,
        difficulty: n.difficulty,
        order: idx,
        prereqs: JSON.stringify(n.prerequisiteIds ?? []),
        keyIdeas: JSON.stringify(n.keyIdeas ?? []),
        status: n.status,
        genId: n.generatedLessonId ?? null,
        id: n.id,
      };
      if (currentNodeIds.has(n.id)) {
        db.prepare(
          `UPDATE lesson_nodes SET unit_id=@unitId, title=@title, short_description=@shortDescription, learning_objective=@learningObjective,
             estimated_minutes=@estimatedMinutes, difficulty=@difficulty, node_order=@order, prerequisite_ids_json=@prereqs,
             key_ideas_json=@keyIdeas, status=@status, generated_lesson_id=@genId, updated_at=@ts WHERE id=@id`,
        ).run({ ...common, ts });
      } else {
        db.prepare(
          `INSERT INTO lesson_nodes (id, roadmap_id, unit_id, title, short_description, learning_objective, estimated_minutes, difficulty, node_order, prerequisite_ids_json, key_ideas_json, status, generated_lesson_id, created_at, updated_at)
           VALUES (@id,@roadmapId,@unitId,@title,@shortDescription,@learningObjective,@estimatedMinutes,@difficulty,@order,@prereqs,@keyIdeas,@status,@genId,@ts,@ts)`,
        ).run({ ...common, roadmapId, ts });
      }
    });

    renormalizeUnitOrder(db, roadmapId);
    renormalizeNodeOrder(db, roadmapId);

    const nested = buildNested(db, loadRoadmapRow(db, roadmapId) as RoadmapRow);
    createContentVersion(db, {
      entityType: 'roadmap',
      entityId: roadmapId,
      state: restoredStatus,
      snapshot: nested,
      changeSummary: `Rolled back to version ${version.version}: ${changeSummary}`,
    });
    return nested;
  });
  return tx();
}

function summarizeErrors(validation: ValidationResult): string {
  return validation.errors.map((e) => `[${e.code}] ${e.message}`).join('; ') || 'unknown error';
}
