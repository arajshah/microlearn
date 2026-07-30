import type {
  RetrievalAttemptRow,
  RetrievalItemRow,
  RetrievalRating,
  RetrievalSessionRow,
  ReviewSetRow,
} from './retrievalTypes';

export interface SerializedRetrievalItem {
  id: string;
  reviewSetId?: string;
  reviewSetTitle?: string;
  roadmapId?: string;
  lessonNodeId?: string;
  lessonId?: string;
  sourceType: string;
  sourceRef?: string;
  itemType: string;
  prompt: string;
  answer?: string;
  explanation?: string;
  choices?: string[];
  concept?: string;
  difficulty?: number;
  status: string;
  dueAt: string;
  lastReviewedAt?: string;
  reps: number;
  lapses: number;
  ease: number;
  intervalDays: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SerializedReviewSet {
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

export interface SerializedRetrievalSession {
  id: string;
  roadmapId?: string;
  startedAt: string;
  endedAt?: string;
  totalItems: number;
  rememberedCount: number;
  partialCount: number;
  forgotCount: number;
  metadata?: Record<string, unknown>;
}

export interface SerializedRetrievalAttempt {
  id: string;
  sessionId?: string;
  itemId: string;
  rating: RetrievalRating;
  responseText?: string;
  correct?: boolean;
  durationMs?: number;
  previousDueAt?: string;
  nextDueAt?: string;
  createdAt: string;
}

function parseMeta(json: string | null): Record<string, unknown> | undefined {
  if (!json) return undefined;
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function parseChoices(json: string | null): string[] | undefined {
  if (!json) return undefined;
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : undefined;
  } catch {
    return undefined;
  }
}

export function serializeRetrievalItem(
  row: RetrievalItemRow & { review_set_title?: string | null },
): SerializedRetrievalItem {
  return {
    id: row.id,
    reviewSetId: row.review_set_id ?? undefined,
    reviewSetTitle: row.review_set_title ?? undefined,
    roadmapId: row.roadmap_id ?? undefined,
    lessonNodeId: row.lesson_node_id ?? undefined,
    lessonId: row.lesson_id ?? undefined,
    sourceType: row.source_type,
    sourceRef: row.source_ref ?? undefined,
    itemType: row.item_type,
    prompt: row.prompt,
    answer: row.answer ?? undefined,
    explanation: row.explanation ?? undefined,
    choices: parseChoices(row.choices_json),
    concept: row.concept ?? undefined,
    difficulty: row.difficulty ?? undefined,
    status: row.status,
    dueAt: row.due_at,
    lastReviewedAt: row.last_reviewed_at ?? undefined,
    reps: row.reps,
    lapses: row.lapses,
    ease: row.ease,
    intervalDays: row.interval_days,
    metadata: parseMeta(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializeReviewSet(
  row: ReviewSetRow & { item_count?: number },
): SerializedReviewSet {
  return {
    id: row.id,
    lessonId: row.lesson_id,
    roadmapId: row.roadmap_id ?? undefined,
    lessonNodeId: row.lesson_node_id ?? undefined,
    title: row.title,
    strategy: row.strategy,
    status: row.status,
    dueAt: row.due_at,
    itemCount: row.item_count,
    metadata: parseMeta(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializeRetrievalSession(row: RetrievalSessionRow): SerializedRetrievalSession {
  return {
    id: row.id,
    roadmapId: row.roadmap_id ?? undefined,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    totalItems: row.total_items,
    rememberedCount: row.remembered_count,
    partialCount: row.partial_count,
    forgotCount: row.forgot_count,
    metadata: parseMeta(row.metadata_json),
  };
}

export function serializeRetrievalAttempt(row: RetrievalAttemptRow): SerializedRetrievalAttempt {
  return {
    id: row.id,
    sessionId: row.session_id ?? undefined,
    itemId: row.item_id,
    rating: row.rating,
    responseText: row.response_text ?? undefined,
    correct: row.correct === null || row.correct === undefined ? undefined : Boolean(row.correct),
    durationMs: row.duration_ms ?? undefined,
    previousDueAt: row.previous_due_at ?? undefined,
    nextDueAt: row.next_due_at ?? undefined,
    createdAt: row.created_at,
  };
}
