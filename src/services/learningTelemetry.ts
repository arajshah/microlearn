import AsyncStorage from '@react-native-async-storage/async-storage';
import { LessonCard } from '@/types/content';
import {
  resolveCardConceptTags,
  resolveCardSkillTags,
  resolveCardWeaknessTags,
} from '@/utils/conceptTags';
import {
  isServerConfigured,
  postLearningEvent,
  postLearningEventsBatch,
} from '@/services/microlearnServer';

/**
 * Fire-and-forget learning telemetry.
 *
 * Every emit resolves immediately; failures fall back to an AsyncStorage queue
 * that is flushed on the next successful send. Telemetry must never block or
 * break the learning flow, so all errors are swallowed after being queued.
 */

const QUEUE_KEY = 'microlearn.learningEventQueue.v1';
const MAX_QUEUE = 500;
const FLUSH_BATCH = 100;

export type LearningEventType =
  | 'lesson_started'
  | 'card_viewed'
  | 'card_answered'
  | 'card_revealed'
  | 'lesson_completed'
  | 'review_attempted'
  | 'diagnostic_started'
  | 'diagnostic_answered'
  | 'diagnostic_completed'
  | 'remediation_recommended'
  | 'remediation_generated'
  | 'confidence_reported';

export interface LearningEventPayload {
  eventType: LearningEventType;
  timestamp?: string;
  roadmapId?: string;
  lessonNodeId?: string;
  lessonId?: string;
  cardId?: string;
  conceptSlug?: string;
  conceptTags?: string[];
  skillTag?: string;
  weaknessTags?: string[];
  cardType?: string;
  correct?: boolean;
  selectedAnswer?: unknown;
  expectedAnswer?: unknown;
  responseTimeMs?: number;
  confidence?: number;
  difficultyRating?: number;
  source?: string;
  metadata?: Record<string, unknown>;
}

let flushing = false;

async function readQueue(): Promise<LearningEventPayload[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as LearningEventPayload[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(events: LearningEventPayload[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(events.slice(-MAX_QUEUE)));
  } catch {
    // Storage failures are non-fatal: telemetry is best-effort.
  }
}

async function enqueue(event: LearningEventPayload): Promise<void> {
  const queue = await readQueue();
  queue.push(event);
  await writeQueue(queue);
}

/** Sends any queued events. Safe to call often; concurrent calls are coalesced. */
export async function flushLearningEvents(): Promise<{ flushed: number; remaining: number }> {
  if (flushing || !isServerConfigured()) return { flushed: 0, remaining: 0 };
  flushing = true;
  try {
    let queue = await readQueue();
    let flushed = 0;

    while (queue.length > 0) {
      const batch = queue.slice(0, FLUSH_BATCH);
      const ok = await postLearningEventsBatch(batch);
      if (!ok) break;
      flushed += batch.length;
      queue = queue.slice(batch.length);
      await writeQueue(queue);
    }

    return { flushed, remaining: queue.length };
  } catch {
    return { flushed: 0, remaining: (await readQueue()).length };
  } finally {
    flushing = false;
  }
}

/** Records one learning event, queueing locally when the server is unreachable. */
export async function emitLearningEvent(event: LearningEventPayload): Promise<void> {
  const payload: LearningEventPayload = {
    ...event,
    timestamp: event.timestamp ?? new Date().toISOString(),
    source: event.source ?? 'app',
  };

  if (!isServerConfigured()) return;

  try {
    const ok = await postLearningEvent(payload);
    if (ok) {
      void flushLearningEvents();
      return;
    }
  } catch {
    // fall through to queue
  }
  await enqueue(payload);
}

/** Non-awaited variant for UI paths that must not wait on the network. */
export function trackLearningEvent(event: LearningEventPayload): void {
  void emitLearningEvent(event);
}

export interface LessonTelemetryContext {
  lessonId: string;
  lessonTitle?: string;
  roadmapId?: string;
  lessonNodeId?: string;
  lessonConceptTags?: string[];
  lessonSkillTags?: string[];
}

export function trackLessonStarted(ctx: LessonTelemetryContext, cardCount: number): void {
  trackLearningEvent({
    eventType: 'lesson_started',
    lessonId: ctx.lessonId,
    roadmapId: ctx.roadmapId,
    lessonNodeId: ctx.lessonNodeId,
    conceptTags: ctx.lessonConceptTags,
    metadata: { lessonTitle: ctx.lessonTitle, cardCount },
  });
}

export function trackCardViewed(
  ctx: LessonTelemetryContext,
  card: LessonCard,
  index: number,
): void {
  trackLearningEvent({
    eventType: 'card_viewed',
    lessonId: ctx.lessonId,
    roadmapId: ctx.roadmapId,
    lessonNodeId: ctx.lessonNodeId,
    cardId: card.id,
    cardType: card.type,
    conceptTags: resolveCardConceptTags(card, ctx.lessonConceptTags, ctx.lessonTitle),
    skillTag: resolveCardSkillTags(card, ctx.lessonSkillTags)[0],
    metadata: { index, lessonTitle: ctx.lessonTitle },
  });
}

export function trackCardAnswered(
  ctx: LessonTelemetryContext,
  card: LessonCard,
  input: {
    correct: boolean;
    selectedAnswer?: unknown;
    expectedAnswer?: unknown;
    responseTimeMs?: number;
  },
): void {
  trackLearningEvent({
    eventType: 'card_answered',
    lessonId: ctx.lessonId,
    roadmapId: ctx.roadmapId,
    lessonNodeId: ctx.lessonNodeId,
    cardId: card.id,
    cardType: card.type,
    conceptTags: resolveCardConceptTags(card, ctx.lessonConceptTags, ctx.lessonTitle),
    skillTag: resolveCardSkillTags(card, ctx.lessonSkillTags)[0],
    weaknessTags: input.correct ? undefined : resolveCardWeaknessTags(card),
    correct: input.correct,
    selectedAnswer: input.selectedAnswer,
    expectedAnswer: input.expectedAnswer,
    responseTimeMs: input.responseTimeMs,
    difficultyRating: card.estimatedDifficulty,
    metadata: { lessonTitle: ctx.lessonTitle },
  });
}

export function trackLessonCompleted(
  ctx: LessonTelemetryContext,
  input: { correctCount: number; totalCount: number; accuracy: number },
): void {
  trackLearningEvent({
    eventType: 'lesson_completed',
    lessonId: ctx.lessonId,
    roadmapId: ctx.roadmapId,
    lessonNodeId: ctx.lessonNodeId,
    conceptTags: ctx.lessonConceptTags,
    metadata: { lessonTitle: ctx.lessonTitle, ...input },
  });
}

export function trackReviewAttempted(input: {
  lessonId?: string;
  roadmapId?: string;
  itemId?: string;
  conceptSlug?: string;
  correct: boolean;
  rating?: string;
  responseTimeMs?: number;
}): void {
  trackLearningEvent({
    eventType: 'review_attempted',
    lessonId: input.lessonId,
    roadmapId: input.roadmapId,
    cardId: input.itemId,
    conceptSlug: input.conceptSlug,
    correct: input.correct,
    responseTimeMs: input.responseTimeMs,
    source: 'review',
    metadata: input.rating ? { rating: input.rating } : undefined,
  });
}

export async function getQueuedLearningEventCount(): Promise<number> {
  return (await readQueue()).length;
}

export async function clearLearningEventQueue(): Promise<void> {
  await writeQueue([]);
}
