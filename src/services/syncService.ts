import AsyncStorage from '@react-native-async-storage/async-storage';
import { GeneratedLesson } from '@/types/content';
import { GeneratedRoadmap, RoadmapSummary } from '@/types/roadmap';
import { allRoadmapLessons, recalculateRoadmapStatuses } from '@/utils/roadmapProgress';
import {
  createServerLesson,
  createServerRoadmap,
  deleteRetrievalItem,
  deleteReviewSet,
  deleteServerLesson,
  deleteServerRoadmap,
  fetchServerRoadmap,
  fetchServerRoadmapMeta,
  isServerConfigured,
  listServerLessons,
  listServerRoadmaps,
  patchServerRoadmapNode,
  ServerMutationResult,
} from '@/services/microlearnServer';
import { ensureRoadmapSynced } from '@/services/roadmapSync';
import {
  isBackendTruthMigrated,
  markBackendTruthMigrated,
  mergeLessonsByUpdatedAt,
  mergeRoadmapSummary,
  readLessonsCache,
  readRoadmapsCache,
  writeLessonsCache,
  writeRoadmapsCache,
} from '@/storage/backendCache';
import {
  enqueuePendingMutation,
  markPendingMutationError,
  PendingMutation,
  pendingDeletedLessonIds,
  pendingDeletedRoadmapIds,
  readPendingMutations,
  removePendingMutation,
} from '@/storage/pendingMutations';
import { normalizeGeneratedLesson, normalizeGeneratedLessons } from '@/utils/normalizeLesson';
import { normalizeRoadmapEntityIds, normalizeRoadmapEntityIdsList } from '@/utils/roadmapIds';
import { filterDemoRoadmaps } from '@/storage/cleanupLegacyData';

const LEGACY_LESSONS_KEY = 'microlearn.ai.lessons.v1';
const LEGACY_ROADMAPS_KEY = 'microlearn.roadmaps.v1';

const MUTATION_ORDER: Record<PendingMutation['type'], number> = {
  create_roadmap: 0,
  update_roadmap: 1,
  create_lesson: 2,
  update_lesson: 3,
  delete_lesson: 4,
  delete_roadmap: 5,
  complete_lesson: 6,
  create_review_set: 7,
  record_retrieval_attempt: 8,
  delete_review_set: 9,
  delete_retrieval_item: 10,
};

export interface SyncState {
  syncPending: boolean;
  lastSyncError?: string;
}

function deletedIdsFromCache(deleted: string[], pending: Set<string>): Set<string> {
  return new Set([...deleted, ...pending]);
}

function sortedPending(mutations: PendingMutation[]): PendingMutation[] {
  return [...mutations].sort(
    (a, b) => (MUTATION_ORDER[a.type] ?? 99) - (MUTATION_ORDER[b.type] ?? 99),
  );
}

export async function loadLessonsFromCache(
  pending: PendingMutation[],
): Promise<{ lessons: GeneratedLesson[]; deletedIds: string[] }> {
  const cache = await readLessonsCache();
  const pendingDeletes = pendingDeletedLessonIds(pending);
  const deletedIds = deletedIdsFromCache(cache?.deletedIds ?? [], pendingDeletes);
  const lessons = normalizeGeneratedLessons(
    (cache?.lessons ?? []).filter((l) => !deletedIds.has(l.id)),
  );
  return { lessons, deletedIds: [...deletedIds] };
}

export async function loadRoadmapsFromCache(
  pending: PendingMutation[],
): Promise<{ roadmaps: GeneratedRoadmap[]; deletedIds: string[] }> {
  const cache = await readRoadmapsCache();
  const pendingDeletes = pendingDeletedRoadmapIds(pending);
  const deletedIds = deletedIdsFromCache(cache?.deletedIds ?? [], pendingDeletes);
  const roadmaps = normalizeRoadmapEntityIdsList(
    filterDemoRoadmaps((cache?.roadmaps ?? []).filter((r) => !deletedIds.has(r.id))),
  ).map((roadmap) => recalculateRoadmapStatuses(roadmap, { preserveGenerating: false }));
  return { roadmaps, deletedIds: [...deletedIds] };
}

export async function persistLessonsCache(
  lessons: GeneratedLesson[],
  deletedIds: string[],
): Promise<void> {
  await writeLessonsCache({ lessons, deletedIds, updatedAt: new Date().toISOString() });
}

export async function persistRoadmapsCache(
  roadmaps: GeneratedRoadmap[],
  deletedIds: string[],
): Promise<void> {
  await writeRoadmapsCache({
    roadmaps: normalizeRoadmapEntityIdsList(roadmaps),
    deletedIds,
    updatedAt: new Date().toISOString(),
  });
}

async function reconcileLocalRoadmapsWithBackend(
  local: GeneratedRoadmap[],
  deletedIds: string[],
  pending: PendingMutation[],
  remote: RoadmapSummary[],
): Promise<{ roadmaps: GeneratedRoadmap[]; deletedIds: string[] }> {
  if (!isServerConfigured()) return { roadmaps: local, deletedIds };

  const remoteIds = new Set(remote.map((r) => r.id));
  const pendingCreateIds = new Set(
    pending
      .filter((m) => m.type === 'create_roadmap')
      .map((m) => normalizeRoadmapEntityIds(m.payload as GeneratedRoadmap).id),
  );

  const nextDeleted = new Set(deletedIds);
  const nextLocal: GeneratedRoadmap[] = [];

  for (const rm of normalizeRoadmapEntityIdsList(local)) {
    if (nextDeleted.has(rm.id)) continue;
    if (remoteIds.has(rm.id) || pendingCreateIds.has(rm.id)) {
      nextLocal.push(rm);
      continue;
    }
    const meta = await fetchServerRoadmapMeta(rm.id);
    if (meta === 'deleted') {
      nextDeleted.add(rm.id);
      console.warn('[roadmap-sync] removing backend-deleted roadmap from cache', rm.id);
      continue;
    }
    nextLocal.push(rm);
  }

  return { roadmaps: nextLocal, deletedIds: [...nextDeleted] };
}

export async function refreshLessonsFromBackend(
  local: GeneratedLesson[],
  deletedIds: string[],
): Promise<GeneratedLesson[]> {
  if (!isServerConfigured()) return local;
  const remote = await listServerLessons();
  const deleted = new Set(deletedIds);
  return mergeLessonsByUpdatedAt(local, remote, deleted).map(normalizeGeneratedLesson);
}

export async function refreshRoadmapsFromBackend(
  local: GeneratedRoadmap[],
  deletedIds: string[],
  pending: PendingMutation[] = [],
): Promise<{ roadmaps: GeneratedRoadmap[]; deletedIds: string[] }> {
  if (!isServerConfigured()) return { roadmaps: local, deletedIds };
  const pendingMutations = pending.length > 0 ? pending : await readPendingMutations();
  const remote = await listServerRoadmaps();
  const reconciled = await reconcileLocalRoadmapsWithBackend(
    local,
    deletedIds,
    pendingMutations,
    remote,
  );
  const deleted = new Set(reconciled.deletedIds);
  const byId = new Map(reconciled.roadmaps.map((roadmap) => [roadmap.id, roadmap]));
  const newlyDiscovered = remote.filter(
    (summary) => !deleted.has(summary.id) && !byId.has(summary.id),
  );
  const fullNewRoadmaps = await Promise.all(
    newlyDiscovered.map((summary) => fetchServerRoadmap(summary.id)),
  );

  for (const summary of remote) {
    if (deleted.has(summary.id)) continue;
    const existing = byId.get(summary.id);
    if (existing) byId.set(summary.id, mergeRoadmapSummary(existing, summary));
  }
  for (const roadmap of fullNewRoadmaps) {
    if (roadmap && !deleted.has(roadmap.id)) byId.set(roadmap.id, roadmap);
  }

  const merged = [...byId.values()].sort(
    (a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0),
  );
  return { roadmaps: normalizeRoadmapEntityIdsList(merged), deletedIds: reconciled.deletedIds };
}

async function flushUpdateRoadmap(roadmap: GeneratedRoadmap): Promise<ServerMutationResult<unknown>> {
  const scopedRoadmap = normalizeRoadmapEntityIds(roadmap);
  const sync = await ensureRoadmapSynced(scopedRoadmap);
  if (!sync.ok) return { ok: false, errorMessage: sync.errorMessage };

  for (const node of allRoadmapLessons(scopedRoadmap)) {
    const needsSync =
      Boolean(node.generatedLessonId) ||
      node.status === 'completed' ||
      node.status === 'active' ||
      node.status === 'error';
    if (!needsSync) continue;

    const result = await patchServerRoadmapNode(scopedRoadmap.id, node.id, {
      status: node.status,
      generatedLessonId: node.generatedLessonId ?? null,
    });
    if (!result.ok) return { ok: false, errorMessage: result.errorMessage };
  }
  return { ok: true, data: scopedRoadmap };
}

async function ensureRoadmapForLesson(
  lesson: GeneratedLesson,
  pending: PendingMutation[],
): Promise<ServerMutationResult<unknown>> {
  if (!lesson.roadmapId) return { ok: true };
  const meta = await fetchServerRoadmapMeta(lesson.roadmapId);
  if (meta === 'active') return { ok: true };

  const pendingCreate = pending.find(
    (m) =>
      m.type === 'create_roadmap' &&
      normalizeRoadmapEntityIds(m.payload as GeneratedRoadmap).id === lesson.roadmapId,
  );
  if (pendingCreate) {
    const created = await createServerRoadmap(
      normalizeRoadmapEntityIds(pendingCreate.payload as GeneratedRoadmap),
    );
    if (created.ok) {
      await removePendingMutation(pendingCreate.id);
      return { ok: true };
    }
    return { ok: false, errorMessage: created.errorMessage };
  }

  const payloadRoadmap = (
    pending.find(
      (m) =>
        m.type === 'update_roadmap' &&
        normalizeRoadmapEntityIds(m.payload as GeneratedRoadmap).id === lesson.roadmapId,
    )?.payload ?? null
  ) as GeneratedRoadmap | null;

  if (payloadRoadmap) {
    const sync = await ensureRoadmapSynced(normalizeRoadmapEntityIds(payloadRoadmap));
    return sync.ok ? { ok: true } : { ok: false, errorMessage: sync.errorMessage };
  }

  if (meta === 'deleted') return { ok: false, errorMessage: 'This roadmap was deleted on the server.' };
  return {
    ok: false,
    errorMessage: `Roadmap "${lesson.roadmapId}" not found in backend. Sync this roadmap first.`,
  };
}

async function applyMutation(mutation: PendingMutation): Promise<ServerMutationResult<unknown>> {
  const pending = await readPendingMutations();
  switch (mutation.type) {
    case 'create_lesson': {
      const payload = mutation.payload as { lesson: GeneratedLesson; roadmap?: GeneratedRoadmap };
      const lesson = payload.lesson ?? (mutation.payload as GeneratedLesson);
      if (payload.roadmap) {
        const sync = await ensureRoadmapSynced(normalizeRoadmapEntityIds(payload.roadmap));
        if (!sync.ok) return { ok: false, errorMessage: sync.errorMessage };
      } else {
        const rmCheck = await ensureRoadmapForLesson(lesson, pending);
        if (!rmCheck.ok) return rmCheck;
      }
      return createServerLesson({ lesson });
    }
    case 'delete_lesson':
      return deleteServerLesson((mutation.payload as { id: string }).id);
    case 'create_roadmap': {
      const roadmap = normalizeRoadmapEntityIds(mutation.payload as GeneratedRoadmap);
      const existing = await listServerRoadmaps();
      if (existing.some((r) => r.id === roadmap.id)) return { ok: true, data: roadmap };
      return createServerRoadmap(roadmap);
    }
    case 'update_roadmap':
      return flushUpdateRoadmap(normalizeRoadmapEntityIds(mutation.payload as GeneratedRoadmap));
    case 'delete_roadmap':
      return deleteServerRoadmap((mutation.payload as { id: string }).id);
    case 'delete_review_set':
      return deleteReviewSet((mutation.payload as { reviewSetId: string }).reviewSetId);
    case 'delete_retrieval_item':
      return deleteRetrievalItem((mutation.payload as { itemId: string }).itemId);
    default:
      return { ok: false, errorMessage: `Unsupported mutation type: ${mutation.type}` };
  }
}

export async function flushPendingMutations(): Promise<{ flushed: number; failed: number }> {
  if (!isServerConfigured()) return { flushed: 0, failed: 0 };
  const pending = sortedPending(await readPendingMutations());
  let flushed = 0;
  let failed = 0;
  for (const mutation of pending) {
    const result = await applyMutation(mutation);
    if (result.ok) {
      await removePendingMutation(mutation.id);
      flushed += 1;
    } else {
      console.warn('[sync] mutation failed', mutation.type, mutation.id, result.errorMessage);
      await markPendingMutationError(mutation.id, result.errorMessage ?? 'Sync failed');
      failed += 1;
    }
  }
  return { flushed, failed };
}

export async function syncRoadmapNodeToBackend(roadmap: GeneratedRoadmap, nodeId: string): Promise<void> {
  if (!isServerConfigured()) return;
  const scopedRoadmap = normalizeRoadmapEntityIds(roadmap);
  const node = allRoadmapLessons(scopedRoadmap).find((n) => n.id === nodeId);
  if (!node) return;

  const sync = await ensureRoadmapSynced(scopedRoadmap);
  if (!sync.ok) {
    console.warn('[roadmap-sync] node sync skipped - roadmap not on backend', scopedRoadmap.id, sync.errorMessage);
    await enqueuePendingMutation('update_roadmap', scopedRoadmap);
    return;
  }

  const result = await patchServerRoadmapNode(scopedRoadmap.id, nodeId, {
    status: node.status,
    generatedLessonId: node.generatedLessonId ?? null,
  });
  if (!result.ok) {
    console.warn('[roadmap-sync] node patch failed', scopedRoadmap.id, nodeId, result.errorMessage);
    await enqueuePendingMutation('update_roadmap', scopedRoadmap);
  }
}

export async function migrateLegacyLocalDataToBackend(): Promise<void> {
  if (!isServerConfigured()) return;
  if (await isBackendTruthMigrated()) return;

  const [legacyLessonsRaw, legacyRoadmapsRaw] = await Promise.all([
    AsyncStorage.getItem(LEGACY_LESSONS_KEY),
    AsyncStorage.getItem(LEGACY_ROADMAPS_KEY),
  ]);

  const existingLessons = await listServerLessons();
  const existingRoadmaps = await listServerRoadmaps();
  const lessonIds = new Set(existingLessons.map((l) => l.id));
  const roadmapIds = new Set(existingRoadmaps.map((r) => r.id));

  if (legacyLessonsRaw) {
    try {
      const parsed = JSON.parse(legacyLessonsRaw) as GeneratedLesson[];
      if (Array.isArray(parsed)) {
        for (const lesson of parsed) {
          if (lessonIds.has(lesson.id)) continue;
          await createServerLesson({ lesson });
        }
      }
    } catch {
      /* skip corrupt legacy */
    }
  }

  if (legacyRoadmapsRaw) {
    try {
      const parsed = JSON.parse(legacyRoadmapsRaw) as GeneratedRoadmap[];
      if (Array.isArray(parsed)) {
        for (const roadmap of parsed) {
          const scopedRoadmap = normalizeRoadmapEntityIds(roadmap);
          if (roadmapIds.has(scopedRoadmap.id)) continue;
          await createServerRoadmap(scopedRoadmap);
        }
      }
    } catch {
      /* skip corrupt legacy */
    }
  }

  await markBackendTruthMigrated();
}

export async function runBackendSyncCycle(): Promise<SyncState> {
  if (!isServerConfigured()) return { syncPending: false };
  try {
    await migrateLegacyLocalDataToBackend();
    await flushPendingMutations();
    return { syncPending: (await readPendingMutations()).length > 0 };
  } catch (e) {
    return {
      syncPending: true,
      lastSyncError: e instanceof Error ? e.message : 'Sync failed',
    };
  }
}

export { enqueuePendingMutation } from '@/storage/pendingMutations';
