import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import { AiError } from '@/ai/client';
import { generateRoadmap } from '@/ai/roadmap';
import {
  draftToGeneratedLesson,
  ensureLessonBlueprint,
  generateRoadmapLesson,
  persistRoadmapLessonArtifacts,
} from '@/ai/roadmapLesson';
import { getLessonBlueprint } from '@/storage/lessonBlueprintStorage';
import { getGeneratedLessonVersion } from '@/storage/lessonVersionStorage';
import { LESSON_PROMPT_VERSION } from '@/types/lessonBlueprint';
import { buildLessonGenerationContext } from '@/utils/lessonContinuity';
import { useLibrary } from '@/context/LibraryContext';
import {
  createServerRoadmap,
  deleteServerRoadmap,
  fetchServerRoadmap,
  isServerConfigured,
  postServerOutcome,
} from '@/services/microlearnServer';
import {
  loadRoadmapsFromCache,
  persistRoadmapsCache,
  refreshRoadmapsFromBackend,
  runBackendSyncCycle,
  syncRoadmapNodeToBackend,
} from '@/services/syncService';
import { mergeRoadmapPreservingLocalProgress } from '@/storage/backendCache';
import { enqueuePendingMutation, readPendingMutations } from '@/storage/pendingMutations';
import {
  GenerateRoadmapInput,
  GeneratedRoadmap,
  RoadmapLessonNode,
} from '@/types/roadmap';
import {
  allRoadmapLessons,
  continueNode,
  findRoadmapNode,
  markNodeCompleted,
  recalculateRoadmapStatuses,
  setNodeStatus,
} from '@/utils/roadmapProgress';
import { normalizeRoadmapEntityIds, normalizeRoadmapEntityIdsList } from '@/utils/roadmapIds';

const LAST_OPENED_KEY = 'microlearn.roadmaps.lastOpened.v1';
const DEFAULT_SUBJECT = 'computer-science';

interface RoadmapContextValue {
  roadmaps: GeneratedRoadmap[];
  hydrated: boolean;
  refreshingRoadmaps: boolean;
  syncPending: boolean;
  generatingRoadmap: boolean;
  lastOpenedRoadmap: GeneratedRoadmap | undefined;
  generateRoadmapFlow: (input: GenerateRoadmapInput) => Promise<GeneratedRoadmap>;
  refreshRoadmaps: () => Promise<void>;
  refreshRoadmapById: (id: string) => Promise<GeneratedRoadmap | undefined>;
  pregenerateRoadmapLessons: (roadmapId: string, opts?: { count?: number; fromNodeId?: string }) => Promise<void>;
  pregenActive: boolean;
  getRoadmapById: (id: string) => GeneratedRoadmap | undefined;
  openRoadmap: (id: string) => Promise<void>;
  deleteRoadmap: (id: string) => Promise<void>;
  startRoadmapLesson: (roadmapId: string, nodeId: string) => Promise<{ lessonId: string }>;
  onRoadmapLessonCompleted: (
    roadmapId: string,
    nodeId: string,
    outcome?: import('@/types/lessonOutcome').LessonOutcome,
  ) => Promise<void>;
  updateRoadmapLocal: (roadmap: GeneratedRoadmap) => Promise<void>;
}

const RoadmapContext = createContext<RoadmapContextValue | undefined>(undefined);

async function getLastOpenedRoadmapId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_OPENED_KEY);
  } catch {
    return null;
  }
}

async function setLastOpenedRoadmapId(id: string): Promise<void> {
  await AsyncStorage.setItem(LAST_OPENED_KEY, id);
}

export function RoadmapProvider({ children }: { children: React.ReactNode }) {
  const { config, saveGeneratedLesson, hasKey } = useLibrary();
  const [roadmaps, setRoadmaps] = useState<GeneratedRoadmap[]>([]);
  const [deletedRoadmapIds, setDeletedRoadmapIds] = useState<string[]>([]);
  const [lastOpenedRoadmapId, setLastOpenedRoadmapIdState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [refreshingRoadmaps, setRefreshingRoadmaps] = useState(false);
  const [syncPending, setSyncPending] = useState(false);
  const [generatingRoadmap, setGeneratingRoadmap] = useState(false);
  const [pregenActive, setPregenActive] = useState(false);
  const roadmapsRef = useRef<GeneratedRoadmap[]>([]);
  const deletedRoadmapIdsRef = useRef<string[]>([]);
  const pregenInFlight = useRef<Set<string>>(new Set());
  const refreshInFlight = useRef<Promise<void> | null>(null);
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    roadmapsRef.current = roadmaps;
  }, [roadmaps]);

  useEffect(() => {
    deletedRoadmapIdsRef.current = deletedRoadmapIds;
  }, [deletedRoadmapIds]);

  const applyRoadmaps = useCallback(
    async (next: GeneratedRoadmap[], deletedIds: string[]) => {
      const normalized = normalizeRoadmapEntityIdsList(next);
      roadmapsRef.current = normalized;
      deletedRoadmapIdsRef.current = deletedIds;
      setRoadmaps(normalized);
      setDeletedRoadmapIds(deletedIds);
      await persistRoadmapsCache(normalized, deletedIds);
    },
    [],
  );

  const performRoadmapRefresh = useCallback(async () => {
    const pending = await readPendingMutations();
    const cached = await loadRoadmapsFromCache(pending);
    const merged = await refreshRoadmapsFromBackend(cached.roadmaps, cached.deletedIds, pending);
    await applyRoadmaps(merged.roadmaps, merged.deletedIds);
    const lastId = await getLastOpenedRoadmapId();
    setLastOpenedRoadmapIdState(
      lastId && merged.roadmaps.some((r) => r.id === lastId) ? lastId : null,
    );
    const sync = await runBackendSyncCycle();
    setSyncPending(sync.syncPending);
    if (isServerConfigured()) {
      const afterPending = await readPendingMutations();
      const refreshed = await loadRoadmapsFromCache(afterPending);
      const finalRoadmaps = await refreshRoadmapsFromBackend(
        refreshed.roadmaps,
        refreshed.deletedIds,
        afterPending,
      );
      await applyRoadmaps(finalRoadmaps.roadmaps, finalRoadmaps.deletedIds);
    }
  }, [applyRoadmaps]);

  const refreshRoadmaps = useCallback((): Promise<void> => {
    if (refreshInFlight.current) return refreshInFlight.current;

    setRefreshingRoadmaps(true);
    const request = performRoadmapRefresh().finally(() => {
      if (refreshInFlight.current === request) {
        refreshInFlight.current = null;
        setRefreshingRoadmaps(false);
      }
    });
    refreshInFlight.current = request;
    return request;
  }, [performRoadmapRefresh]);

  useEffect(() => {
    void refreshRoadmaps()
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, [refreshRoadmaps]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const wasBackgrounded =
        appStateRef.current === 'background' || appStateRef.current === 'inactive';
      appStateRef.current = state;
      if (wasBackgrounded && state === 'active') void refreshRoadmaps().catch(() => {});
    });
    return () => sub.remove();
  }, [refreshRoadmaps]);

  const persist = useCallback(
    async (roadmap: GeneratedRoadmap) => {
      const normalizedRoadmap = normalizeRoadmapEntityIds(roadmap);
      const prev = roadmapsRef.current;
      const idx = prev.findIndex((r) => r.id === normalizedRoadmap.id);
      const next =
        idx === -1
          ? [normalizedRoadmap, ...prev]
          : prev.map((r, i) => (i === idx ? normalizedRoadmap : r));
      roadmapsRef.current = next;
      setRoadmaps(next);
      await persistRoadmapsCache(next, deletedRoadmapIdsRef.current);
    },
    [],
  );

  const getRoadmapById = useCallback(
    (id: string) => roadmaps.find((r) => r.id === id),
    [roadmaps],
  );

  const refreshRoadmapById = useCallback(
    async (id: string): Promise<GeneratedRoadmap | undefined> => {
      const local = roadmapsRef.current.find((r) => r.id === id);
      if (!isServerConfigured()) return local;

      const remote = await fetchServerRoadmap(id);
      if (!remote) return local;

      const fresh = normalizeRoadmapEntityIds(
        local ? mergeRoadmapPreservingLocalProgress(local, remote) : remote,
      );
      await persist(fresh);
      return fresh;
    },
    [persist],
  );

  const generateRoadmapFlow = useCallback(
    async (input: GenerateRoadmapInput) => {
      if (generatingRoadmap) throw new AiError('Already generating a roadmap.');
      if (!hasKey) throw new AiError('Add your API key in Settings first.');
      setGeneratingRoadmap(true);
      try {
        let roadmap = normalizeRoadmapEntityIds(await generateRoadmap(config, input));
        if (isServerConfigured()) {
          const result = await createServerRoadmap(roadmap);
          if (result.ok && result.data) {
            roadmap = normalizeRoadmapEntityIds(result.data);
          } else {
            await enqueuePendingMutation('create_roadmap', roadmap);
            setSyncPending(true);
          }
        } else {
          await enqueuePendingMutation('create_roadmap', roadmap);
          setSyncPending(true);
        }
        const next = [roadmap, ...roadmapsRef.current.filter((r) => r.id !== roadmap.id)];
        roadmapsRef.current = next;
        setRoadmaps(next);
        await persistRoadmapsCache(next, deletedRoadmapIdsRef.current);
        await setLastOpenedRoadmapId(roadmap.id);
        setLastOpenedRoadmapIdState(roadmap.id);
        return roadmap;
      } finally {
        setGeneratingRoadmap(false);
      }
    },
    [config, deletedRoadmapIds, generatingRoadmap, hasKey],
  );

  const openRoadmap = useCallback(async (id: string) => {
    await setLastOpenedRoadmapId(id);
    setLastOpenedRoadmapIdState(id);
  }, []);

  const deleteRoadmap = useCallback(
    async (id: string) => {
      const nextDeleted = [...new Set([...deletedRoadmapIds, id])];
      deletedRoadmapIdsRef.current = nextDeleted;
      setDeletedRoadmapIds(nextDeleted);
      const next = roadmapsRef.current.filter((r) => r.id !== id);
      roadmapsRef.current = next;
      setRoadmaps(next);
      await persistRoadmapsCache(next, nextDeleted);
      setLastOpenedRoadmapIdState((prev) => (prev === id ? null : prev));
      if (isServerConfigured()) {
        const result = await deleteServerRoadmap(id);
        if (!result.ok) {
          await enqueuePendingMutation('delete_roadmap', { id });
          setSyncPending(true);
        }
      } else {
        await enqueuePendingMutation('delete_roadmap', { id });
        setSyncPending(true);
      }
    },
    [deletedRoadmapIds],
  );

  const lastOpenedRoadmap = useMemo(
    () => (lastOpenedRoadmapId ? roadmaps.find((r) => r.id === lastOpenedRoadmapId) : undefined),
    [lastOpenedRoadmapId, roadmaps],
  );

  const updateRoadmapLocal = useCallback(
    async (roadmap: GeneratedRoadmap) => {
      await persist(normalizeRoadmapEntityIds(roadmap));
    },
    [persist],
  );

  const updatePregenActive = useCallback(() => {
    setPregenActive(pregenInFlight.current.size > 0);
  }, []);

  const isNodeReadyForPregen = useCallback((roadmap: GeneratedRoadmap, node: RoadmapLessonNode) => {
    if (node.generatedLessonId || node.status === 'completed' || node.status === 'generating') {
      return false;
    }
    if (node.status !== 'locked') return true;
    const completed = new Set(
      allRoadmapLessons(roadmap).filter((lesson) => lesson.status === 'completed').map((lesson) => lesson.id),
    );
    return node.prerequisiteIds.every((id) => completed.has(id));
  }, []);

  const upcomingPregenCandidates = useCallback(
    (roadmap: GeneratedRoadmap, afterNodeId?: string, count = 2): RoadmapLessonNode[] => {
      const recalculated = recalculateRoadmapStatuses(roadmap, { preserveGenerating: false });
      const flat = allRoadmapLessons(recalculated);
      const completed = new Set(
        flat.filter((lesson) => lesson.status === 'completed').map((lesson) => lesson.id),
      );
      const startIdx = afterNodeId ? flat.findIndex((lesson) => lesson.id === afterNodeId) + 1 : 0;
      const candidates: RoadmapLessonNode[] = [];
      for (const node of flat.slice(Math.max(startIdx, 0))) {
        const pathBlocked =
          node.status === 'locked' && !node.prerequisiteIds.every((id) => completed.has(id));
        if (pathBlocked) break;
        if (node.status === 'completed') {
          continue;
        }
        if (node.generatedLessonId || node.status === 'generating') {
          continue;
        }
        if (!isNodeReadyForPregen(recalculated, node)) break;
        candidates.push(node);
        if (candidates.length >= Math.max(0, count)) break;
      }
      return candidates;
    },
    [isNodeReadyForPregen],
  );

  const generateMissingRoadmapLesson = useCallback(
    async (roadmap: GeneratedRoadmap, nodeId: string): Promise<GeneratedRoadmap> => {
      const workingRoadmap = recalculateRoadmapStatuses(normalizeRoadmapEntityIds(roadmap), {
        preserveGenerating: false,
      });
      const node = findRoadmapNode(workingRoadmap, nodeId);
      if (!node || !isNodeReadyForPregen(workingRoadmap, node)) return workingRoadmap;

      const key = `${workingRoadmap.id}:${node.id}`;
      if (pregenInFlight.current.has(key)) return workingRoadmap;
      pregenInFlight.current.add(key);
      updatePregenActive();

      const priorStatus = node.status === 'active' ? 'active' : 'available';
      let nextRoadmap = setNodeStatus(workingRoadmap, node.id, 'generating');
      await persist(nextRoadmap);

      try {
        const ctx = await buildLessonGenerationContext(nextRoadmap, node.id);
        if (!ctx) throw new AiError('Could not build lesson context.');

        const draft = await generateRoadmapLesson(config, ctx, node, DEFAULT_SUBJECT);
        const blueprint =
          (await getLessonBlueprint(nextRoadmap.id, node.id)) ??
          (await ensureLessonBlueprint(config, ctx, node.id, node));
        const lesson = draftToGeneratedLesson(draft, {
          subjectId: DEFAULT_SUBJECT,
          topic: node.title,
          roadmapId: nextRoadmap.id,
          roadmapNodeId: node.id,
          model: config.model,
        });

        await saveGeneratedLesson(lesson);
        await persistRoadmapLessonArtifacts(lesson, blueprint);

        nextRoadmap = setNodeStatus(nextRoadmap, node.id, priorStatus, {
          generatedLessonId: lesson.id,
          blueprintId: blueprint.id,
          blueprintVersion: blueprint.version,
        });
        nextRoadmap = recalculateRoadmapStatuses(nextRoadmap);
        await persist(nextRoadmap);
        void syncRoadmapNodeToBackend(nextRoadmap, node.id).catch(() => {});
        return nextRoadmap;
      } catch (err) {
        console.warn('[roadmap-pregen] failed', workingRoadmap.id, node.id, err);
        const reverted = setNodeStatus(workingRoadmap, node.id, node.status === 'active' ? 'active' : node.status);
        await persist(reverted);
        return reverted;
      } finally {
        pregenInFlight.current.delete(key);
        updatePregenActive();
      }
    },
    [config, isNodeReadyForPregen, persist, saveGeneratedLesson, updatePregenActive],
  );

  const pregenerateUpcomingLessons = useCallback(
    async (roadmap: GeneratedRoadmap, afterNodeId?: string, count = 2) => {
      if (!hasKey) return;
      let working = recalculateRoadmapStatuses(normalizeRoadmapEntityIds(roadmap), {
        preserveGenerating: false,
      });
      const candidates = upcomingPregenCandidates(working, afterNodeId, count);
      for (const candidate of candidates) {
        const latest = roadmapsRef.current.find((r) => r.id === working.id);
        if (latest) {
          working = recalculateRoadmapStatuses(normalizeRoadmapEntityIds(latest), {
            preserveGenerating: false,
          });
        }
        const latestNode = findRoadmapNode(working, candidate.id);
        if (!latestNode || !isNodeReadyForPregen(working, latestNode)) continue;
        working = await generateMissingRoadmapLesson(working, latestNode.id);
      }
    },
    [generateMissingRoadmapLesson, hasKey, isNodeReadyForPregen, upcomingPregenCandidates],
  );

  const pregenerateRoadmapLessons = useCallback(
    async (roadmapId: string, opts: { count?: number; fromNodeId?: string } = {}) => {
      let roadmap = roadmapsRef.current.find((r) => r.id === roadmapId);
      if (!roadmap) return;
      if (isServerConfigured()) {
        const remote = await fetchServerRoadmap(roadmapId);
        if (remote) {
          roadmap = mergeRoadmapPreservingLocalProgress(roadmap, remote);
          await persist(roadmap);
        }
      }
      const recalculated = recalculateRoadmapStatuses(normalizeRoadmapEntityIds(roadmap), {
        preserveGenerating: false,
      });
      await persist(recalculated);
      await pregenerateUpcomingLessons(recalculated, opts.fromNodeId, opts.count ?? 3);
    },
    [persist, pregenerateUpcomingLessons],
  );

  const startRoadmapLesson = useCallback(
    async (roadmapId: string, nodeId: string) => {
      let roadmap = getRoadmapById(roadmapId);
      if (!roadmap) throw new AiError('Roadmap not found.');
      roadmap = normalizeRoadmapEntityIds(roadmap);
      const node = findRoadmapNode(roadmap, nodeId);
      if (!node) throw new AiError('Lesson not found in roadmap.');
      if (node.status === 'locked') throw new AiError('Complete prerequisites first.');
      if (node.status === 'generating') throw new AiError('Lesson is still generating.');

      if (node.generatedLessonId) {
        const version = await getGeneratedLessonVersion(roadmapId, node.id);
        const stale = version
          ? version.promptVersion !== LESSON_PROMPT_VERSION ||
            (node.blueprintVersion != null && version.blueprintVersion !== node.blueprintVersion)
          : false;
        if (!stale) {
          await openRoadmap(roadmapId);
          void pregenerateUpcomingLessons(roadmap, node.id, 2);
          return { lessonId: node.generatedLessonId };
        }
      }

      roadmap = setNodeStatus(roadmap, node.id, 'generating');
      await persist(roadmap);

      try {
        const ctx = await buildLessonGenerationContext(roadmap, node.id);
        if (!ctx) throw new AiError('Could not build lesson context.');

        const draft = await generateRoadmapLesson(config, ctx, node, DEFAULT_SUBJECT);
        const blueprint =
          (await getLessonBlueprint(roadmap.id, node.id)) ??
          (await ensureLessonBlueprint(config, ctx, node.id, node));
        const lesson = draftToGeneratedLesson(draft, {
          subjectId: DEFAULT_SUBJECT,
          topic: node.title,
          roadmapId: roadmap.id,
          roadmapNodeId: node.id,
          model: config.model,
          existingId: node.generatedLessonId,
        });

        await saveGeneratedLesson(lesson);
        await persistRoadmapLessonArtifacts(lesson, blueprint);

        roadmap = setNodeStatus(roadmap, node.id, 'active', {
          generatedLessonId: lesson.id,
          blueprintId: blueprint.id,
          blueprintVersion: blueprint.version,
        });
        roadmap = recalculateRoadmapStatuses(roadmap, { preserveGenerating: true });
        await persist(roadmap);
        void syncRoadmapNodeToBackend(roadmap, node.id).catch(() => {});
        await openRoadmap(roadmapId);

        void pregenerateUpcomingLessons(roadmap, node.id, 2);
        return { lessonId: lesson.id };
      } catch (e) {
        console.error('[roadmap-lesson] failed', roadmapId, node.id, e);
        roadmap = setNodeStatus(roadmap, node.id, 'error');
        await persist(roadmap);
        throw e;
      }
    },
    [
      config,
      getRoadmapById,
      openRoadmap,
      persist,
      pregenerateUpcomingLessons,
      saveGeneratedLesson,
    ],
  );

  const onRoadmapLessonCompleted = useCallback(
    async (
      roadmapId: string,
      nodeId: string,
      outcome?: import('@/types/lessonOutcome').LessonOutcome,
    ) => {
      let roadmap = getRoadmapById(roadmapId) ?? roadmapsRef.current.find((r) => r.id === roadmapId);
      if (!roadmap && isServerConfigured()) {
        roadmap = await fetchServerRoadmap(roadmapId);
      }
      if (!roadmap) {
        console.warn('[roadmap] completion ignored; roadmap not loaded', roadmapId, nodeId);
        return;
      }
      roadmap = markNodeCompleted(normalizeRoadmapEntityIds(roadmap), nodeId);
      await persist(roadmap);
      await enqueuePendingMutation('update_roadmap', roadmap);
      setSyncPending(true);
      const next = continueNode(roadmap);
      const syncResults = await Promise.allSettled([
        syncRoadmapNodeToBackend(roadmap, nodeId),
        ...(next ? [syncRoadmapNodeToBackend(roadmap, next.id)] : []),
      ]);
      const nodeSyncFailed = syncResults.some((result) => result.status === 'rejected');
      if (nodeSyncFailed) setSyncPending(true);
      runBackendSyncCycle()
        .then((sync) => setSyncPending(sync.syncPending))
        .catch(() => setSyncPending(true));
      void pregenerateUpcomingLessons(roadmap, nodeId, 2);
      if (outcome) void postServerOutcome(outcome).catch(() => {});
      void recordActivityEventSafe();
    },
    [getRoadmapById, persist, pregenerateUpcomingLessons],
  );

  async function recordActivityEventSafe() {
    if (!isServerConfigured()) return;
    const { recordActivityEvent } = await import('@/services/microlearnServer');
    void recordActivityEvent({ eventType: 'lesson_completed' }).catch(() => {});
  }

  const value = useMemo<RoadmapContextValue>(
    () => ({
      roadmaps,
      hydrated,
      refreshingRoadmaps,
      syncPending,
      generatingRoadmap,
      pregenActive,
      lastOpenedRoadmap,
      generateRoadmapFlow,
      refreshRoadmaps,
      refreshRoadmapById,
      pregenerateRoadmapLessons,
      getRoadmapById,
      openRoadmap,
      deleteRoadmap,
      startRoadmapLesson,
      onRoadmapLessonCompleted,
      updateRoadmapLocal,
    }),
    [
      roadmaps,
      hydrated,
      refreshingRoadmaps,
      syncPending,
      generatingRoadmap,
      pregenActive,
      lastOpenedRoadmap,
      generateRoadmapFlow,
      refreshRoadmaps,
      refreshRoadmapById,
      pregenerateRoadmapLessons,
      getRoadmapById,
      openRoadmap,
      deleteRoadmap,
      startRoadmapLesson,
      onRoadmapLessonCompleted,
      updateRoadmapLocal,
    ],
  );

  return <RoadmapContext.Provider value={value}>{children}</RoadmapContext.Provider>;
}

export function useRoadmaps(): RoadmapContextValue {
  const ctx = useContext(RoadmapContext);
  if (!ctx) throw new Error('useRoadmaps must be used within RoadmapProvider');
  return ctx;
}

export { continueNode, findRoadmapNode };
export type { RoadmapLessonNode };
