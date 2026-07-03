import AsyncStorage from '@react-native-async-storage/async-storage';
import { GeneratedRoadmap } from '@/types/roadmap';

const ROADMAPS_KEY = 'microlearn.roadmaps.v1';
const LAST_OPENED_KEY = 'microlearn.roadmaps.lastOpened.v1';

export async function getAllRoadmaps(): Promise<GeneratedRoadmap[]> {
  try {
    const raw = await AsyncStorage.getItem(ROADMAPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function getRoadmap(id: string): Promise<GeneratedRoadmap | undefined> {
  const all = await getAllRoadmaps();
  return all.find((r) => r.id === id);
}

export async function saveRoadmap(roadmap: GeneratedRoadmap): Promise<void> {
  const all = await getAllRoadmaps();
  const idx = all.findIndex((r) => r.id === roadmap.id);
  const next =
    idx === -1 ? [roadmap, ...all] : all.map((r, i) => (i === idx ? roadmap : r));
  await AsyncStorage.setItem(ROADMAPS_KEY, JSON.stringify(next));
}

export async function updateRoadmap(roadmap: GeneratedRoadmap): Promise<void> {
  await saveRoadmap(roadmap);
}

export async function deleteRoadmap(id: string): Promise<void> {
  const all = await getAllRoadmaps();
  await AsyncStorage.setItem(
    ROADMAPS_KEY,
    JSON.stringify(all.filter((r) => r.id !== id)),
  );
  const last = await getLastOpenedRoadmapId();
  if (last === id) await AsyncStorage.removeItem(LAST_OPENED_KEY);
}

export async function getLastOpenedRoadmapId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_OPENED_KEY);
  } catch {
    return null;
  }
}

export async function setLastOpenedRoadmapId(id: string): Promise<void> {
  await AsyncStorage.setItem(LAST_OPENED_KEY, id);
}

export function makeRoadmapId(): string {
  return `rm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
