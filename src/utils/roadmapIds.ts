import { GeneratedRoadmap, RoadmapLessonNode, RoadmapUnit } from '@/types/roadmap';

function cleanSegment(value: string, fallback: string): string {
  const cleaned = value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

function makeScopedId(
  roadmapId: string,
  rawId: string,
  fallback: string,
  used: Set<string>,
): string {
  const prefix = `${roadmapId}-`;
  const base = rawId.startsWith(prefix)
    ? cleanSegment(rawId, `${prefix}${fallback}`)
    : `${prefix}${cleanSegment(rawId, fallback)}`;

  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function hasUnscopedEntityIds(roadmap: GeneratedRoadmap): boolean {
  const prefix = `${roadmap.id}-`;
  for (const unit of roadmap.units) {
    if (!unit.id.startsWith(prefix)) return true;
    for (const node of unit.lessons) {
      if (!node.id.startsWith(prefix)) return true;
      if (node.unitId !== unit.id) return true;
      if (node.prerequisiteIds.some((id) => id && !id.startsWith(prefix))) return true;
    }
  }
  return false;
}

/**
 * The backend uses globally unique primary keys for roadmap units and lesson nodes.
 * AI-generated roadmaps often use local ids like u1/l1, so scope them by roadmap id
 * before they touch cache, pending sync, or SQLite. Prerequisite references are
 * rewritten to the same scoped ids.
 */
export function normalizeRoadmapEntityIds(roadmap: GeneratedRoadmap): GeneratedRoadmap {
  if (!hasUnscopedEntityIds(roadmap)) return roadmap;

  const usedUnitIds = new Set<string>();
  const usedNodeIds = new Set<string>();
  const unitIdByOld = new Map<string, string>();
  const nodeIdByOld = new Map<string, string>();

  roadmap.units.forEach((unit, unitIndex) => {
    unitIdByOld.set(
      unit.id,
      makeScopedId(roadmap.id, unit.id, `u${unitIndex + 1}`, usedUnitIds),
    );
  });

  let globalNodeIndex = 0;
  roadmap.units.forEach((unit) => {
    unit.lessons.forEach((node) => {
      globalNodeIndex += 1;
      const nextNodeId = makeScopedId(
        roadmap.id,
        node.id,
        `l${globalNodeIndex}`,
        usedNodeIds,
      );
      if (!nodeIdByOld.has(node.id)) nodeIdByOld.set(node.id, nextNodeId);
    });
  });

  const units: RoadmapUnit[] = roadmap.units.map((unit) => {
    const unitId = unitIdByOld.get(unit.id) ?? unit.id;
    const lessons: RoadmapLessonNode[] = unit.lessons.map((node) => ({
      ...node,
      id: nodeIdByOld.get(node.id) ?? node.id,
      unitId,
      prerequisiteIds: node.prerequisiteIds.map((id) => nodeIdByOld.get(id) ?? id),
    }));
    return { ...unit, id: unitId, lessons };
  });

  return { ...roadmap, units };
}

export function normalizeRoadmapEntityIdsList(roadmaps: GeneratedRoadmap[]): GeneratedRoadmap[] {
  return roadmaps.map(normalizeRoadmapEntityIds);
}
