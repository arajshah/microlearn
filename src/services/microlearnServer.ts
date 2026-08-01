import { MasteryLevel } from '@/data/mastery';
import { GeneratedLesson, SubjectId } from '@/types/content';
import { normalizeGeneratedLesson, unwrapLessonPayload } from '@/utils/normalizeLesson';
import {
  GeneratedRoadmap,
  RoadmapDepth,
  RoadmapLessonNode,
  RoadmapNodeStatus,
  RoadmapUnit,
} from '@/types/roadmap';
import { normalizeRoadmapEntityIds } from '@/utils/roadmapIds';
import { getApiToken } from '@/services/apiToken';

/**
 * Optional client for the local Microlearn control server (Phase 4/5).
 * When EXPO_PUBLIC_MICROLEARN_API_BASE_URL is unset, every function no-ops so
 * the app's existing AsyncStorage behavior is completely unchanged.
 *
 * The bearer token is read from the device keychain at request time; see
 * src/services/apiToken.ts.
 */

const RAW_BASE = process.env.EXPO_PUBLIC_MICROLEARN_API_BASE_URL?.trim();
const BASE_URL = RAW_BASE ? RAW_BASE.replace(/\/+$/, '') : '';
const REQUEST_TIMEOUT_MS = 8000;

const DEPTHS: RoadmapDepth[] = ['quick', 'standard', 'deep'];
const NODE_STATUSES: RoadmapNodeStatus[] = [
  'locked',
  'available',
  'active',
  'completed',
  'generating',
  'error',
];

/** True when the app is configured to talk to a local server. */
export function isServerConfigured(): boolean {
  return BASE_URL.length > 0;
}

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = await getApiToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function getJson<T>(path: string): Promise<T | null> {
  if (!isServerConfigured()) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: await authHeaders(),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T | null> {
  if (!isServerConfigured()) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function deleteJson<T>(path: string, body: unknown = {}): Promise<T | null> {
  if (!isServerConfigured()) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'DELETE',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function clampMastery(value: unknown): MasteryLevel {
  const n = typeof value === 'number' ? Math.round(value) : 3;
  const clamped = Math.min(5, Math.max(1, n));
  return clamped as MasteryLevel;
}

function coerceDepth(value: unknown): RoadmapDepth {
  return DEPTHS.includes(value as RoadmapDepth) ? (value as RoadmapDepth) : 'standard';
}

function coerceStatus(value: unknown): RoadmapNodeStatus {
  return NODE_STATUSES.includes(value as RoadmapNodeStatus)
    ? (value as RoadmapNodeStatus)
    : 'locked';
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
}

interface ServerNode {
  id: string;
  unitId?: string;
  title: string;
  shortDescription?: string;
  learningObjective?: string;
  estimatedMinutes?: number;
  difficulty?: number;
  order?: number;
  prerequisiteIds?: unknown;
  keyIdeas?: unknown;
  status?: unknown;
  generatedLessonId?: string;
}

interface ServerUnit {
  id: string;
  title: string;
  description?: string;
  order?: number;
  lessons?: ServerNode[];
}

interface ServerRoadmap {
  id: string;
  title: string;
  topic: string;
  goal: string;
  description?: string;
  masteryLevel?: number;
  depth?: string;
  status?: string;
  estimatedTotalMinutes?: number;
  createdAt?: string;
  units?: ServerUnit[];
}

function mapNode(node: ServerNode, unitId: string, index: number): RoadmapLessonNode {
  return {
    id: node.id,
    unitId: node.unitId ?? unitId,
    title: node.title,
    shortDescription: node.shortDescription ?? '',
    learningObjective: node.learningObjective ?? '',
    estimatedMinutes: node.estimatedMinutes ?? 0,
    difficulty: node.difficulty ?? 1,
    order: node.order ?? index,
    prerequisiteIds: toStringArray(node.prerequisiteIds),
    keyIdeas: toStringArray(node.keyIdeas),
    status: coerceStatus(node.status),
    generatedLessonId: node.generatedLessonId,
  };
}

function mapUnit(unit: ServerUnit, index: number): RoadmapUnit {
  return {
    id: unit.id,
    title: unit.title,
    description: unit.description ?? '',
    order: unit.order ?? index,
    lessons: (unit.lessons ?? []).map((n, i) => mapNode(n, unit.id, i)),
  };
}

/** Maps a server roadmap payload into the app's GeneratedRoadmap shape. */
export function mapServerRoadmap(server: ServerRoadmap): GeneratedRoadmap {
  return {
    id: server.id,
    title: server.title,
    topic: server.topic,
    goal: server.goal,
    description: server.description ?? '',
    masteryLevel: clampMastery(server.masteryLevel),
    depth: coerceDepth(server.depth),
    estimatedTotalMinutes: server.estimatedTotalMinutes ?? 0,
    createdAt: server.createdAt ?? new Date().toISOString(),
    units: (server.units ?? []).map((u, i) => mapUnit(u, i)),
  };
}

/** Fetches published server roadmaps. Returns [] when unavailable. */
export async function fetchServerRoadmaps(): Promise<GeneratedRoadmap[]> {
  return listServerRoadmaps();
}

/** Lists active server roadmaps (excludes deleted). */
export async function listServerRoadmaps(): Promise<GeneratedRoadmap[]> {
  const data = await getJson<{ roadmaps: ServerRoadmap[] }>('/api/roadmaps');
  if (!data?.roadmaps) return [];
  return data.roadmaps
    .filter((r) => (r as { status?: string }).status !== 'deleted')
    .map(mapServerRoadmap);
}

async function getJsonDetailed<T>(
  path: string,
): Promise<{ data: T | null; status: number; errorMessage?: string }> {
  if (!isServerConfigured()) {
    return { data: null, status: 0, errorMessage: 'Server not configured.' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: await authHeaders(),
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => null)) as T | { error?: { message?: string } } | null;
    if (!res.ok) {
      const msg =
        json && typeof json === 'object' && 'error' in json
          ? (json as { error?: { message?: string } }).error?.message
          : undefined;
      return { data: null, status: res.status, errorMessage: msg ?? `Request failed (${res.status}).` };
    }
    return { data: json as T, status: res.status };
  } catch {
    return { data: null, status: 0, errorMessage: 'Could not reach local server.' };
  } finally {
    clearTimeout(timer);
  }
}

/** Fetches one server roadmap by id, fully nested. Returns undefined when deleted/unavailable. */
export async function fetchServerRoadmap(id: string): Promise<GeneratedRoadmap | undefined> {
  if (!isServerConfigured()) return undefined;
  const result = await getJsonDetailed<{ roadmap: ServerRoadmap }>(
    `/api/roadmaps/${encodeURIComponent(id)}`,
  );
  if (!result.data?.roadmap) return undefined;
  if (result.data.roadmap.status === 'deleted') return undefined;
  return mapServerRoadmap(result.data.roadmap);
}

export type ServerRoadmapMeta = 'active' | 'deleted' | 'missing';

/** Lightweight existence check for cache reconciliation. */
export async function fetchServerRoadmapMeta(id: string): Promise<ServerRoadmapMeta> {
  const result = await getJsonDetailed<{ roadmap: ServerRoadmap }>(
    `/api/roadmaps/${encodeURIComponent(id)}`,
  );
  if (result.status === 404) return 'missing';
  if (!result.data?.roadmap) return 'missing';
  if (result.data.roadmap.status === 'deleted') return 'deleted';
  return 'active';
}

export async function deleteServerRoadmap(id: string): Promise<ServerMutationResult<{ id: string }>> {
  const result = await deleteJsonDetailed<{ roadmap: { id: string } }>(
    `/api/roadmaps/${encodeURIComponent(id)}`,
    { confirm: 'delete Microlearn roadmap' },
  );
  return result.ok
    ? { ok: true, data: result.data?.roadmap ?? { id } }
    : { ok: false, errorMessage: result.errorMessage };
}

export interface ServerMutationResult<T> {
  ok: boolean;
  data?: T;
  errorMessage?: string;
}

async function deleteJsonDetailed<T>(
  path: string,
  body: unknown,
): Promise<{ ok: boolean; data?: T; errorMessage?: string }> {
  if (!isServerConfigured()) {
    return { ok: false, errorMessage: 'Server not configured.' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'DELETE',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => null)) as T | { error?: { message?: string } } | null;
    if (!res.ok) {
      const msg =
        json && typeof json === 'object' && 'error' in json
          ? (json as { error?: { message?: string } }).error?.message
          : undefined;
      return { ok: false, errorMessage: msg ?? `Request failed (${res.status}).` };
    }
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, errorMessage: 'Could not reach local server.' };
  } finally {
    clearTimeout(timer);
  }
}

interface ServerGeneratedLessonRow {
  id: string;
  roadmapId?: string;
  lessonNodeId?: string;
  lesson: GeneratedLesson | Record<string, unknown>;
  subjectId?: string;
  topic?: string;
  title?: string;
  status?: string;
  model?: string;
  promptVersion?: string;
  createdAt?: string;
  updatedAt?: string;
}

export function mapServerLessonToApp(row: ServerGeneratedLessonRow): GeneratedLesson {
  const body = unwrapLessonPayload(row.lesson ?? {});
  return normalizeGeneratedLesson({
    ...body,
    id: row.id,
    title: row.title ?? body.title ?? 'Untitled lesson',
    subtitle: body.subtitle ?? '',
    minutes: body.minutes ?? 4,
    cards: body.cards ?? [],
    subjectId: (row.subjectId ?? body.subjectId ?? 'computer-science') as SubjectId,
    topic: row.topic ?? body.topic ?? '',
    createdAt: row.createdAt ?? body.createdAt ?? new Date().toISOString(),
    generated: true,
    roadmapId: row.roadmapId ?? body.roadmapId,
    roadmapNodeId: row.lessonNodeId ?? body.roadmapNodeId,
    model: row.model ?? body.model,
    promptVersion:
      typeof row.promptVersion === 'number' ? row.promptVersion : body.promptVersion,
    sourceUrl: body.sourceUrl,
    sourceTitle: body.sourceTitle,
  });
}

export async function listServerLessons(): Promise<GeneratedLesson[]> {
  const data = await getJson<{ lessons: ServerGeneratedLessonRow[] }>('/api/lessons');
  if (!data?.lessons) return [];
  return data.lessons
    .filter((l) => l.status !== 'deleted')
    .map(mapServerLessonToApp);
}

export async function getServerLesson(id: string): Promise<GeneratedLesson | null> {
  const data = await getJson<{ lesson: ServerGeneratedLessonRow }>(
    `/api/lessons/${encodeURIComponent(id)}`,
  );
  if (!data?.lesson || data.lesson.status === 'deleted') return null;
  return mapServerLessonToApp(data.lesson);
}

export async function createServerLesson(input: {
  lesson: GeneratedLesson;
}): Promise<ServerMutationResult<GeneratedLesson>> {
  const { lesson } = input;
  const result = await postJsonDetailed<{ lesson: ServerGeneratedLessonRow }>('/api/lessons', {
    id: lesson.id,
    subjectId: lesson.subjectId,
    topic: lesson.topic,
    title: lesson.title,
    roadmapId: lesson.roadmapId,
    lessonNodeId: lesson.roadmapNodeId,
    blueprintId: lesson.blueprintId,
    lessonJson: lesson,
    model: lesson.model,
    promptVersion: lesson.promptVersion != null ? String(lesson.promptVersion) : undefined,
  });
  if (!result.data?.lesson) {
    const msg = result.errorMessage ?? 'Failed to save lesson.';
    if (lesson.roadmapId && result.status === 404) {
      return {
        ok: false,
        errorMessage: msg.includes('Roadmap')
          ? msg
          : `Roadmap not found in backend. Sync this roadmap first. (${msg})`,
      };
    }
    console.warn('[lesson-save] backend POST /api/lessons failed', lesson.id, result.status, msg);
    return { ok: false, errorMessage: msg };
  }
  return { ok: true, data: mapServerLessonToApp(result.data.lesson) };
}

export async function deleteServerLesson(id: string): Promise<ServerMutationResult<{ id: string }>> {
  const result = await deleteJsonDetailed<{ lesson: { id: string } }>(
    `/api/lessons/${encodeURIComponent(id)}`,
    {},
  );
  return result.ok
    ? { ok: true, data: result.data?.lesson ?? { id } }
    : { ok: false, errorMessage: result.errorMessage };
}

export async function createServerRoadmap(
  roadmap: GeneratedRoadmap,
): Promise<ServerMutationResult<GeneratedRoadmap>> {
  const payload = {
    id: roadmap.id,
    title: roadmap.title,
    topic: roadmap.topic,
    goal: roadmap.goal,
    description: roadmap.description,
    masteryLevel: roadmap.masteryLevel,
    depth: roadmap.depth,
    status: 'published' as const,
    estimatedTotalMinutes: roadmap.estimatedTotalMinutes,
    units: roadmap.units.map((unit) => ({
      id: unit.id,
      title: unit.title,
      description: unit.description,
      order: unit.order,
      lessons: unit.lessons.map((node) => ({
        id: node.id,
        title: node.title,
        shortDescription: node.shortDescription,
        learningObjective: node.learningObjective,
        estimatedMinutes: node.estimatedMinutes,
        difficulty: node.difficulty,
        order: node.order,
        prerequisiteIds: node.prerequisiteIds,
        keyIdeas: node.keyIdeas,
        status: node.status,
        generatedLessonId: node.generatedLessonId,
      })),
    })),
  };
  const result = await postJsonDetailed<{ roadmap: ServerRoadmap }>('/api/roadmaps', payload);
  if (!result.data?.roadmap) {
    return { ok: false, errorMessage: result.errorMessage ?? 'Failed to save roadmap.' };
  }
  return { ok: true, data: mapServerRoadmap(result.data.roadmap) };
}

export interface RoadmapNodePatch {
  status?: RoadmapNodeStatus;
  generatedLessonId?: string | null;
}

async function patchJsonDetailed<T>(
  path: string,
  body: unknown,
): Promise<{ data: T | null; status: number; errorMessage?: string }> {
  if (!isServerConfigured()) {
    return { data: null, status: 0, errorMessage: 'Server not configured.' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'PATCH',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => null)) as T | { error?: { message?: string } } | null;
    if (!res.ok) {
      const msg =
        json && typeof json === 'object' && 'error' in json
          ? (json as { error?: { message?: string } }).error?.message
          : undefined;
      return { data: null, status: res.status, errorMessage: msg ?? `Request failed (${res.status}).` };
    }
    return { data: json as T, status: res.status };
  } catch {
    return { data: null, status: 0, errorMessage: 'Could not reach local server.' };
  } finally {
    clearTimeout(timer);
  }
}

export async function patchServerRoadmapNode(
  roadmapId: string,
  nodeId: string,
  patch: RoadmapNodePatch,
): Promise<ServerMutationResult<GeneratedRoadmap>> {
  const result = await patchJsonDetailed<{ roadmap: ServerRoadmap }>(
    `/api/roadmaps/${encodeURIComponent(roadmapId)}/nodes/${encodeURIComponent(nodeId)}`,
    patch,
  );
  if (!result.data?.roadmap) {
    return { ok: false, errorMessage: result.errorMessage ?? 'Failed to update roadmap node.' };
  }
  return { ok: true, data: mapServerRoadmap(result.data.roadmap) };
}

/** Fetches a generated lesson payload by id. Returns the raw lesson object or null. */
export async function fetchServerLesson(lessonId: string): Promise<unknown | null> {
  const lesson = await getServerLesson(lessonId);
  return lesson ?? null;
}

/** Posts a lesson outcome to the server. Fire-and-forget safe; returns null on failure. */
export async function postServerOutcome(outcome: import('@/types/lessonOutcome').LessonOutcome): Promise<boolean> {
  if (!isServerConfigured()) return false;
  const result = await postJson<{ outcome: unknown }>('/api/outcomes', {
    roadmapId: outcome.roadmapId,
    lessonNodeId: outcome.roadmapNodeId,
    lessonId: outcome.lessonId,
    completedAt: outcome.completedAt,
    outcome: {
      objective: outcome.objective,
      conceptsCovered: outcome.conceptsCovered,
      completedAt: outcome.completedAt,
      totalQuestions: outcome.totalQuestions,
      correctAnswers: outcome.correctAnswers,
      accuracy: outcome.accuracy,
      mistakes: outcome.mistakes,
      observedMisconceptions: outcome.observedMisconceptions,
      unresolvedQuestions: outcome.unresolvedQuestions,
      masteryEstimate: outcome.masteryEstimate,
    },
  });
  return result !== null;
}

export interface ServerSourceSummary {
  charCount: number;
  wordCount: number;
  preview: string;
  detectedSections?: string[];
}

export interface ServerSourceDocument {
  id: string;
  url: string;
  normalizedUrl: string;
  sourceType: string;
  title?: string;
  filename?: string;
  mimeType?: string;
  sizeBytes?: number;
  status: 'pending' | 'extracting' | 'ready' | 'failed';
  summary?: ServerSourceSummary;
  metadata?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
  extractedTextPreview?: string;
  extractedText?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UploadDocumentFile {
  uri: string;
  name: string;
  mimeType?: string;
}

export interface ExtractSourceResult {
  source: ServerSourceDocument | null;
  ok: boolean;
  errorMessage?: string;
}

async function postJsonDetailed<T>(
  path: string,
  body: unknown,
): Promise<{ data: T | null; status: number; errorMessage?: string }> {
  if (!isServerConfigured()) {
    return { data: null, status: 0, errorMessage: 'Server not configured.' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => null)) as T | { error?: { message?: string } } | null;
    if (!res.ok) {
      const msg =
        json && typeof json === 'object' && 'error' in json
          ? (json as { error?: { message?: string } }).error?.message
          : undefined;
      return { data: null, status: res.status, errorMessage: msg ?? `Request failed (${res.status}).` };
    }
    return { data: json as T, status: res.status };
  } catch {
    return { data: null, status: 0, errorMessage: 'Could not reach local server.' };
  } finally {
    clearTimeout(timer);
  }
}

/** Extract a public document URL via the local server. */
export async function extractServerDocumentSource(
  url: string,
  force = false,
): Promise<ExtractSourceResult> {
  const result = await postJsonDetailed<{ source: ServerSourceDocument }>('/api/sources/extract', {
    url,
    force,
  });
  if (!result.data?.source) {
    return { source: null, ok: false, errorMessage: result.errorMessage };
  }
  const source = result.data.source;
  return {
    source,
    ok: source.status === 'ready',
    errorMessage: source.status === 'failed' ? source.errorMessage : result.errorMessage,
  };
}

/** Upload and extract a local PDF, TXT, or Markdown file via the local server. */
export async function uploadDocumentSource(file: UploadDocumentFile): Promise<ExtractSourceResult> {
  if (!isServerConfigured()) {
    return { source: null, ok: false, errorMessage: 'Server not configured.' };
  }

  const formData = new FormData();
  formData.append('file', {
    uri: file.uri,
    name: file.name,
    type: file.mimeType ?? 'application/octet-stream',
  } as unknown as Blob);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const res = await fetch(`${BASE_URL}/api/sources/upload`, {
      method: 'POST',
      headers: await authHeaders(),
      body: formData,
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => null)) as
      | { source?: ServerSourceDocument; error?: { message?: string } }
      | null;
    const source = json?.source ?? null;
    if (!res.ok) {
      return {
        source,
        ok: false,
        errorMessage: source?.errorMessage ?? json?.error?.message ?? `Upload failed (${res.status}).`,
      };
    }
    return {
      source,
      ok: source?.status === 'ready',
      errorMessage: source?.status === 'failed' ? source.errorMessage : undefined,
    };
  } catch {
    return { source: null, ok: false, errorMessage: 'Could not reach local server.' };
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch source document metadata or full text from server. */
export async function fetchServerDocumentSource(
  sourceId: string,
  includeText = false,
): Promise<ServerSourceDocument | null> {
  const q = includeText ? '?includeText=true' : '';
  const data = await getJson<{ source: ServerSourceDocument }>(
    `/api/sources/${encodeURIComponent(sourceId)}${q}`,
  );
  return data?.source ?? null;
}

/** Formats server-extracted source text for AI prompts. */
export function formatServerSourceAsText(
  source: ServerSourceDocument,
  extractedText: string,
  focus?: string,
): string {
  const header = [
    `# Source: ${source.title ?? source.url}`,
    source.url,
    source.summary?.wordCount ? `Words: ${source.summary.wordCount}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const focusLine = focus?.trim() ? `\n\nFocus: ${focus.trim()}` : '';
  return `${header}\n\n${extractedText.trim()}${focusLine}`;
}

export type ServerRetrievalRating = 'forgot' | 'partial' | 'remembered' | 'easy';

export interface ServerRetrievalItem {
  id: string;
  reviewSetId?: string;
  reviewSetTitle?: string;
  roadmapId?: string;
  lessonNodeId?: string;
  lessonId?: string;
  itemType: string;
  prompt: string;
  answer?: string;
  explanation?: string;
  choices?: string[];
  concept?: string;
  status: string;
  dueAt: string;
  reps: number;
  lapses: number;
  ease: number;
  intervalDays: number;
}

export type ServerRetrievalScheduleItem = Omit<ServerRetrievalItem, 'answer' | 'explanation'>;

export interface ServerReviewSet {
  id: string;
  lessonId: string;
  roadmapId?: string;
  lessonNodeId?: string;
  title: string;
  strategy: string;
  status: string;
  dueAt: string;
  itemCount?: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ServerRetrievalSummary {
  activeCount: number;
  dueCount: number;
  masteredCount: number;
  weakConcepts: Array<{ concept: string; lapses: number }>;
  recentAttempts: unknown[];
  nextDueAt?: string;
}

export interface ServerRetrievalSession {
  id: string;
  roadmapId?: string;
  startedAt: string;
  endedAt?: string;
  totalItems: number;
  rememberedCount: number;
  partialCount: number;
  forgotCount: number;
}

async function patchJson<T>(path: string, body: unknown): Promise<T | null> {
  if (!isServerConfigured()) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'PATCH',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function getDueRetrievalItems(params?: {
  roadmapId?: string;
  limit?: number;
}): Promise<ServerRetrievalItem[]> {
  const q = new URLSearchParams();
  if (params?.roadmapId) q.set('roadmapId', params.roadmapId);
  if (params?.limit) q.set('limit', String(params.limit));
  const suffix = q.toString() ? `?${q.toString()}` : '';
  const data = await getJson<{ items: ServerRetrievalItem[] }>(`/api/retrieval/due${suffix}`);
  return data?.items ?? [];
}

export async function getRetrievalSchedule(params?: {
  days?: number;
  roadmapId?: string;
}): Promise<ServerRetrievalScheduleItem[]> {
  const q = new URLSearchParams();
  if (params?.days) q.set('days', String(params.days));
  if (params?.roadmapId) q.set('roadmapId', params.roadmapId);
  const suffix = q.toString() ? `?${q.toString()}` : '';
  const data = await getJson<{ items: ServerRetrievalScheduleItem[] }>(
    `/api/retrieval/schedule${suffix}`,
  );
  return data?.items ?? [];
}

export async function getRetrievalSummary(params?: {
  roadmapId?: string;
}): Promise<ServerRetrievalSummary | null> {
  const q = params?.roadmapId ? `?roadmapId=${encodeURIComponent(params.roadmapId)}` : '';
  const data = await getJson<{ summary: ServerRetrievalSummary }>(`/api/retrieval/summary${q}`);
  return data?.summary ?? null;
}

export async function seedRetrievalItems(input: {
  lessonId: string;
  roadmapId?: string;
  lessonNodeId?: string;
  lesson?: unknown;
  force?: boolean;
}): Promise<boolean> {
  const result = await postJson<{ result: unknown }>('/api/retrieval/items/seed', input);
  return result !== null;
}

export async function createReviewSetFromLesson(input: {
  lessonId: string;
  lesson: unknown;
  roadmapId?: string;
  lessonNodeId?: string;
  force?: boolean;
}): Promise<{
  ok: boolean;
  reviewSet?: ServerReviewSet;
  items?: ServerRetrievalItem[];
  created?: number;
  existing?: number;
  totalCandidates?: number;
  errorMessage?: string;
}> {
  const result = await postJsonDetailed<{
    reviewSet: ServerReviewSet | null;
    items: ServerRetrievalItem[];
    created: number;
    existing: number;
    totalCandidates: number;
  }>('/api/retrieval/review-sets', input);
  return {
    ok: result.data !== null,
    reviewSet: result.data?.reviewSet ?? undefined,
    items: result.data?.items,
    created: result.data?.created,
    existing: result.data?.existing,
    totalCandidates: result.data?.totalCandidates,
    errorMessage: result.errorMessage,
  };
}

export async function createRetrievalSession(
  itemIds: string[],
  roadmapId?: string,
): Promise<{ session: ServerRetrievalSession; items: ServerRetrievalItem[] } | null> {
  return postJson<{ session: ServerRetrievalSession; items: ServerRetrievalItem[] }>(
    '/api/retrieval/sessions',
    { itemIds, roadmapId },
  );
}

export async function recordRetrievalAttempt(input: {
  sessionId?: string;
  itemId: string;
  rating: ServerRetrievalRating;
  responseText?: string;
  correct?: boolean;
  durationMs?: number;
}): Promise<{ item: ServerRetrievalItem; unlocked?: string[] } | null> {
  return postJson<{ item: ServerRetrievalItem; unlocked?: string[] }>('/api/retrieval/attempts', input);
}

export async function finishRetrievalSession(
  sessionId: string,
): Promise<ServerRetrievalSession | null> {
  const data = await patchJson<{ session: ServerRetrievalSession }>(
    `/api/retrieval/sessions/${encodeURIComponent(sessionId)}/finish`,
    {},
  );
  return data?.session ?? null;
}

export async function deleteReviewSet(
  reviewSetId: string,
): Promise<ServerMutationResult<{ ok: boolean; reviewSetId: string }>> {
  const result = await deleteJsonDetailed<{ ok: boolean; reviewSetId: string }>(
    `/api/retrieval/review-sets/${encodeURIComponent(reviewSetId)}`,
    {},
  );
  return result.ok
    ? { ok: true, data: result.data ?? { ok: true, reviewSetId } }
    : { ok: false, errorMessage: result.errorMessage };
}

export async function deleteRetrievalItem(
  itemId: string,
): Promise<ServerMutationResult<{ ok: boolean; itemId: string }>> {
  const result = await deleteJsonDetailed<{ ok: boolean; itemId: string }>(
    `/api/retrieval/items/${encodeURIComponent(itemId)}`,
    {},
  );
  return result.ok
    ? { ok: true, data: result.data ?? { ok: true, itemId } }
    : { ok: false, errorMessage: result.errorMessage };
}

export async function cleanupDemoRetrievalOnServer(): Promise<boolean> {
  const result = await postJson<{ ok: boolean }>('/api/retrieval/cleanup-demo', {});
  return result?.ok === true;
}

export interface ServerAchievement {
  id: string;
  key: string;
  title: string;
  description: string;
  category: string;
  tier: string;
  icon?: string;
  accent?: string;
  unlocked: boolean;
  unlockedAt?: string;
  progressValue?: number;
}

export interface ServerDailyActivity {
  day: string;
  lessonsCompleted: number;
  retrievalItemsReviewed: number;
  retrievalRemembered: number;
  retrievalPartial: number;
  retrievalForgot: number;
  xpEarned: number;
  activeMinutes: number;
  roadmapProgressEvents: number;
}

export interface ServerProfileSummary {
  xp: number;
  streaks: {
    study: { current: number; best: number; lastActiveDay?: string };
    retrieval: { current: number; best: number; lastActiveDay?: string };
  };
  achievements: {
    unlockedCount: number;
    totalCount: number;
    recent: ServerAchievement[];
  };
  retrieval: {
    reviewedCount: number;
    masteredCount: number;
    dueCount: number;
    rememberedRate?: number;
  };
  roadmaps: {
    activeCount: number;
    completedCount: number;
  };
  activity: {
    today: ServerDailyActivity;
    last7Days: ServerDailyActivity[];
  };
}

export async function getProfileSummary(): Promise<ServerProfileSummary | null> {
  const data = await getJson<{ summary: ServerProfileSummary }>('/api/profile/summary');
  return data?.summary ?? null;
}

export async function getAchievements(params?: {
  category?: string;
  unlockedOnly?: boolean;
}): Promise<ServerAchievement[]> {
  const q = new URLSearchParams();
  if (params?.category) q.set('category', params.category);
  if (params?.unlockedOnly) q.set('unlockedOnly', 'true');
  const suffix = q.toString() ? `?${q.toString()}` : '';
  const data = await getJson<{ achievements: ServerAchievement[] }>(`/api/achievements${suffix}`);
  return data?.achievements ?? [];
}

export async function getDailyActivity(days = 14): Promise<ServerDailyActivity[]> {
  const data = await getJson<{ activity: ServerDailyActivity[] }>(
    `/api/activity?days=${encodeURIComponent(String(days))}`,
  );
  return data?.activity ?? [];
}

export async function recordActivityEvent(input: {
  eventType:
    | 'lesson_completed'
    | 'retrieval_completed'
    | 'roadmap_started'
    | 'roadmap_completed'
    | 'creation_completed';
  event?: Record<string, unknown>;
}): Promise<boolean> {
  const result = await postJson<{ ok: boolean }>('/api/activity', input);
  return result !== null;
}

/* ---------------- Adaptive Learning v1 ---------------- */

export interface ServerConceptMastery {
  conceptSlug: string;
  name?: string;
  subjectId?: string;
  topic?: string;
  masteryScore: number;
  confidenceScore: number;
  exposureCount: number;
  correctCount: number;
  incorrectCount: number;
  streakCorrect: number;
  lastSeenAt?: string;
  nextReviewAt?: string;
  trend: 'improving' | 'declining' | 'stable' | 'unknown';
  updatedAt: string;
}

export interface ServerWeakness {
  id: string;
  conceptSlug: string;
  weaknessTag: string;
  severity: number;
  status: 'active' | 'resolved' | 'ignored';
  evidenceEventIds: string[];
  evidenceSummary?: string;
  recommendedAction?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ServerNextAction {
  action:
    | 'continue_lesson'
    | 'review_due_concepts'
    | 'generate_remediation'
    | 'run_diagnostic'
    | 'start_new_roadmap';
  reason: string;
  evidence: Record<string, unknown>;
  roadmapId?: string;
  lessonNodeId?: string;
  conceptSlug?: string;
}

export interface ServerLearningSnapshot {
  id?: string;
  snapshotType: string;
  title: string;
  summary: string;
  stats: {
    lessonsCompleted: number;
    cardsAnswered: number;
    accuracy: number | null;
    activeConcepts: number;
    weakConcepts: number;
    dueReviews: number;
  };
  recentActivity: Array<{
    eventId: string;
    eventType: string;
    timestamp: string;
    conceptSlug?: string;
    lessonId?: string;
    correct?: boolean;
  }>;
  strongestConcepts: Array<{ conceptSlug: string; masteryScore: number; trend: string }>;
  weakestConcepts: Array<{ conceptSlug: string; masteryScore: number; incorrectCount: number }>;
  dueReviews: Array<{ conceptSlug: string; nextReviewAt?: string; masteryScore: number }>;
  openRemediations: Array<{ id: string; conceptSlug: string; severity: number; status: string }>;
  recommendedNextActions: ServerNextAction[];
  createdAt: string;
}

export interface ServerDiagnosticItem {
  id: string;
  sessionId: string;
  conceptSlug: string;
  question: string;
  options: string[];
  answerIndex: number;
  explanation?: string;
  difficulty?: number;
  answeredCorrectly?: boolean;
  selectedIndex?: number;
}

export interface ServerDiagnosticSession {
  id: string;
  roadmapId?: string;
  topic: string;
  status: 'started' | 'completed' | 'abandoned';
  startedAt: string;
  completedAt?: string;
  items: ServerDiagnosticItem[];
}

/** POSTs one learning event. Returns false when the server is unreachable. */
export async function postLearningEvent(event: unknown): Promise<boolean> {
  const result = await postJson<{ recorded: number }>('/api/learning/events', event);
  return result !== null;
}

/** POSTs a batch of learning events. Returns false when the server is unreachable. */
export async function postLearningEventsBatch(events: unknown[]): Promise<boolean> {
  if (events.length === 0) return true;
  const result = await postJson<{ recorded: number }>('/api/learning/events/batch', { events });
  return result !== null;
}

export async function fetchLearningState(params?: {
  limit?: number;
}): Promise<ServerLearningSnapshot | null> {
  const q = params?.limit ? `?limit=${encodeURIComponent(String(params.limit))}` : '';
  const data = await getJson<{ snapshot: ServerLearningSnapshot }>(
    `/api/learning/snapshot/current${q}`,
  );
  return data?.snapshot ?? null;
}

export async function fetchConceptMastery(params?: {
  sort?: 'weakest' | 'strongest' | 'recent' | 'due';
  limit?: number;
}): Promise<ServerConceptMastery[]> {
  const q = new URLSearchParams();
  if (params?.sort) q.set('sort', params.sort);
  if (params?.limit) q.set('limit', String(params.limit));
  const suffix = q.toString() ? `?${q.toString()}` : '';
  const data = await getJson<{ mastery: ServerConceptMastery[] }>(`/api/learning/mastery${suffix}`);
  return data?.mastery ?? [];
}

export async function fetchWeaknesses(params?: {
  status?: 'active' | 'resolved' | 'ignored';
  limit?: number;
}): Promise<ServerWeakness[]> {
  const q = new URLSearchParams();
  if (params?.status) q.set('status', params.status);
  if (params?.limit) q.set('limit', String(params.limit));
  const suffix = q.toString() ? `?${q.toString()}` : '';
  const data = await getJson<{ weaknesses: ServerWeakness[] }>(`/api/learning/weaknesses${suffix}`);
  return data?.weaknesses ?? [];
}

export async function fetchDueReviews(limit = 20): Promise<ServerConceptMastery[]> {
  const data = await getJson<{ concepts: ServerConceptMastery[] }>(
    `/api/learning/reviews/due?limit=${encodeURIComponent(String(limit))}`,
  );
  return data?.concepts ?? [];
}

export async function createDiagnosticSession(input: {
  roadmapId?: string;
  topic?: string;
  conceptCount?: number;
}): Promise<ServerDiagnosticSession | null> {
  const data = await postJson<{ session: ServerDiagnosticSession }>(
    '/api/diagnostics/sessions',
    input,
  );
  return data?.session ?? null;
}

export async function listDiagnosticSessions(params?: {
  roadmapId?: string;
  status?: 'started' | 'completed' | 'abandoned';
  limit?: number;
}): Promise<Array<{ id: string; status: string; topic: string }>> {
  const q = new URLSearchParams();
  if (params?.roadmapId) q.set('roadmapId', params.roadmapId);
  if (params?.status) q.set('status', params.status);
  if (params?.limit) q.set('limit', String(params.limit));
  const suffix = q.toString() ? `?${q.toString()}` : '';
  const data = await getJson<{ sessions: Array<{ id: string; status: string; topic: string }> }>(
    `/api/diagnostics/sessions${suffix}`,
  );
  return data?.sessions ?? [];
}

export async function submitDiagnosticAnswer(input: {
  sessionId: string;
  itemId: string;
  selectedIndex: number;
  responseTimeMs?: number;
}): Promise<{ correct: boolean; conceptSlug: string; explanation?: string } | null> {
  return postJson<{ correct: boolean; conceptSlug: string; explanation?: string }>(
    `/api/diagnostics/sessions/${encodeURIComponent(input.sessionId)}/answer`,
    {
      itemId: input.itemId,
      selectedIndex: input.selectedIndex,
      responseTimeMs: input.responseTimeMs,
    },
  );
}

export async function finishDiagnosticSession(sessionId: string): Promise<{
  accuracy: number | null;
  strengths: string[];
  weaknesses: string[];
} | null> {
  const data = await patchJson<{
    result: { accuracy: number | null; strengths: string[]; weaknesses: string[] };
  }>(`/api/diagnostics/sessions/${encodeURIComponent(sessionId)}/finish`, {});
  return data?.result ?? null;
}

export async function recommendRemediation(input?: {
  roadmapId?: string;
  severityMin?: number;
}): Promise<number> {
  const data = await postJson<{ created: unknown[] }>('/api/remediation/recommend', input ?? {});
  return data?.created?.length ?? 0;
}
