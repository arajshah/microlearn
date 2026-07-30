/** Raw DB row shapes (snake_case) and their serialized API forms (camelCase). */

export interface RoadmapRow {
  id: string;
  title: string;
  topic: string;
  goal: string;
  description: string;
  mastery_level: number;
  depth: string;
  status: string;
  estimated_total_minutes: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  version: number;
}

export interface UnitRow {
  id: string;
  roadmap_id: string;
  title: string;
  description: string;
  unit_order: number;
  created_at: string;
  updated_at: string;
}

export interface LessonNodeRow {
  id: string;
  roadmap_id: string;
  unit_id: string;
  title: string;
  short_description: string;
  learning_objective: string;
  estimated_minutes: number;
  difficulty: number;
  node_order: number;
  prerequisite_ids_json: string;
  key_ideas_json: string;
  status: string;
  generated_lesson_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface GeneratedLessonRow {
  id: string;
  roadmap_id: string | null;
  lesson_node_id: string | null;
  blueprint_id: string | null;
  version: number;
  lesson_json: string;
  model: string | null;
  prompt_version: string | null;
  status: string;
  subject_id: string | null;
  topic: string | null;
  title: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

function parseJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function parseJsonObject(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function serializeLessonNode(row: LessonNodeRow) {
  return {
    id: row.id,
    roadmapId: row.roadmap_id,
    unitId: row.unit_id,
    title: row.title,
    shortDescription: row.short_description,
    learningObjective: row.learning_objective,
    estimatedMinutes: row.estimated_minutes,
    difficulty: row.difficulty,
    order: row.node_order,
    prerequisiteIds: parseJsonArray(row.prerequisite_ids_json),
    keyIdeas: parseJsonArray(row.key_ideas_json),
    status: row.status,
    generatedLessonId: row.generated_lesson_id ?? undefined,
  };
}

export function serializeUnit(row: UnitRow, nodes: LessonNodeRow[]) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    order: row.unit_order,
    lessons: nodes.map(serializeLessonNode),
  };
}

export function serializeRoadmap(
  row: RoadmapRow,
  units: Array<{ unit: UnitRow; nodes: LessonNodeRow[] }>,
) {
  return {
    id: row.id,
    title: row.title,
    topic: row.topic,
    goal: row.goal,
    description: row.description,
    masteryLevel: row.mastery_level,
    depth: row.depth,
    status: row.status,
    estimatedTotalMinutes: row.estimated_total_minutes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at ?? undefined,
    version: row.version,
    units: units.map(({ unit, nodes }) => serializeUnit(unit, nodes)),
  };
}

export function serializeRoadmapSummary(row: RoadmapRow) {
  return {
    id: row.id,
    title: row.title,
    topic: row.topic,
    goal: row.goal,
    description: row.description,
    masteryLevel: row.mastery_level,
    depth: row.depth,
    status: row.status,
    estimatedTotalMinutes: row.estimated_total_minutes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at ?? undefined,
    version: row.version,
  };
}

export function serializeGeneratedLesson(row: GeneratedLessonRow) {
  const lesson = parseJsonObject(row.lesson_json);
  return {
    id: row.id,
    roadmapId: row.roadmap_id ?? undefined,
    lessonNodeId: row.lesson_node_id ?? undefined,
    blueprintId: row.blueprint_id ?? undefined,
    version: row.version,
    lesson,
    model: row.model ?? undefined,
    promptVersion: row.prompt_version ?? undefined,
    status: row.status,
    subjectId: row.subject_id ?? undefined,
    topic: row.topic ?? undefined,
    title: row.title ?? undefined,
    deletedAt: row.deleted_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
