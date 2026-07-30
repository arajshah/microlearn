import { randomUUID } from 'node:crypto';
import type { Db } from '../db';
import { logger } from '../logger';
import { normalizeConceptSlug } from './concepts';
import {
  REMEDIATION_SEVERITY_THRESHOLD,
  updateConceptMasteryFromEvent,
  updateWeaknessFromMiss,
} from './mastery';
import { createRemediationQueueItem } from './remediation';
import {
  LEARNING_EVENT_TYPES,
  type LearningEvent,
  type LearningEventInput,
  type LearningEventRow,
  type LearningEventType,
} from './types';

const GRADED_EVENT_TYPES = new Set(['card_answered', 'review_attempted', 'diagnostic_answered']);

/** Weakness tag implied by a card type. Mirrors src/utils/conceptTags.ts. */
export function weaknessTagForCardType(cardType?: string): string {
  switch (cardType) {
    case 'formula':
      return 'formula_interpretation';
    case 'derivation':
      return 'derivation_steps';
    case 'worked_example':
      return 'procedural_application';
    case 'misconception':
    case 'misconception_check':
      return 'misconception';
    case 'compare_contrast':
      return 'conceptual_distinction';
    case 'application':
      return 'transfer';
    case 'prediction':
      return 'causal_prediction';
    case 'matching':
      return 'vocabulary';
    case 'ordering':
      return 'sequence_process';
    case 'quiz':
    case 'truefalse':
    case 'fillblank':
      return 'recall_or_concept_check';
    default:
      return 'general_understanding';
  }
}

export function isLearningEventType(value: unknown): value is LearningEventType {
  return typeof value === 'string' && (LEARNING_EVENT_TYPES as readonly string[]).includes(value);
}

function serializeEvent(row: LearningEventRow): LearningEvent {
  let metadata: Record<string, unknown> | undefined;
  try {
    const parsed = JSON.parse(row.metadata_json ?? '{}') as unknown;
    if (parsed && typeof parsed === 'object') metadata = parsed as Record<string, unknown>;
  } catch {
    metadata = undefined;
  }
  return {
    id: row.id,
    eventType: row.event_type,
    timestamp: row.timestamp,
    roadmapId: row.roadmap_id ?? undefined,
    lessonNodeId: row.lesson_node_id ?? undefined,
    lessonId: row.lesson_id ?? undefined,
    cardId: row.card_id ?? undefined,
    conceptSlug: row.concept_slug ?? undefined,
    skillTag: row.skill_tag ?? undefined,
    correct: row.correct == null ? undefined : row.correct === 1,
    responseTimeMs: row.response_time_ms ?? undefined,
    confidence: row.confidence ?? undefined,
    difficultyRating: row.difficulty_rating ?? undefined,
    source: row.source ?? undefined,
    metadata: metadata && Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}

function insertEventRow(db: Db, input: LearningEventInput, conceptSlug?: string): LearningEvent {
  const id = randomUUID();
  const timestamp = input.timestamp ?? new Date().toISOString();

  db.prepare(
    `INSERT INTO learning_events (
       id, event_type, timestamp, roadmap_id, lesson_node_id, lesson_id, card_id,
       concept_slug, skill_tag, correct, selected_answer_json, expected_answer_json,
       response_time_ms, confidence, difficulty_rating, source, metadata_json
     ) VALUES (
       @id, @eventType, @timestamp, @roadmapId, @lessonNodeId, @lessonId, @cardId,
       @conceptSlug, @skillTag, @correct, @selectedJson, @expectedJson,
       @responseTimeMs, @confidence, @difficultyRating, @source, @metadataJson
     )`,
  ).run({
    id,
    eventType: input.eventType,
    timestamp,
    roadmapId: input.roadmapId ?? null,
    lessonNodeId: input.lessonNodeId ?? null,
    lessonId: input.lessonId ?? null,
    cardId: input.cardId ?? null,
    conceptSlug: conceptSlug ?? null,
    skillTag: input.skillTag ?? null,
    correct: typeof input.correct === 'boolean' ? (input.correct ? 1 : 0) : null,
    selectedJson: input.selectedAnswer === undefined ? null : JSON.stringify(input.selectedAnswer),
    expectedJson: input.expectedAnswer === undefined ? null : JSON.stringify(input.expectedAnswer),
    responseTimeMs: input.responseTimeMs ?? null,
    confidence: input.confidence ?? null,
    difficultyRating: input.difficultyRating ?? null,
    source: input.source ?? null,
    metadataJson: JSON.stringify(input.metadata ?? {}),
  });

  return serializeEvent(
    db.prepare('SELECT * FROM learning_events WHERE id = ?').get(id) as LearningEventRow,
  );
}

export interface RecordEventResult {
  events: LearningEvent[];
  masteryUpdated: string[];
  weaknessesCreated: string[];
  remediationCreated: string[];
}

/**
 * Records one learning event. When conceptTags carries multiple concepts the event
 * is fanned out into one row per concept so mastery attribution stays queryable.
 * Mastery/weakness side effects are best-effort and never fail the write.
 */
export function recordLearningEvent(db: Db, input: LearningEventInput): RecordEventResult {
  const concepts = [
    ...new Set(
      [input.conceptSlug, ...(input.conceptTags ?? [])]
        .filter((c): c is string => typeof c === 'string' && c.length > 0)
        .map(normalizeConceptSlug)
        .filter(Boolean),
    ),
  ];

  const result: RecordEventResult = {
    events: [],
    masteryUpdated: [],
    weaknessesCreated: [],
    remediationCreated: [],
  };

  if (concepts.length === 0) {
    result.events.push(insertEventRow(db, input));
    return result;
  }

  for (const conceptSlug of concepts) {
    const event = insertEventRow(db, input, conceptSlug);
    result.events.push(event);

    try {
      updateConceptMasteryFromEvent(db, {
        conceptSlug,
        eventType: input.eventType,
        correct: GRADED_EVENT_TYPES.has(input.eventType) ? input.correct : undefined,
        difficulty: input.difficultyRating,
        confidence: input.confidence,
        timestamp: event.timestamp,
      });
      result.masteryUpdated.push(conceptSlug);
    } catch (err) {
      logger.error('Mastery update failed', err instanceof Error ? err.message : 'unknown');
    }

    const missed = GRADED_EVENT_TYPES.has(input.eventType) && input.correct === false;
    if (!missed) continue;

    const tags =
      input.weaknessTags && input.weaknessTags.length > 0
        ? input.weaknessTags
        : [weaknessTagForCardType(input.cardType)];

    for (const tag of tags) {
      try {
        const weakness = updateWeaknessFromMiss(db, {
          conceptSlug,
          weaknessTag: tag,
          eventId: event.id,
          cardType: input.cardType,
          lessonTitle: typeof input.metadata?.lessonTitle === 'string' ? input.metadata.lessonTitle : undefined,
        });
        result.weaknessesCreated.push(weakness.id);

        if (weakness.severity >= REMEDIATION_SEVERITY_THRESHOLD) {
          const item = createRemediationQueueItem(db, {
            conceptSlug,
            roadmapId: input.roadmapId,
            lessonNodeId: input.lessonNodeId,
            severity: weakness.severity,
            reason: weakness.evidenceSummary ?? `Repeated misses on ${conceptSlug}.`,
          });
          if (item) result.remediationCreated.push(item.id);
        }
      } catch (err) {
        logger.error('Weakness update failed', err instanceof Error ? err.message : 'unknown');
      }
    }
  }

  return result;
}

export function recordLearningEventsBatch(
  db: Db,
  inputs: LearningEventInput[],
): { recorded: number; results: RecordEventResult[] } {
  const results: RecordEventResult[] = [];
  const run = db.transaction(() => {
    for (const input of inputs) {
      results.push(recordLearningEvent(db, input));
    }
  });
  run();
  return { recorded: results.reduce((sum, r) => sum + r.events.length, 0), results };
}

export interface CardAnsweredInput {
  lessonId: string;
  cardId: string;
  correct: boolean;
  conceptTags?: string[];
  skillTags?: string[];
  weaknessTags?: string[];
  cardType?: string;
  roadmapId?: string;
  lessonNodeId?: string;
  selectedAnswer?: unknown;
  expectedAnswer?: unknown;
  responseTimeMs?: number;
  difficulty?: number;
  confidence?: number;
  lessonTitle?: string;
  source?: string;
}

export function recordCardAnswered(db: Db, input: CardAnsweredInput): RecordEventResult {
  return recordLearningEvent(db, {
    eventType: 'card_answered',
    lessonId: input.lessonId,
    cardId: input.cardId,
    roadmapId: input.roadmapId,
    lessonNodeId: input.lessonNodeId,
    conceptTags: input.conceptTags,
    skillTag: input.skillTags?.[0],
    weaknessTags: input.weaknessTags,
    cardType: input.cardType,
    correct: input.correct,
    selectedAnswer: input.selectedAnswer,
    expectedAnswer: input.expectedAnswer,
    responseTimeMs: input.responseTimeMs,
    difficultyRating: input.difficulty,
    confidence: input.confidence,
    source: input.source ?? 'app',
    metadata: input.lessonTitle ? { lessonTitle: input.lessonTitle } : undefined,
  });
}

export interface LessonCompletedInput {
  lessonId: string;
  roadmapId?: string;
  lessonNodeId?: string;
  conceptTags?: string[];
  correctCount?: number;
  totalCount?: number;
  accuracy?: number;
  lessonTitle?: string;
  source?: string;
}

export function recordLessonCompleted(db: Db, input: LessonCompletedInput): RecordEventResult {
  return recordLearningEvent(db, {
    eventType: 'lesson_completed',
    lessonId: input.lessonId,
    roadmapId: input.roadmapId,
    lessonNodeId: input.lessonNodeId,
    conceptTags: input.conceptTags,
    source: input.source ?? 'app',
    metadata: {
      lessonTitle: input.lessonTitle,
      correctCount: input.correctCount,
      totalCount: input.totalCount,
      accuracy: input.accuracy,
    },
  });
}

export interface LearningEventFilters {
  eventType?: string;
  conceptSlug?: string;
  roadmapId?: string;
  lessonId?: string;
  since?: string;
  until?: string;
  limit?: number;
}

export function listLearningEvents(db: Db, filters: LearningEventFilters = {}): LearningEvent[] {
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};

  if (filters.eventType) {
    clauses.push('event_type = @eventType');
    params.eventType = filters.eventType;
  }
  if (filters.conceptSlug) {
    clauses.push('concept_slug = @conceptSlug');
    params.conceptSlug = normalizeConceptSlug(filters.conceptSlug);
  }
  if (filters.roadmapId) {
    clauses.push('roadmap_id = @roadmapId');
    params.roadmapId = filters.roadmapId;
  }
  if (filters.lessonId) {
    clauses.push('lesson_id = @lessonId');
    params.lessonId = filters.lessonId;
  }
  if (filters.since) {
    clauses.push('timestamp >= @since');
    params.since = filters.since;
  }
  if (filters.until) {
    clauses.push('timestamp <= @until');
    params.until = filters.until;
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 500);

  const rows = db
    .prepare(`SELECT * FROM learning_events ${where} ORDER BY timestamp DESC LIMIT ${limit}`)
    .all(params) as LearningEventRow[];
  return rows.map(serializeEvent);
}

/** Compact activity counters for snapshots and MCP summaries. */
export function getEventStats(db: Db, since?: string) {
  const where = since ? 'WHERE timestamp >= @since' : '';
  const params = since ? { since } : {};

  const row = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN event_type = 'lesson_completed' THEN 1 ELSE 0 END) AS lessonsCompleted,
         SUM(CASE WHEN event_type = 'card_answered' THEN 1 ELSE 0 END) AS cardsAnswered,
         SUM(CASE WHEN event_type = 'card_answered' AND correct = 1 THEN 1 ELSE 0 END) AS cardsCorrect
       FROM learning_events ${where}`,
    )
    .get(params) as {
    total: number | null;
    lessonsCompleted: number | null;
    cardsAnswered: number | null;
    cardsCorrect: number | null;
  };

  const cardsAnswered = row.cardsAnswered ?? 0;
  const cardsCorrect = row.cardsCorrect ?? 0;
  return {
    totalEvents: row.total ?? 0,
    // lesson_completed fans out per concept; count distinct lessons instead of rows.
    lessonsCompleted: (
      db
        .prepare(
          `SELECT COUNT(DISTINCT lesson_id) AS n FROM learning_events
           WHERE event_type = 'lesson_completed' ${since ? 'AND timestamp >= @since' : ''}`,
        )
        .get(params) as { n: number }
    ).n,
    cardsAnswered,
    cardsCorrect,
    accuracy: cardsAnswered > 0 ? Number((cardsCorrect / cardsAnswered).toFixed(4)) : null,
  };
}
