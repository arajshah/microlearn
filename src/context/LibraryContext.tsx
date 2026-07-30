import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState } from 'react-native';
import { generateLesson } from '@/ai/client';
import { MasteryLevel } from '@/data/mastery';
import { DEFAULT_PROVIDER } from '@/ai/providers';
import { getSubject } from '@/data/subjects';
import {
  AiConfig,
  GeneratedLesson,
  Lesson,
  Subject,
  SubjectId,
} from '@/types/content';
import { RoadmapLessonContext } from '@/types/roadmap';
import { GeneratedRoadmap } from '@/types/roadmap';
import {
  createServerLesson,
  deleteServerLesson,
  getServerLesson,
  isServerConfigured,
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

const CONFIG_KEY = 'microlearn.ai.config.v1';
const SECURE_KEY = 'microlearn_ai_api_key';

interface LibraryContextValue {
  config: AiConfig;
  hasKey: boolean;
  hydrated: boolean;
  syncPending: boolean;
  generatedLessons: GeneratedLesson[];
  saveConfig: (partial: Partial<AiConfig>) => Promise<void>;
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

const ENV_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';
const ENV_BASE_URL = process.env.EXPO_PUBLIC_AI_BASE_URL ?? '';
const ENV_MODEL = process.env.EXPO_PUBLIC_AI_MODEL ?? '';

const defaultConfig: AiConfig = {
  baseUrl: ENV_BASE_URL || DEFAULT_PROVIDER.baseUrl,
  model: ENV_MODEL || DEFAULT_PROVIDER.defaultModel,
  apiKey: ENV_KEY,
};

const LibraryContext = createContext<LibraryContextValue | undefined>(undefined);

function makeId(): string {
  return `gen-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AiConfig>(defaultConfig);
  const [generatedLessons, setGeneratedLessons] = useState<GeneratedLesson[]>([]);
  const [deletedLessonIds, setDeletedLessonIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [syncPending, setSyncPending] = useState(false);

  const applyLessons = useCallback(async (lessons: GeneratedLesson[], deletedIds: string[]) => {
    const normalized = normalizeGeneratedLessons(lessons);
    setGeneratedLessons(normalized);
    setDeletedLessonIds(deletedIds);
    await persistLessonsCache(normalized, deletedIds);
  }, []);

  const refreshFromBackend = useCallback(async () => {
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

  useEffect(() => {
    (async () => {
      try {
        const [rawConfig, key, pending] = await Promise.all([
          AsyncStorage.getItem(CONFIG_KEY),
          SecureStore.getItemAsync(SECURE_KEY).catch(() => null),
          readPendingMutations(),
        ]);
        const parsedConfig = rawConfig ? JSON.parse(rawConfig) : {};
        setConfig({
          baseUrl: parsedConfig.baseUrl ?? defaultConfig.baseUrl,
          model: parsedConfig.model ?? defaultConfig.model,
          apiKey: key ?? defaultConfig.apiKey,
        });
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
      if (state === 'active') void refreshFromBackend();
    });
    return () => sub.remove();
  }, [refreshFromBackend]);

  const saveConfig = useCallback<LibraryContextValue['saveConfig']>(
    async (partial) => {
      setConfig((prev) => {
        const next = { ...prev, ...partial };
        AsyncStorage.setItem(
          CONFIG_KEY,
          JSON.stringify({ baseUrl: next.baseUrl, model: next.model }),
        ).catch(() => {});
        if (partial.apiKey !== undefined) {
          if (partial.apiKey) {
            SecureStore.setItemAsync(SECURE_KEY, partial.apiKey).catch(() => {});
          } else {
            SecureStore.deleteItemAsync(SECURE_KEY).catch(() => {});
          }
        }
        return next;
      });
    },
    [],
  );

  const persistLessonToBackend = useCallback(
    async (lesson: GeneratedLesson, opts?: { roadmap?: GeneratedRoadmap }) => {
      if (!isServerConfigured()) {
        await enqueuePendingMutation('create_lesson', { lesson, roadmap: opts?.roadmap });
        setSyncPending(true);
        return lesson;
      }

      if (lesson.roadmapId && opts?.roadmap) {
        const sync = await ensureRoadmapSynced(opts.roadmap);
        if (!sync.ok) {
          console.warn('[lesson-save] roadmap not synced; queueing lesson', sync.errorMessage);
          await enqueuePendingMutation('create_lesson', { lesson, roadmap: opts.roadmap });
          setSyncPending(true);
          return lesson;
        }
      }

      const result = await createServerLesson({ lesson });
      if (!result.ok) {
        console.warn('[lesson-save] backend save failed; queueing lesson', result.errorMessage);
        await enqueuePendingMutation('create_lesson', { lesson, roadmap: opts?.roadmap });
        setSyncPending(true);
        return lesson;
      }
      return result.data ? normalizeGeneratedLesson(result.data) : lesson;
    },
    [],
  );

  const saveGeneratedLesson = useCallback<LibraryContextValue['saveGeneratedLesson']>(
    async (lesson, opts) => {
      const saved = await persistLessonToBackend(lesson, opts);
      setGeneratedLessons((prev) => {
        const idx = prev.findIndex((l) => l.id === saved.id);
        const next =
          idx === -1 ? [saved, ...prev] : prev.map((l, i) => (i === idx ? saved : l));
        persistLessonsCache(next, deletedLessonIds).catch(() => {});
        return next;
      });
    },
    [deletedLessonIds, persistLessonToBackend],
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
      roadmapContext,
      roadmapId,
      roadmapNodeId,
    }) => {
      const subject = getSubject(subjectId);
      if (!subject) throw new Error('Unknown subject.');
      const draft = await generateLesson(config, {
        subject,
        topic,
        masteryLevel,
        slideCount,
        sourceText,
        sourceUrl,
        sourceTitle,
        roadmapContext,
      });
      const lesson: GeneratedLesson = {
        ...draft,
        id: makeId(),
        subjectId,
        topic: topic.trim() || (sourceText ? draft.title : subject.title),
        createdAt: new Date().toISOString(),
        generated: true,
        roadmapId,
        roadmapNodeId,
        sourceUrl,
        sourceTitle,
      };
      const saved = await persistLessonToBackend(lesson);
      setGeneratedLessons((prev) => {
        const next = [saved, ...prev.filter((l) => l.id !== saved.id)];
        persistLessonsCache(next, deletedLessonIds).catch(() => {});
        return next;
      });
      return saved;
    },
    [config, deletedLessonIds, persistLessonToBackend],
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
      config,
      hasKey: Boolean(config.apiKey),
      hydrated,
      syncPending,
      generatedLessons,
      saveConfig,
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
    config,
    hydrated,
    syncPending,
    generatedLessons,
    saveConfig,
    generate,
    saveGeneratedLesson,
    deleteLesson,
    refreshFromBackend,
    resolveGeneratedLessonById,
  ]);

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryContextValue {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error('useLibrary must be used within a LibraryProvider');
  return ctx;
}
