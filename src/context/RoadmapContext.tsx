import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AiError } from '@/ai/client';
import { generateRoadmap } from '@/ai/roadmap';
import {
  draftToGeneratedLesson,
  ensureLessonBlueprint,
  generateRoadmapLesson,
  persistRoadmapLessonArtifacts,
  prepareNextLessonBlueprint,
  prepareNextLessonFull,
} from '@/ai/roadmapLesson';
import { getLessonBlueprint } from '@/storage/lessonBlueprintStorage';
import { getGeneratedLessonVersion } from '@/storage/lessonVersionStorage';
import { LESSON_PROMPT_VERSION } from '@/types/lessonBlueprint';
import { buildLessonGenerationContext } from '@/utils/lessonContinuity';
import { useLibrary } from '@/context/LibraryContext';
import {
  deleteRoadmap as deleteStored,
  getAllRoadmaps,
  getLastOpenedRoadmapId,
  saveRoadmap,
  setLastOpenedRoadmapId,
  updateRoadmap as updateStored,
} from '@/storage/roadmaps';
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

interface RoadmapContextValue {
  roadmaps: GeneratedRoadmap[];
  hydrated: boolean;
  generatingRoadmap: boolean;
  lastOpenedRoadmap: GeneratedRoadmap | undefined;
  generateRoadmapFlow: (input: GenerateRoadmapInput) => Promise<GeneratedRoadmap>;
  refreshRoadmaps: () => Promise<void>;
  getRoadmapById: (id: string) => GeneratedRoadmap | undefined;
  openRoadmap: (id: string) => Promise<void>;
  deleteRoadmap: (id: string) => Promise<void>;
  startRoadmapLesson: (
    roadmapId: string,
    nodeId: string,
  ) => Promise<{ lessonId: string }>;
  onRoadmapLessonCompleted: (
    roadmapId: string,
    nodeId: string,
    outcome?: import('@/types/lessonOutcome').LessonOutcome,
  ) => Promise<void>;
  updateRoadmapLocal: (roadmap: GeneratedRoadmap) => Promise<void>;
}

const RoadmapContext = createContext<RoadmapContextValue | undefined>(undefined);

const DEFAULT_SUBJECT = 'computer-science';

export function RoadmapProvider({ children }: { children: React.ReactNode }) {
  const { config, saveGeneratedLesson, hasKey } = useLibrary();
  const [roadmaps, setRoadmaps] = useState<GeneratedRoadmap[]>([]);
  const [lastOpenedRoadmapId, setLastOpenedRoadmapIdState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [generatingRoadmap, setGeneratingRoadmap] = useState(false);
  const pregenInFlight = useRef<Set<string>>(new Set());

  const refreshRoadmaps = useCallback(async () => {
    const [all, lastId] = await Promise.all([getAllRoadmaps(), getLastOpenedRoadmapId()]);
    setRoadmaps(all);
    setLastOpenedRoadmapIdState(lastId && all.some((r) => r.id === lastId) ? lastId : null);
  }, []);

  useEffect(() => {
    refreshRoadmaps().finally(() => setHydrated(true));
  }, [refreshRoadmaps]);

  const persist = useCallback(async (roadmap: GeneratedRoadmap) => {
    await updateStored(roadmap);
    setRoadmaps((prev) => {
      const idx = prev.findIndex((r) => r.id === roadmap.id);
      if (idx === -1) return [roadmap, ...prev];
      return prev.map((r, i) => (i === idx ? roadmap : r));
    });
  }, []);

  const getRoadmapById = useCallback(
    (id: string) => roadmaps.find((r) => r.id === id),
    [roadmaps],
  );

  const generateRoadmapFlow = useCallback(
    async (input: GenerateRoadmapInput) => {
      if (generatingRoadmap) throw new AiError('Already generating a roadmap.');
      if (!hasKey) throw new AiError('Add your API key in Settings first.');
      setGeneratingRoadmap(true);
      try {
        const roadmap = await generateRoadmap(config, input);
        await saveRoadmap(roadmap);
        setRoadmaps((prev) => [roadmap, ...prev.filter((r) => r.id !== roadmap.id)]);
        await setLastOpenedRoadmapId(roadmap.id);
        setLastOpenedRoadmapIdState(roadmap.id);
        return roadmap;
      } finally {
        setGeneratingRoadmap(false);
      }
    },
    [config, generatingRoadmap, hasKey],
  );

  const openRoadmap = useCallback(async (id: string) => {
    await setLastOpenedRoadmapId(id);
    setLastOpenedRoadmapIdState(id);
  }, []);

  const deleteRoadmap = useCallback(async (id: string) => {
    await deleteStored(id);
    setRoadmaps((prev) => prev.filter((r) => r.id !== id));
    setLastOpenedRoadmapIdState((prev) => (prev === id ? null : prev));
  }, []);

  const lastOpenedRoadmap = useMemo(
    () => (lastOpenedRoadmapId ? roadmaps.find((r) => r.id === lastOpenedRoadmapId) : undefined),
    [lastOpenedRoadmapId, roadmaps],
  );

  const updateRoadmapLocal = useCallback(
    async (roadmap: GeneratedRoadmap) => {
      await persist(roadmap);
    },
    [persist],
  );

  const pregenerateNextLesson = useCallback(
    async (roadmap: GeneratedRoadmap, afterNodeId: string) => {
      const flat = allRoadmapLessons(roadmap);
      const idx = flat.findIndex((l) => l.id === afterNodeId);
      if (idx === -1) return;
      const next = flat.slice(idx + 1).find((l) => !l.generatedLessonId && l.status !== 'locked');
      if (!next) return;
      const key = `${roadmap.id}:${next.id}`;
      if (pregenInFlight.current.has(key)) return;
      pregenInFlight.current.add(key);
      const priorStatus = next.status;

      try {
        let working = setNodeStatus(roadmap, next.id, 'generating');
        await persist(working);

        const buildCtx = (rm: GeneratedRoadmap, nodeId: string) =>
          buildLessonGenerationContext(rm, nodeId);

        await prepareNextLessonBlueprint(config, roadmap, afterNodeId, buildCtx);

        const lesson = await prepareNextLessonFull(
          config,
          roadmap,
          afterNodeId,
          buildCtx,
          saveGeneratedLesson,
          DEFAULT_SUBJECT,
        );

        if (lesson) {
          const blueprint = await getLessonBlueprint(roadmap.id, next.id);
          working = setNodeStatus(working, next.id, priorStatus === 'active' ? 'active' : 'available', {
            generatedLessonId: lesson.id,
            blueprintId: blueprint?.id,
            blueprintVersion: blueprint?.version,
          });
        } else {
          working = setNodeStatus(roadmap, next.id, priorStatus);
        }
        working = recalculateRoadmapStatuses(working);
        await persist(working);
      } catch {
        const reverted = setNodeStatus(roadmap, next.id, priorStatus);
        await persist(reverted);
      } finally {
        pregenInFlight.current.delete(key);
      }
    },
    [config, persist, saveGeneratedLesson],
  );

  const startRoadmapLesson = useCallback(
    async (roadmapId: string, nodeId: string) => {
      let roadmap = getRoadmapById(roadmapId);
      if (!roadmap) throw new AiError('Roadmap not found.');
      const node = findRoadmapNode(roadmap, nodeId);
      if (!node) throw new AiError('Lesson not found in roadmap.');
      if (node.status === 'locked') throw new AiError('Complete prerequisites first.');
      if (node.status === 'generating') throw new AiError('Lesson is still generating.');

      if (node.generatedLessonId) {
        const version = await getGeneratedLessonVersion(roadmapId, nodeId);
        const stale = version
          ? version.promptVersion !== LESSON_PROMPT_VERSION ||
            (node.blueprintVersion != null &&
              version.blueprintVersion !== node.blueprintVersion)
          : false;
        if (!stale) {
          await openRoadmap(roadmapId);
          return { lessonId: node.generatedLessonId };
        }
      }

      roadmap = setNodeStatus(roadmap, nodeId, 'generating');
      await persist(roadmap);

      try {
        const ctx = await buildLessonGenerationContext(roadmap, nodeId);
        if (!ctx) throw new AiError('Could not build lesson context.');

        const draft = await generateRoadmapLesson(config, ctx, node, DEFAULT_SUBJECT);
        const blueprint =
          (await getLessonBlueprint(roadmap.id, nodeId)) ??
          (await ensureLessonBlueprint(config, ctx, nodeId, node));
        const lesson = draftToGeneratedLesson(draft, {
          subjectId: DEFAULT_SUBJECT,
          topic: node.title,
          roadmapId: roadmap.id,
          roadmapNodeId: nodeId,
          model: config.model,
          existingId: node.generatedLessonId,
        });

        await saveGeneratedLesson(lesson);
        await persistRoadmapLessonArtifacts(lesson, blueprint);

        roadmap = setNodeStatus(roadmap, nodeId, 'active', {
          generatedLessonId: lesson.id,
          blueprintId: blueprint.id,
          blueprintVersion: blueprint.version,
        });
        roadmap = recalculateRoadmapStatuses(roadmap, { preserveGenerating: true });
        await persist(roadmap);
        await openRoadmap(roadmapId);

        void pregenerateNextLesson(roadmap, nodeId);
        return { lessonId: lesson.id };
      } catch (e) {
        roadmap = setNodeStatus(roadmap, nodeId, 'error');
        await persist(roadmap);
        throw e;
      }
    },
    [
      config,
      getRoadmapById,
      openRoadmap,
      persist,
      pregenerateNextLesson,
      saveGeneratedLesson,
    ],
  );

  const onRoadmapLessonCompleted = useCallback(
    async (
      roadmapId: string,
      nodeId: string,
      _outcome?: import('@/types/lessonOutcome').LessonOutcome,
    ) => {
      let roadmap = getRoadmapById(roadmapId);
      if (!roadmap) return;
      roadmap = markNodeCompleted(roadmap, nodeId);
      await persist(roadmap);
    },
    [getRoadmapById, persist],
  );

  const value = useMemo<RoadmapContextValue>(
    () => ({
      roadmaps,
      hydrated,
      generatingRoadmap,
      lastOpenedRoadmap,
      generateRoadmapFlow,
      refreshRoadmaps,
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
      generatingRoadmap,
      lastOpenedRoadmap,
      generateRoadmapFlow,
      refreshRoadmaps,
      getRoadmapById,
      openRoadmap,
      deleteRoadmap,
      startRoadmapLesson,
      onRoadmapLessonCompleted,
      updateRoadmapLocal,
    ],
  );

  return (
    <RoadmapContext.Provider value={value}>{children}</RoadmapContext.Provider>
  );
}

export function useRoadmaps(): RoadmapContextValue {
  const ctx = useContext(RoadmapContext);
  if (!ctx) throw new Error('useRoadmaps must be used within RoadmapProvider');
  return ctx;
}

export { continueNode, findRoadmapNode };
export type { RoadmapLessonNode };
