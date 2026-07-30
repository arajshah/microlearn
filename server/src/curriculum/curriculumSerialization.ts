export interface BlueprintRow {
  id: string;
  roadmap_id: string;
  lesson_node_id: string;
  version: number;
  blueprint_json: string;
  created_at: string;
  updated_at: string;
}

export interface OutcomeRow {
  id: string;
  roadmap_id: string;
  lesson_node_id: string;
  lesson_id: string | null;
  outcome_json: string;
  completed_at: string | null;
  created_at: string;
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function serializeBlueprint(row: BlueprintRow) {
  return {
    id: row.id,
    roadmapId: row.roadmap_id,
    lessonNodeId: row.lesson_node_id,
    version: row.version,
    blueprint: parseJson(row.blueprint_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializeOutcome(row: OutcomeRow) {
  return {
    id: row.id,
    roadmapId: row.roadmap_id,
    lessonNodeId: row.lesson_node_id,
    lessonId: row.lesson_id ?? undefined,
    outcome: parseJson(row.outcome_json),
    completedAt: row.completed_at ?? undefined,
    createdAt: row.created_at,
  };
}
