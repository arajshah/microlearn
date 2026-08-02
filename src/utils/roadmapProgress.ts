import {
  GeneratedRoadmap,
  RoadmapLessonNode,
  RoadmapNodeStatus,
} from '@/types/roadmap';
import { resolveRoadmapNodeId } from '@/utils/roadmapIds';

export function allRoadmapLessons(roadmap: GeneratedRoadmap): RoadmapLessonNode[] {
  const units = [...roadmap.units].sort((a, b) => a.order - b.order);
  const out: RoadmapLessonNode[] = [];
  for (const unit of units) {
    const lessons = [...unit.lessons].sort((a, b) => a.order - b.order);
    out.push(...lessons);
  }
  return out;
}

export function findRoadmapNode(
  roadmap: GeneratedRoadmap,
  nodeId: string,
): RoadmapLessonNode | undefined {
  const canonicalId = resolveRoadmapNodeId(roadmap, nodeId);
  if (!canonicalId) return undefined;
  for (const unit of roadmap.units) {
    const node = unit.lessons.find((l) => l.id === canonicalId);
    if (node) return node;
  }
  return undefined;
}

export function findRoadmapUnit(
  roadmap: GeneratedRoadmap,
  unitId: string,
) {
  return roadmap.units.find((u) => u.id === unitId);
}

export function roadmapStats(roadmap: GeneratedRoadmap) {
  const lessons = allRoadmapLessons(roadmap);
  const localCompleted = lessons.filter((l) => l.status === 'completed').length;
  const total = roadmap.serverSummary?.lessonCount ?? lessons.length;
  const completed = Math.min(
    total,
    Math.max(localCompleted, roadmap.serverSummary?.completedLessonCount ?? 0),
  );
  const remainingMinutes = lessons
    .filter((l) => l.status !== 'completed')
    .reduce((sum, l) => sum + l.estimatedMinutes, 0);
  return {
    completed,
    total,
    pct: total ? completed / total : 0,
    remainingMinutes,
  };
}

/** First active node, else first available incomplete, with status recalculation. */
export function continueNode(roadmap: GeneratedRoadmap): RoadmapLessonNode | undefined {
  const recalculated = recalculateRoadmapStatuses(roadmap);
  const lessons = allRoadmapLessons(recalculated);
  const byStatus = (status: RoadmapNodeStatus) => lessons.find((l) => l.status === status);
  return (
    byStatus('active') ??
    byStatus('available') ??
    byStatus('error') ??
    lessons.find(
      (l) =>
        l.status !== 'completed' &&
        l.status !== 'locked' &&
        l.status !== 'generating',
    )
  );
}

function prereqsMet(
  node: RoadmapLessonNode,
  completedIds: Set<string>,
  roadmap: GeneratedRoadmap,
): boolean {
  return node.prerequisiteIds.every((id) => {
    const canonical = resolveRoadmapNodeId(roadmap, id) ?? id;
    return completedIds.has(canonical);
  });
}

/**
 * Recompute locked / available / active from completion state.
 * Preserves generating and error unless explicitly overridden.
 */
export function recalculateRoadmapStatuses(
  roadmap: GeneratedRoadmap,
  opts?: { preserveGenerating?: boolean },
): GeneratedRoadmap {
  const preserve = opts?.preserveGenerating ?? true;
  const flat = allRoadmapLessons(roadmap);
  const completedIds = new Set(
    flat.filter((l) => l.status === 'completed').map((l) => l.id),
  );

  const nextFlat = flat.map((node) => {
    if (preserve && (node.status === 'generating' || node.status === 'error')) {
      return { ...node };
    }
    if (node.status === 'completed') return { ...node, status: 'completed' as const };

    const unlocked = prereqsMet(node, completedIds, roadmap);
    if (!unlocked) return { ...node, status: 'locked' as const };
    return { ...node, status: 'available' as const };
  });

  let activeAssigned = false;
  for (const node of nextFlat) {
    if (node.status === 'available' && !activeAssigned) {
      node.status = 'active';
      activeAssigned = true;
    }
  }

  const byId = new Map(nextFlat.map((n) => [n.id, n]));
  return {
    ...roadmap,
    units: roadmap.units.map((unit) => ({
      ...unit,
      lessons: unit.lessons.map((l) => byId.get(l.id) ?? l),
    })),
  };
}

export function markNodeCompleted(
  roadmap: GeneratedRoadmap,
  nodeId: string,
): GeneratedRoadmap {
  const canonicalId = resolveRoadmapNodeId(roadmap, nodeId) ?? nodeId;
  const updated: GeneratedRoadmap = {
    ...roadmap,
    units: roadmap.units.map((unit) => ({
      ...unit,
      lessons: unit.lessons.map((l) =>
        l.id === canonicalId ? { ...l, status: 'completed' as const } : l,
      ),
    })),
  };
  return recalculateRoadmapStatuses(updated);
}

export function setNodeStatus(
  roadmap: GeneratedRoadmap,
  nodeId: string,
  status: RoadmapNodeStatus,
  patch?: Partial<RoadmapLessonNode>,
): GeneratedRoadmap {
  const canonicalId = resolveRoadmapNodeId(roadmap, nodeId) ?? nodeId;
  return {
    ...roadmap,
    units: roadmap.units.map((unit) => ({
      ...unit,
      lessons: unit.lessons.map((l) =>
        l.id === canonicalId ? { ...l, ...patch, status } : l,
      ),
    })),
  };
}

export function lockedReason(
  roadmap: GeneratedRoadmap,
  node: RoadmapLessonNode,
): string {
  const flat = allRoadmapLessons(roadmap);
  const byId = new Map(flat.map((l) => [l.id, l]));
  const missing = node.prerequisiteIds.filter((id) => {
    const canonical = resolveRoadmapNodeId(roadmap, id) ?? id;
    return byId.get(canonical)?.status !== 'completed';
  });
  if (missing.length === 0) return 'Complete prior lessons to unlock.';
  const titles = missing
    .map((id) => {
      const canonical = resolveRoadmapNodeId(roadmap, id) ?? id;
      return byId.get(canonical)?.title ?? id;
    })
    .slice(0, 3)
    .join(', ');
  return `Complete first: ${titles}${missing.length > 3 ? '…' : ''}`;
}

export function buildLessonContext(
  roadmap: GeneratedRoadmap,
  nodeId: string,
): import('@/types/roadmap').RoadmapLessonContext | undefined {
  const flat = allRoadmapLessons(roadmap);
  const canonicalId = resolveRoadmapNodeId(roadmap, nodeId);
  if (!canonicalId) return undefined;
  const idx = flat.findIndex((l) => l.id === canonicalId);
  if (idx === -1) return undefined;
  const node = flat[idx];
  const unit = findRoadmapUnit(roadmap, node.unitId);
  if (!unit) return undefined;

  return {
    roadmapTitle: roadmap.title,
    goal: roadmap.goal,
    unitTitle: unit.title,
    unitDescription: unit.description,
    lessonTitle: node.title,
    learningObjective: node.learningObjective,
    keyIdeas: node.keyIdeas,
    masteryLevel: roadmap.masteryLevel,
    previousLessons: flat.slice(0, idx).map((l) => ({
      title: l.title,
      objective: l.learningObjective,
    })),
    nextLessons: flat.slice(idx + 1, idx + 3).map((l) => ({
      title: l.title,
      objective: l.learningObjective,
    })),
  };
}
