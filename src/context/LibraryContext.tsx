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
import { generateLesson } from '@/ai/client';
import { MasteryLevel } from '@/data/mastery';
import { DEFAULT_PROVIDER } from '@/ai/providers';
import { getSubject } from '@/data/courses';
import { findLesson } from '@/data/courses';
import {
  AiConfig,
  GeneratedLesson,
  Lesson,
  Subject,
  SubjectId,
} from '@/types/content';
import { RoadmapLessonContext } from '@/types/roadmap';

const CONFIG_KEY = 'microlearn.ai.config.v1'; // baseUrl + model (not secret)
const LESSONS_KEY = 'microlearn.ai.lessons.v1';
const SECURE_KEY = 'microlearn_ai_api_key';

interface LibraryContextValue {
  config: AiConfig;
  hasKey: boolean;
  hydrated: boolean;
  generatedLessons: GeneratedLesson[];
  saveConfig: (partial: Partial<AiConfig>) => Promise<void>;
  generate: (args: {
    subjectId: SubjectId;
    topic: string;
    masteryLevel: MasteryLevel;
    sourceText?: string;
    sourceUrl?: string;
    sourceTitle?: string;
    roadmapContext?: RoadmapLessonContext;
    roadmapId?: string;
    roadmapNodeId?: string;
  }) => Promise<GeneratedLesson>;
  saveGeneratedLesson: (lesson: GeneratedLesson) => Promise<void>;
  deleteLesson: (id: string) => Promise<void>;
  getGenerated: (id: string) => GeneratedLesson | undefined;
  resolveLesson: (id: string) => { subject: Subject; lesson: Lesson } | undefined;
}

// Baked-in defaults from a git-ignored .env (EXPO_PUBLIC_* vars are inlined at
// build time). This lets the app work without ever typing a key in the UI.
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
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [rawConfig, rawLessons, key] = await Promise.all([
          AsyncStorage.getItem(CONFIG_KEY),
          AsyncStorage.getItem(LESSONS_KEY),
          SecureStore.getItemAsync(SECURE_KEY).catch(() => null),
        ]);
        const parsedConfig = rawConfig ? JSON.parse(rawConfig) : {};
        setConfig({
          baseUrl: parsedConfig.baseUrl ?? defaultConfig.baseUrl,
          model: parsedConfig.model ?? defaultConfig.model,
          // A user-entered key (secure store) wins; otherwise fall back to the
          // baked-in .env key so nothing needs to be typed in the app.
          apiKey: key ?? defaultConfig.apiKey,
        });
        if (rawLessons) setGeneratedLessons(JSON.parse(rawLessons));
      } catch {
        // keep defaults
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  const persistLessons = useCallback(async (next: GeneratedLesson[]) => {
    setGeneratedLessons(next);
    await AsyncStorage.setItem(LESSONS_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

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

  const saveGeneratedLesson = useCallback<LibraryContextValue['saveGeneratedLesson']>(
    async (lesson) => {
      setGeneratedLessons((prev) => {
        const idx = prev.findIndex((l) => l.id === lesson.id);
        const next =
          idx === -1 ? [lesson, ...prev] : prev.map((l, i) => (i === idx ? lesson : l));
        AsyncStorage.setItem(LESSONS_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [],
  );

  const generate = useCallback<LibraryContextValue['generate']>(
    async ({
      subjectId,
      topic,
      masteryLevel,
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
      setGeneratedLessons((prev) => {
        const next = [lesson, ...prev];
        AsyncStorage.setItem(LESSONS_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
      return lesson;
    },
    [config],
  );

  const deleteLesson = useCallback<LibraryContextValue['deleteLesson']>(
    async (id) => {
      setGeneratedLessons((prev) => {
        const next = prev.filter((l) => l.id !== id);
        AsyncStorage.setItem(LESSONS_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [],
  );

  const value = useMemo<LibraryContextValue>(() => {
    const getGenerated = (id: string) =>
      generatedLessons.find((l) => l.id === id);
    return {
      config,
      hasKey: Boolean(config.apiKey),
      hydrated,
      generatedLessons,
      saveConfig,
      generate,
      saveGeneratedLesson,
      deleteLesson,
      getGenerated,
      resolveLesson: (id: string) => {
        const gen = getGenerated(id);
        if (gen) {
          const subject = getSubject(gen.subjectId);
          if (subject) return { subject, lesson: gen };
        }
        const loc = findLesson(id);
        if (loc) return { subject: loc.subject, lesson: loc.lesson };
        return undefined;
      },
    };
  }, [config, hydrated, generatedLessons, saveConfig, generate, saveGeneratedLesson, deleteLesson]);

  return (
    <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
  );
}

export function useLibrary(): LibraryContextValue {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error('useLibrary must be used within a LibraryProvider');
  return ctx;
}
