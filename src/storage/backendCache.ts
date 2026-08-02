import AsyncStorage from '@react-native-async-storage/async-storage';
import { GeneratedLesson } from '@/types/content';
import { GeneratedRoadmap } from '@/types/roadmap';

export {
  mergeLessonsByUpdatedAt,
  mergeRoadmapPreservingLocalProgress,
  mergeRoadmapSummary,
  mergeRoadmapsByUpdatedAt,
} from '@/utils/roadmapMerge';

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
