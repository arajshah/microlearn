import AsyncStorage from '@react-native-async-storage/async-storage';

export const PENDING_MUTATIONS_KEY = 'microlearn.pendingMutations.v1';

export type PendingMutationType =
  | 'create_lesson'
  | 'update_lesson'
  | 'delete_lesson'
  | 'create_roadmap'
  | 'update_roadmap'
  | 'delete_roadmap'
  | 'complete_lesson'
  | 'create_review_set'
  | 'record_retrieval_attempt'
  | 'delete_review_set'
  | 'delete_retrieval_item';

export interface PendingMutation {
  id: string;
  type: PendingMutationType;
  payload: unknown;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

function makeMutationId(): string {
  return `mut-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function readPendingMutations(): Promise<PendingMutation[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_MUTATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function writePendingMutations(mutations: PendingMutation[]): Promise<void> {
  await AsyncStorage.setItem(PENDING_MUTATIONS_KEY, JSON.stringify(mutations));
}

export async function enqueuePendingMutation(
  type: PendingMutationType,
  payload: unknown,
): Promise<PendingMutation> {
  const mutation: PendingMutation = {
    id: makeMutationId(),
    type,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
  };
  const all = await readPendingMutations();
  all.push(mutation);
  await writePendingMutations(all);
  return mutation;
}

export async function removePendingMutation(id: string): Promise<void> {
  const all = await readPendingMutations();
  await writePendingMutations(all.filter((m) => m.id !== id));
}

export async function markPendingMutationError(id: string, error: string): Promise<void> {
  const all = await readPendingMutations();
  const next = all.map((m) =>
    m.id === id ? { ...m, attempts: m.attempts + 1, lastError: error } : m,
  );
  await writePendingMutations(next);
}

export function pendingDeletedLessonIds(mutations: PendingMutation[]): Set<string> {
  const ids = new Set<string>();
  for (const m of mutations) {
    if (m.type === 'delete_lesson' && m.payload && typeof m.payload === 'object') {
      const id = (m.payload as { id?: string }).id;
      if (id) ids.add(id);
    }
  }
  return ids;
}

export function pendingDeletedRoadmapIds(mutations: PendingMutation[]): Set<string> {
  const ids = new Set<string>();
  for (const m of mutations) {
    if (m.type === 'delete_roadmap' && m.payload && typeof m.payload === 'object') {
      const id = (m.payload as { id?: string }).id;
      if (id) ids.add(id);
    }
  }
  return ids;
}
