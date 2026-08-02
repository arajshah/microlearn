import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
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
import { MasteryLevel } from '@/data/mastery';
import { getSubject } from '@/data/subjects';
import {
  GeneratedLesson,
  Lesson,
  Subject,
  SubjectId,
} from '@/types/content';
import { RoadmapLessonContext } from '@/types/roadmap';
import { GeneratedRoadmap } from '@/types/roadmap';
import {
  deleteServerLesson,
  generateServerLesson,
  getServerLesson,
  isServerConfigured,
  ServerGenerationError,
} from '@/services/microlearnServer';
import { ensureRoadmapSynced } from '@/services/roadmapSync';
import { unlinkRoadmapNodeAfterLessonDelete } from '@/services/roadmapLessonLink';
import {
  loadLessonsFromCache,
  persistLessonsCache,
  refreshLessonsFromBackend,
  runBackendSyncCycle,
} from '@/services/syncService';
import { enqueuePendingMutation, pendingDeletedLessonIds, readPendingMutations } from '@/storage/pendingMutations';
import { normalizeGeneratedLesson, normalizeGeneratedLessons } from '@/utils/normalizeLesson';

const LEGACY_AI_KEY = 'microlearn_ai_api_key';
const LEGACY_CONFIG_KEY = 'microlearn.ai.config.v1';

interface LibraryContextValue {
  hydrated: boolean;
  syncPending: boolean;
  serverConfigured: boolean;
  generatedLessons: GeneratedLesson[];
  generate: (args: {
    subjectId: SubjectId;
    topic: string;
    masteryLevel: MasteryLevel;
    slideCount?: number;
    sourceText?: string;
    sourceUrl?: string;
    sourceTitle?: string;
    roadmapContext?: RoadmapLessonContext;
    roadmapId?: string;
    roadmapNodeId?: string;
  }) => Promise<GeneratedLesson>;
  saveGeneratedLesson: (
    lesson: GeneratedLesson,
    opts?: { roadmap?: GeneratedRoadmap },
  ) => Promise<void>;
  deleteLesson: (id: string) => Promise<void>;
  refreshFromBackend: () => Promise<void>;
  getGenerated: (id: string) => GeneratedLesson | undefined;
  resolveGeneratedLessonById: (id: string) => Promise<GeneratedLesson | undefined>;
  resolveLesson: (id: string) => { subject: Subject; lesson: Lesson } | undefined;
}

const LibraryContext = createContext<LibraryContextValue | undefined>(undefined);

async function cleanupLegacyAiSecrets(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(LEGACY_AI_KEY);
  } catch {
    /* already removed or unavailable */
  }
  try {
    const raw = await AsyncStorage.getItem(LEGACY_CONFIG_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { baseUrl?: string; model?: string };
    await AsyncStorage.setItem(
      LEGACY_CONFIG_KEY,
      JSON.stringify({ baseUrl: parsed.baseUrl ?? '', model: parsed.model ?? '' }),
    );
  } catch {
    /* ignore */
  }
}

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [generatedLessons, setGeneratedLessons] = useState<GeneratedLesson[]>([]);
  const [deletedLessonIds, setDeletedLessonIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [syncPending, setSyncPending] = useState(false);
  const refreshInFlight = useRef<Promise<void> | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const serverConfigured = isServerConfigured();

  const applyLessons = useCallback(async (lessons: GeneratedLesson[], deletedIds: string[]) => {
    const normalized = normalizeGeneratedLessons(lessons);
    setGeneratedLessons(normalized);
    setDeletedLessonIds(deletedIds);
    await persistLessonsCache(normalized, deletedIds);
  }, []);

  const performBackendRefresh = useCallback(async () => {
    const pending = await readPendingMutations();
    const cached = await loadLessonsFromCache(pending);
    const merged = await refreshLessonsFromBackend(cached.lessons, cached.deletedIds);
    await applyLessons(merged, cached.deletedIds);
    const sync = await runBackendSyncCycle();
    setSyncPending(sync.syncPending);
    if (isServerConfigured()) {
      const afterPending = await readPendingMutations();
      const refreshed = await loadLessonsFromCache(afterPending);
      const finalLessons = await refreshLessonsFromBackend(refreshed.lessons, refreshed.deletedIds);
      await applyLessons(finalLessons, refreshed.deletedIds);
    }
  }, [applyLessons]);

  const refreshFromBackend = useCallback((): Promise<void> => {
    if (refreshInFlight.current) return refreshInFlight.current;
    const request = performBackendRefresh().finally(() => {
      if (refreshInFlight.current === request) refreshInFlight.current = null;
    });
    refreshInFlight.current = request;
    return request;
  }, [performBackendRefresh]);

  useEffect(() => {
    (async () => {
      try {
        await cleanupLegacyAiSecrets();
        const pending = await readPendingMutations();
        const cached = await loadLessonsFromCache(pending);
        setGeneratedLessons(cached.lessons);
        setDeletedLessonIds(cached.deletedIds);
        await refreshFromBackend();
      } catch {
        /* keep defaults */
      } finally {
        setHydrated(true);
      }
    })();
  }, [refreshFromBackend]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const wasBackgrounded = appStateRef.current === 'background' || appStateRef.current === 'inactive';
      appStateRef.current = state;
      if (wasBackgrounded && state === 'active') void refreshFromBackend().catch(() => {});
    });
    return () => sub.remove();
  }, [refreshFromBackend]);

  const cacheLesson = useCallback(
    async (lesson: GeneratedLesson) => {
      const saved = normalizeGeneratedLesson(lesson);
      setGeneratedLessons((prev) => {
        const idx = prev.findIndex((l) => l.id === saved.id);
        const next = idx === -1 ? [saved, ...prev] : prev.map((l, i) => (i === idx ? saved : l));
        persistLessonsCache(next, deletedLessonIds).catch(() => {});
        return next;
      });
      return saved;
    },
    [deletedLessonIds],
  );

  const saveGeneratedLesson = useCallback<LibraryContextValue['saveGeneratedLesson']>(
    async (lesson) => {
      await cacheLesson(lesson);
    },
    [cacheLesson],
  );

  const generate = useCallback<LibraryContextValue['generate']>(
    async ({
      subjectId,
      topic,
      masteryLevel,
      slideCount,
      sourceText,
      sourceUrl,
      sourceTitle,
    }) => {
      const subject = getSubject(subjectId);
      if (!subject) throw new Error('Unknown subject.');
      if (!isServerConfigured()) {
        throw new ServerGenerationError(
          'Connect to the Microlearn server to generate lessons.',
          { code: 'SERVER_NOT_CONFIGURED' },
        );
      }
      const lesson = await generateServerLesson({
        subjectId,
        subjectTitle: subject.title,
        topic,
        masteryLevel,
        slideCount,
        sourceText,
        sourceUrl,
        sourceTitle,
        idempotencyKey: `${subjectId}:${topic}:${Date.now()}`,
      });
      await cacheLesson(lesson);
      return lesson;
    },
    [cacheLesson],
  );

  const resolveGeneratedLessonById = useCallback<
    LibraryContextValue['resolveGeneratedLessonById']
  >(
    async (id: string) => {
      if (!id) return undefined;
      if (deletedLessonIds.includes(id)) return undefined;

      const pending = await readPendingMutations();
      if (pendingDeletedLessonIds(pending).has(id)) return undefined;

      const local = generatedLessons.find((l) => l.id === id);
      if (local) return normalizeGeneratedLesson(local);

      if (isServerConfigured()) {
        try {
          const server = await getServerLesson(id);
          if (server) return normalizeGeneratedLesson(server);
        } catch {
          /* treat as missing */
        }
      }

      return undefined;
    },
    [deletedLessonIds, generatedLessons],
  );

  const deleteLesson = useCallback<LibraryContextValue['deleteLesson']>(
    async (id) => {
      const lesson = generatedLessons.find((l) => l.id === id);
      const nextDeleted = [...new Set([...deletedLessonIds, id])];
      setDeletedLessonIds(nextDeleted);
      setGeneratedLessons((prev) => {
        const next = prev.filter((l) => l.id !== id);
        persistLessonsCache(next, nextDeleted).catch(() => {});
        return next;
      });
      if (lesson?.roadmapId && lesson.roadmapNodeId) {
        void unlinkRoadmapNodeAfterLessonDelete(lesson.roadmapId, lesson.roadmapNodeId).catch(
          () => {},
        );
      }
      if (isServerConfigured()) {
        const result = await deleteServerLesson(id);
        if (!result.ok) {
          await enqueuePendingMutation('delete_lesson', { id });
          setSyncPending(true);
        }
      } else {
        await enqueuePendingMutation('delete_lesson', { id });
        setSyncPending(true);
      }
    },
    [deletedLessonIds, generatedLessons],
  );

  const value = useMemo<LibraryContextValue>(() => {
    const getGenerated = (id: string) => generatedLessons.find((l) => l.id === id);
    return {
      hydrated,
      syncPending,
      serverConfigured,
      generatedLessons,
      generate,
      saveGeneratedLesson,
      deleteLesson,
      refreshFromBackend,
      getGenerated,
      resolveGeneratedLessonById,
      resolveLesson: (id: string) => {
        const gen = getGenerated(id);
        if (!gen) return undefined;
        const normalized = normalizeGeneratedLesson(gen);
        const subject = getSubject(normalized.subjectId);
        if (!subject) return undefined;
        return { subject, lesson: normalized };
      },
    };
  }, [
    deleteLesson,
    generate,
    generatedLessons,
    hydrated,
    refreshFromBackend,
    resolveGeneratedLessonById,
    saveGeneratedLesson,
    serverConfigured,
    syncPending,
  ]);

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryContextValue {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error('useLibrary must be used within LibraryProvider');
  return ctx;
}
