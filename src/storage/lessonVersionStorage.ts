import AsyncStorage from '@react-native-async-storage/async-storage';

const VERSIONS_KEY = 'microlearn.lessonVersions.v1';

export interface GeneratedLessonVersion {
  lessonId: string;
  roadmapId: string;
  roadmapNodeId: string;
  blueprintId: string;
  blueprintVersion: number;
  promptVersion: number;
  model?: string;
  generatedAt: string;
}

type VersionIndex = Record<string, GeneratedLessonVersion>;

function nodeKey(roadmapId: string, nodeId: string): string {
  return `${roadmapId}:${nodeId}`;
}

async function readIndex(): Promise<VersionIndex> {
  try {
    const raw = await AsyncStorage.getItem(VERSIONS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as VersionIndex;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeIndex(index: VersionIndex): Promise<void> {
  await AsyncStorage.setItem(VERSIONS_KEY, JSON.stringify(index));
}

export async function saveGeneratedLessonVersion(
  version: GeneratedLessonVersion,
): Promise<void> {
  const index = await readIndex();
  index[nodeKey(version.roadmapId, version.roadmapNodeId)] = version;
  await writeIndex(index);
}

export async function getGeneratedLessonVersion(
  roadmapId: string,
  nodeId: string,
): Promise<GeneratedLessonVersion | undefined> {
  const index = await readIndex();
  return index[nodeKey(roadmapId, nodeId)];
}
