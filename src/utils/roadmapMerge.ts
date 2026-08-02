import { GeneratedRoadmap, RoadmapSummary } from '@/types/roadmap';
import { GeneratedLesson } from '@/types/content';
import { findRoadmapNode, recalculateRoadmapStatuses } from '@/utils/roadmapProgress';
import { buildRoadmapNodeAliasMap } from '@/utils/roadmapIds';

export function mergeRoadmapPreservingLocalProgress(
  local: GeneratedRoadmap,
  remote: GeneratedRoadmap,
): GeneratedRoadmap {
  const aliasMap = buildRoadmapNodeAliasMap(local);
  const merged: GeneratedRoadmap = {
    ...remote,
    units: remote.units.map((unit) => ({
      ...unit,
      lessons: unit.lessons.map((remoteNode) => {
        const localNode = aliasMap.get(remoteNode.id) ?? findRoadmapNode(local, remoteNode.id);
        if (!localNode) return remoteNode;

        const nextNode = { ...remoteNode };
        if (localNode.status === 'completed' && remoteNode.status !== 'completed') {
          nextNode.status = 'completed';
        }
        if (!nextNode.generatedLessonId && localNode.generatedLessonId) {
          nextNode.generatedLessonId = localNode.generatedLessonId;
          nextNode.blueprintId = localNode.blueprintId;
          nextNode.blueprintVersion = localNode.blueprintVersion;
        }
        return nextNode;
      }),
    })),
  };
  const recalculated = recalculateRoadmapStatuses(merged);
  const lessons = recalculated.units.flatMap((unit) => unit.lessons);
  const completedLessonCount = lessons.filter((lesson) => lesson.status === 'completed').length;
  return {
    ...recalculated,
    serverSummary: remote.serverSummary ?? {
      unitCount: recalculated.units.length,
      lessonCount: lessons.length,
      completedLessonCount,
      progress: lessons.length > 0 ? completedLessonCount / lessons.length : 0,
    },
  };
}

/** Applies list metadata and counts without treating a summary as nested roadmap content. */
export function mergeRoadmapSummary(
  local: GeneratedRoadmap,
  summary: RoadmapSummary,
): GeneratedRoadmap {
  const localCompleted = local.units
    .flatMap((unit) => unit.lessons)
    .filter((lesson) => lesson.status === 'completed').length;
  const completedLessonCount = Math.min(
    summary.lessonCount,
    Math.max(localCompleted, summary.completedLessonCount),
  );
  return {
    ...local,
    title: summary.title,
    topic: summary.topic,
    goal: summary.goal,
    description: summary.description,
    masteryLevel: summary.masteryLevel,
    depth: summary.depth,
    estimatedTotalMinutes: summary.estimatedTotalMinutes,
    createdAt: summary.createdAt,
    serverSummary: {
      unitCount: summary.unitCount,
      lessonCount: summary.lessonCount,
      completedLessonCount,
      progress: summary.lessonCount > 0 ? completedLessonCount / summary.lessonCount : 0,
    },
  };
}

export function mergeRoadmapsByUpdatedAt(
  local: GeneratedRoadmap[],
  remote: GeneratedRoadmap[],
  deletedIds: Set<string>,
): GeneratedRoadmap[] {
  const map = new Map<string, GeneratedRoadmap>();
  for (const rm of local) {
    if (!deletedIds.has(rm.id)) map.set(rm.id, rm);
  }
  for (const rm of remote) {
    if (deletedIds.has(rm.id)) {
      map.delete(rm.id);
      continue;
    }
    const existing = map.get(rm.id);
    map.set(rm.id, existing ? mergeRoadmapPreservingLocalProgress(existing, rm) : rm);
  }
  return [...map.values()].sort(
    (a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0),
  );
}

export function mergeLessonsByUpdatedAt(
  local: GeneratedLesson[],
  remote: GeneratedLesson[],
  deletedIds: Set<string>,
): GeneratedLesson[] {
  const map = new Map<string, GeneratedLesson>();
  for (const lesson of local) {
    if (!deletedIds.has(lesson.id)) map.set(lesson.id, lesson);
  }
  for (const lesson of remote) {
    if (deletedIds.has(lesson.id)) {
      map.delete(lesson.id);
      continue;
    }
    const existing = map.get(lesson.id);
    if (!existing) {
      map.set(lesson.id, lesson);
      continue;
    }
    const existingTs = Date.parse(existing.createdAt) || 0;
    const remoteTs = Date.parse(lesson.createdAt) || 0;
    map.set(lesson.id, remoteTs >= existingTs ? lesson : existing);
  }
  return [...map.values()].sort(
    (a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0),
  );
}
