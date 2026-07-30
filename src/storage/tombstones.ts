import AsyncStorage from '@react-native-async-storage/async-storage';

export const DELETED_LESSONS_KEY = 'microlearn.deleted.lessons.v1';
export const DELETED_ROADMAPS_KEY = 'microlearn.deleted.roadmaps.v1';

async function readSet(key: string): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

async function writeSet(key: string, ids: Set<string>): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify([...ids]));
}

export async function getDeletedLessonIds(): Promise<Set<string>> {
  return readSet(DELETED_LESSONS_KEY);
}

export async function addDeletedLessonId(id: string): Promise<void> {
  const ids = await getDeletedLessonIds();
  ids.add(id);
  await writeSet(DELETED_LESSONS_KEY, ids);
}

export async function getDeletedRoadmapIds(): Promise<Set<string>> {
  return readSet(DELETED_ROADMAPS_KEY);
}

export async function addDeletedRoadmapId(id: string): Promise<void> {
  const ids = await getDeletedRoadmapIds();
  ids.add(id);
  await writeSet(DELETED_ROADMAPS_KEY, ids);
}
