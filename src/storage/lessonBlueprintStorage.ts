import AsyncStorage from '@react-native-async-storage/async-storage';
import { LessonBlueprint } from '@/types/lessonBlueprint';

const BLUEPRINTS_KEY = 'microlearn.lessonBlueprints.v1';

type BlueprintIndex = Record<string, LessonBlueprint>;

function nodeKey(roadmapId: string, nodeId: string): string {
  return `${roadmapId}:${nodeId}`;
}

async function readIndex(): Promise<BlueprintIndex> {
  try {
    const raw = await AsyncStorage.getItem(BLUEPRINTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as BlueprintIndex;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeIndex(index: BlueprintIndex): Promise<void> {
  await AsyncStorage.setItem(BLUEPRINTS_KEY, JSON.stringify(index));
}

export async function saveLessonBlueprint(blueprint: LessonBlueprint): Promise<void> {
  const index = await readIndex();
  index[nodeKey(blueprint.roadmapId, blueprint.roadmapNodeId)] = blueprint;
  await writeIndex(index);
}

export async function getLessonBlueprint(
  roadmapId: string,
  nodeId: string,
): Promise<LessonBlueprint | undefined> {
  const index = await readIndex();
  return index[nodeKey(roadmapId, nodeId)];
}

export async function getLessonBlueprintById(
  blueprintId: string,
): Promise<LessonBlueprint | undefined> {
  const index = await readIndex();
  return Object.values(index).find((b) => b.id === blueprintId);
}

export function makeBlueprintId(): string {
  return `bp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
