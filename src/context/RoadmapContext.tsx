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
import { useLibrary } from '@/context/LibraryContext';
import {
  deleteServerRoadmap,
  fetchServerRoadmap,
  generateServerRoadmap,
  generateServerRoadmapNodeLesson,
  getServerLesson,
  isServerConfigured,
  postServerOutcome,
  pregenerateServerRoadmapLessons,
  ServerGenerationError,
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
  const { saveGeneratedLesson } = useLibrary();
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
  const roadmapRefreshInFlight = useRef(
    new Map<string, Promise<GeneratedRoadmap | undefined>>(),
  );
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
    (id: string): Promise<GeneratedRoadmap | undefined> => {
      const existing = roadmapRefreshInFlight.current.get(id);
      if (existing) return existing;

      const request = (async () => {
        const local = roadmapsRef.current.find((r) => r.id === id);
        if (!isServerConfigured()) return local;

        const remote = await fetchServerRoadmap(id);
        if (!remote) return local;

        const fresh = normalizeRoadmapEntityIds(
          local ? mergeRoadmapPreservingLocalProgress(local, remote) : remote,
        );
        await persist(fresh);
        return fresh;
      })().finally(() => {
        if (roadmapRefreshInFlight.current.get(id) === request) {
          roadmapRefreshInFlight.current.delete(id);
        }
      });
      roadmapRefreshInFlight.current.set(id, request);
      return request;
    },
    [persist],
  );

  const generateRoadmapFlow = useCallback(
    async (input: GenerateRoadmapInput) => {
      if (generatingRoadmap) throw new ServerGenerationError('Already generating a roadmap.');
      if (!isServerConfigured()) {
        throw new ServerGenerationError(
          'Connect to the Microlearn server to generate a roadmap.',
          { code: 'SERVER_NOT_CONFIGURED' },
        );
      }
      setGeneratingRoadmap(true);
      try {
        const roadmap = await generateServerRoadmap({
          topic: input.topic,
          goal: input.goal,
          masteryLevel: input.masteryLevel,
          depth: input.depth,
          lessonCount: input.lessonCount,
          slidesPerLesson: input.slidesPerLesson,
          preferences: input.preferences,
          sourceUrl: input.sourceUrl,
          sourceExtractionId: input.sourceExtractionId,
          sourceContext: input.sourceContext,
          idempotencyKey: `${input.topic}:${input.goal}:${Date.now()}`,
        });
        const normalized = normalizeRoadmapEntityIds({
          ...roadmap,
          targetLessonCount: input.lessonCount,
          slidesPerLesson: input.slidesPerLesson,
          preferences: input.preferences,
          sourceUrl: input.sourceUrl,
          sourceExtractionId: input.sourceExtractionId,
          sourceContext: input.sourceContext,
        });
        const next = [normalized, ...roadmapsRef.current.filter((r) => r.id !== normalized.id)];
        roadmapsRef.current = next;
        setRoadmaps(next);
        await persistRoadmapsCache(next, deletedRoadmapIdsRef.current);
        await setLastOpenedRoadmapId(normalized.id);
        setLastOpenedRoadmapIdState(normalized.id);
        return normalized;
      } finally {
        setGeneratingRoadmap(false);
      }
    },
    [generatingRoadmap],
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

  const pregenerateUpcomingLessons = useCallback(
    async (roadmap: GeneratedRoadmap, afterNodeId?: string, count = 2) => {
      if (!isServerConfigured()) return;
      const key = `pregen:${roadmap.id}`;
      if (pregenInFlight.current.has(key)) return;
      pregenInFlight.current.add(key);
      updatePregenActive();
      try {
        const result = await pregenerateServerRoadmapLessons({
          roadmapId: roadmap.id,
          fromNodeId: afterNodeId,
          count,
        });
        await persist(normalizeRoadmapEntityIds(result.roadmap));
        for (const nodeId of [...result.generated, ...result.reused]) {
          const node = findRoadmapNode(result.roadmap, nodeId);
          if (!node?.generatedLessonId) continue;
          const lesson = await getServerLesson(node.generatedLessonId);
          if (lesson) await saveGeneratedLesson(lesson);
        }
      } catch (err) {
        console.warn('[roadmap-pregen] server pregenerate failed', roadmap.id, err);
      } finally {
        pregenInFlight.current.delete(key);
        updatePregenActive();
      }
    },
    [persist, saveGeneratedLesson, updatePregenActive],
  );

  const pregenerateRoadmapLessons = useCallback(
    async (roadmapId: string, opts: { count?: number; fromNodeId?: string } = {}) => {
      if (!isServerConfigured()) return;
      let roadmap = roadmapsRef.current.find((r) => r.id === roadmapId);
      if (!roadmap) return;
      const remote = await fetchServerRoadmap(roadmapId);
      if (remote) {
        roadmap = mergeRoadmapPreservingLocalProgress(roadmap, remote);
        await persist(roadmap);
      }
      await pregenerateUpcomingLessons(roadmap, opts.fromNodeId, opts.count ?? 3);
    },
    [persist, pregenerateUpcomingLessons],
  );

  const startRoadmapLesson = useCallback(
    async (roadmapId: string, nodeId: string) => {
      if (!isServerConfigured()) {
        throw new ServerGenerationError(
          'Connect to the Microlearn server to generate lessons.',
          { code: 'SERVER_NOT_CONFIGURED' },
        );
      }
      let roadmap = getRoadmapById(roadmapId);
      if (!roadmap) throw new ServerGenerationError('Roadmap not found.');
      roadmap = normalizeRoadmapEntityIds(roadmap);
      const node = findRoadmapNode(roadmap, nodeId);
      if (!node) throw new ServerGenerationError('Lesson not found in roadmap.');
      if (node.status === 'locked') throw new ServerGenerationError('Complete prerequisites first.');
      if (node.status === 'generating') throw new ServerGenerationError('Lesson is still generating.');

      if (node.generatedLessonId) {
        await openRoadmap(roadmapId);
        void pregenerateUpcomingLessons(roadmap, node.id, 2);
        return { lessonId: node.generatedLessonId };
      }

      roadmap = setNodeStatus(roadmap, node.id, 'generating');
      await persist(roadmap);

      try {
        const result = await generateServerRoadmapNodeLesson({
          roadmapId,
          nodeId,
          subjectId: DEFAULT_SUBJECT,
        });
        await saveGeneratedLesson(result.lesson);
        const nextRoadmap = recalculateRoadmapStatuses(
          normalizeRoadmapEntityIds(result.roadmap),
          { preserveGenerating: true },
        );
        await persist(nextRoadmap);
        await openRoadmap(roadmapId);
        void pregenerateUpcomingLessons(nextRoadmap, node.id, 2);
        return { lessonId: result.lesson.id };
      } catch (e) {
        console.error('[roadmap-lesson] failed', roadmapId, nodeId, e);
        roadmap = setNodeStatus(roadmap, node.id, 'error');
        await persist(roadmap);
        throw e;
      }
    },
    [getRoadmapById, openRoadmap, persist, pregenerateUpcomingLessons, saveGeneratedLesson],
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
      if (outcome) await postServerOutcome(outcome).catch(() => false);
      const next = continueNode(roadmap);
      const syncResults = await Promise.allSettled([
        syncRoadmapNodeToBackend(roadmap, nodeId),
        ...(next ? [syncRoadmapNodeToBackend(roadmap, next.id)] : []),
      ]);
      const nodeSyncFailed = syncResults.some((result) => result.status === 'rejected');
      if (nodeSyncFailed) setSyncPending(true);
      void runBackendSyncCycle()
        .then(async (sync) => {
          setSyncPending(sync.syncPending);
          if (isServerConfigured()) {
            await refreshRoadmapById(roadmapId);
            await refreshRoadmaps();
          }
        })
        .catch(() => setSyncPending(true));
      void pregenerateUpcomingLessons(roadmap, nodeId, 2);
      void recordActivityEventSafe();
    },
    [
      getRoadmapById,
      persist,
      pregenerateUpcomingLessons,
      refreshRoadmapById,
      refreshRoadmaps,
    ],
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
