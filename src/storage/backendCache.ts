import AsyncStorage from '@react-native-async-storage/async-storage';
import { GeneratedLesson } from '@/types/content';
import { GeneratedRoadmap } from '@/types/roadmap';
import { findRoadmapNode, recalculateRoadmapStatuses } from '@/utils/roadmapProgress';

export const CACHE_LESSONS_KEY = 'microlearn.cache.lessons.v1';
export const CACHE_ROADMAPS_KEY = 'microlearn.cache.roadmaps.v1';
export const MIGRATION_FLAG_KEY = 'microlearn.backendTruthMigration.v1';

export interface LessonsCacheSnapshot {
  lessons: GeneratedLesson[];
  deletedIds: string[];
  updatedAt: string;
}

export interface RoadmapsCacheSnapshot {
  roadmaps: GeneratedRoadmap[];
  deletedIds: string[];
  updatedAt: string;
}

export async function readLessonsCache(): Promise<LessonsCacheSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_LESSONS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LessonsCacheSnapshot;
  } catch {
    return null;
  }
}

export async function writeLessonsCache(snapshot: LessonsCacheSnapshot): Promise<void> {
  await AsyncStorage.setItem(CACHE_LESSONS_KEY, JSON.stringify(snapshot));
}

export async function readRoadmapsCache(): Promise<RoadmapsCacheSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_ROADMAPS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as RoadmapsCacheSnapshot;
  } catch {
    return null;
  }
}

export async function writeRoadmapsCache(snapshot: RoadmapsCacheSnapshot): Promise<void> {
  await AsyncStorage.setItem(CACHE_ROADMAPS_KEY, JSON.stringify(snapshot));
}

export async function isBackendTruthMigrated(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(MIGRATION_FLAG_KEY)) === 'done';
  } catch {
    return false;
  }
}

export async function markBackendTruthMigrated(): Promise<void> {
  await AsyncStorage.setItem(MIGRATION_FLAG_KEY, 'done');
}

export function filterDeletedLessons(
  lessons: GeneratedLesson[],
  deletedIds: Set<string>,
): GeneratedLesson[] {
  return lessons.filter((l) => !deletedIds.has(l.id));
}

export function filterDeletedRoadmaps(
  roadmaps: GeneratedRoadmap[],
  deletedIds: Set<string>,
): GeneratedRoadmap[] {
  return roadmaps.filter((r) => !deletedIds.has(r.id));
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

export function mergeRoadmapPreservingLocalProgress(
  local: GeneratedRoadmap,
  remote: GeneratedRoadmap,
): GeneratedRoadmap {
  const merged: GeneratedRoadmap = {
    ...remote,
    units: remote.units.map((unit) => ({
      ...unit,
      lessons: unit.lessons.map((remoteNode) => {
        const localNode = findRoadmapNode(local, remoteNode.id);
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
  return recalculateRoadmapStatuses(merged);
}
