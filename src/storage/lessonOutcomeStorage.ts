import AsyncStorage from '@react-native-async-storage/async-storage';
import { LessonOutcome } from '@/types/lessonOutcome';

const OUTCOMES_KEY = 'microlearn.lessonOutcomes.v1';

type OutcomeIndex = Record<string, LessonOutcome>;

function nodeKey(roadmapId: string, nodeId: string): string {
  return `${roadmapId}:${nodeId}`;
}

async function readIndex(): Promise<OutcomeIndex> {
  try {
    const raw = await AsyncStorage.getItem(OUTCOMES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as OutcomeIndex;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeIndex(index: OutcomeIndex): Promise<void> {
  await AsyncStorage.setItem(OUTCOMES_KEY, JSON.stringify(index));
}

export async function saveLessonOutcome(outcome: LessonOutcome): Promise<void> {
  const index = await readIndex();
  index[nodeKey(outcome.roadmapId, outcome.roadmapNodeId)] = outcome;
  await writeIndex(index);
}

export async function getLessonOutcome(
  roadmapId: string,
  nodeId: string,
): Promise<LessonOutcome | undefined> {
  const index = await readIndex();
  return index[nodeKey(roadmapId, nodeId)];
}

export async function getRoadmapLessonOutcomes(
  roadmapId: string,
): Promise<LessonOutcome[]> {
  const index = await readIndex();
  return Object.values(index)
    .filter((o) => o.roadmapId === roadmapId)
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt));
}

export function makeOutcomeId(): string {
  return `out-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
