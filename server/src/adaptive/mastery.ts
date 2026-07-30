import { randomUUID } from 'node:crypto';
import type { Db } from '../db';
import { conceptNameFromSlug, normalizeConceptSlug, upsertConcept } from './concepts';
import type {
  ConceptMastery,
  ConceptMasteryRow,
  MasteryTrend,
  Weakness,
  WeaknessRow,
  WeaknessStatus,
} from './types';

/**
 * Mastery model (deliberately simple and explainable — no IRT/Bayesian yet):
 *
 *   correct:   mastery += LEARN_RATE * difficultyWeight * (1 - mastery)
 *   incorrect: mastery -= MISS_RATE * (2 - difficultyWeight) * (0.2 + 0.8 * mastery)
 *
 * difficultyWeight runs 0.8 (difficulty 1) to 1.2 (difficulty 5), so a correct
 * answer on a hard card gains more and a miss on an easy card costs more.
 * Gains shrink as mastery approaches 1, so mastery never saturates from volume alone.
 */
const LEARN_RATE = 0.25;
const MISS_RATE = 0.3;
const CONFIDENCE_HALF_LIFE = 4;
const EVIDENCE_WINDOW = 6;
const TREND_DELTA = 0.05;
const DECAY_HALF_LIFE_DAYS = 60;

export const WEAK_MASTERY_THRESHOLD = 0.5;
export const REMEDIATION_SEVERITY_THRESHOLD = 0.6;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function difficultyWeight(difficulty?: number): number {
  const d = typeof difficulty === 'number' && difficulty >= 1 && difficulty <= 5 ? difficulty : 3;
  return 0.8 + 0.1 * (d - 1);
}

function parseEvidence(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((n): n is number => typeof n === 'number') : [];
  } catch {
    return [];
  }
}

function computeTrend(history: number[]): MasteryTrend {
  if (history.length < 3) return 'unknown';
  const first = history[0];
  const last = history[history.length - 1];
  if (last - first > TREND_DELTA) return 'improving';
  if (first - last > TREND_DELTA) return 'declining';
  return 'stable';
}

/** Days until the next review, derived from mastery: 1 day at 0.0 up to ~16 days at 1.0. */
function reviewIntervalDays(mastery: number, streak: number): number {
  const base = Math.pow(2, clamp01(mastery) * 4);
  const streakBonus = 1 + Math.min(streak, 5) * 0.15;
  return Math.max(1, Math.round(base * streakBonus));
}

export function serializeMastery(row: ConceptMasteryRow): ConceptMastery {
  return {
    conceptSlug: row.concept_slug,
    name: row.name ?? undefined,
    subjectId: row.subject_id ?? undefined,
    topic: row.topic ?? undefined,
    masteryScore: Number(row.mastery_score.toFixed(4)),
    confidenceScore: Number(row.confidence_score.toFixed(4)),
    exposureCount: row.exposure_count,
    correctCount: row.correct_count,
    incorrectCount: row.incorrect_count,
    streakCorrect: row.streak_correct,
    lastSeenAt: row.last_seen_at ?? undefined,
    nextReviewAt: row.next_review_at ?? undefined,
    trend: (row.trend as MasteryTrend) ?? 'unknown',
    updatedAt: row.updated_at,
  };
}

function loadRow(db: Db, conceptSlug: string): ConceptMasteryRow | undefined {
  return db.prepare('SELECT * FROM concept_mastery WHERE concept_slug = ?').get(conceptSlug) as
    | ConceptMasteryRow
    | undefined;
}

function ensureRow(db: Db, conceptSlug: string, name?: string): ConceptMasteryRow {
  const existing = loadRow(db, conceptSlug);
  if (existing) return existing;

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO concept_mastery (concept_slug, name, mastery_score, confidence_score, updated_at)
     VALUES (?, ?, 0.0, 0.0, ?)`,
  ).run(conceptSlug, name ?? conceptNameFromSlug(conceptSlug), now);
  return loadRow(db, conceptSlug)!;
}

export interface MasteryEventInput {
  conceptSlug: string;
  eventType: string;
  correct?: boolean;
  difficulty?: number;
  confidence?: number;
  subjectId?: string;
  topic?: string;
  timestamp?: string;
}

/**
 * Applies a single learning event to a concept's mastery model.
 * Non-graded events (views, lesson starts) only bump exposure and confidence.
 */
export function updateConceptMasteryFromEvent(db: Db, input: MasteryEventInput): ConceptMastery {
  const conceptSlug = normalizeConceptSlug(input.conceptSlug);
  if (!conceptSlug) throw new Error('conceptSlug is required to update mastery.');

  upsertConcept(db, {
    slug: conceptSlug,
    name: conceptNameFromSlug(conceptSlug),
    subjectId: input.subjectId,
    topic: input.topic,
  });

  const row = ensureRow(db, conceptSlug);
  const now = input.timestamp ?? new Date().toISOString();
  const graded = typeof input.correct === 'boolean';
  const w = difficultyWeight(input.difficulty);

  let mastery = row.mastery_score;
  let correctCount = row.correct_count;
  let incorrectCount = row.incorrect_count;
  let streak = row.streak_correct;

  if (graded) {
    if (input.correct) {
      mastery = clamp01(mastery + LEARN_RATE * w * (1 - mastery));
      correctCount += 1;
      streak += 1;
    } else {
      mastery = clamp01(mastery - MISS_RATE * (2 - w) * (0.2 + 0.8 * mastery));
      incorrectCount += 1;
      streak = 0;
    }
  }

  const exposureCount = row.exposure_count + 1;
  let confidence = exposureCount / (exposureCount + CONFIDENCE_HALF_LIFE);
  if (typeof input.confidence === 'number' && input.confidence >= 1 && input.confidence <= 5) {
    confidence = 0.7 * confidence + 0.3 * ((input.confidence - 1) / 4);
  }
  confidence = clamp01(confidence);

  const history = [...parseEvidence(row.evidence_json), Number(mastery.toFixed(4))].slice(
    -EVIDENCE_WINDOW,
  );
  const trend = computeTrend(history);

  const nextReviewAt = new Date(
    new Date(now).getTime() + reviewIntervalDays(mastery, streak) * 86_400_000,
  ).toISOString();

  db.prepare(
    `UPDATE concept_mastery SET
       subject_id = COALESCE(@subjectId, subject_id),
       topic = COALESCE(@topic, topic),
       mastery_score = @mastery,
       confidence_score = @confidence,
       exposure_count = @exposureCount,
       correct_count = @correctCount,
       incorrect_count = @incorrectCount,
       streak_correct = @streak,
       last_seen_at = @now,
       next_review_at = @nextReviewAt,
       trend = @trend,
       evidence_json = @evidenceJson,
       updated_at = @now
     WHERE concept_slug = @conceptSlug`,
  ).run({
    conceptSlug,
    subjectId: input.subjectId ?? null,
    topic: input.topic ?? null,
    mastery,
    confidence,
    exposureCount,
    correctCount,
    incorrectCount,
    streak,
    now,
    nextReviewAt,
    trend,
    evidenceJson: JSON.stringify(history),
  });

  return serializeMastery(loadRow(db, conceptSlug)!);
}

/** Rebuilds a concept's mastery from its full learning_events history. */
export function recomputeConceptMastery(db: Db, conceptSlug: string): ConceptMastery | null {
  const slug = normalizeConceptSlug(conceptSlug);
  const events = db
    .prepare(
      `SELECT event_type, correct, difficulty_rating, confidence, timestamp
       FROM learning_events
       WHERE concept_slug = ?
       ORDER BY timestamp ASC`,
    )
    .all(slug) as Array<{
    event_type: string;
    correct: number | null;
    difficulty_rating: number | null;
    confidence: number | null;
    timestamp: string;
  }>;

  if (events.length === 0) return getConceptMastery(db, slug);

  db.prepare(
    `UPDATE concept_mastery SET
       mastery_score = 0, confidence_score = 0, exposure_count = 0,
       correct_count = 0, incorrect_count = 0, streak_correct = 0,
       evidence_json = '[]', updated_at = ?
     WHERE concept_slug = ?`,
  ).run(new Date().toISOString(), slug);
  ensureRow(db, slug);

  let latest: ConceptMastery | null = null;
  for (const e of events) {
    latest = updateConceptMasteryFromEvent(db, {
      conceptSlug: slug,
      eventType: e.event_type,
      correct: e.correct == null ? undefined : e.correct === 1,
      difficulty: e.difficulty_rating ?? undefined,
      confidence: e.confidence ?? undefined,
      timestamp: e.timestamp,
    });
  }
  return latest;
}

export function getConceptMastery(db: Db, conceptSlug: string): ConceptMastery | null {
  const row = loadRow(db, normalizeConceptSlug(conceptSlug));
  return row ? serializeMastery(row) : null;
}

export interface MasteryFilters {
  sort?: 'weakest' | 'strongest' | 'recent' | 'due';
  subjectId?: string;
  topic?: string;
  limit?: number;
}

export function listConceptMastery(db: Db, filters: MasteryFilters = {}): ConceptMastery[] {
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};
  if (filters.subjectId) {
    clauses.push('subject_id = @subjectId');
    params.subjectId = filters.subjectId;
  }
  if (filters.topic) {
    clauses.push('topic = @topic');
    params.topic = filters.topic;
  }
  if (filters.sort === 'due') {
    clauses.push('next_review_at IS NOT NULL AND next_review_at <= @now');
    params.now = new Date().toISOString();
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const order =
    filters.sort === 'strongest'
      ? 'mastery_score DESC'
      : filters.sort === 'recent'
        ? 'updated_at DESC'
        : filters.sort === 'due'
          ? 'next_review_at ASC'
          : 'mastery_score ASC';
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 500);

  const rows = db
    .prepare(`SELECT * FROM concept_mastery ${where} ORDER BY ${order} LIMIT ${limit}`)
    .all(params) as ConceptMasteryRow[];
  return rows.map(serializeMastery);
}

/** Mastery adjusted downward for time since last exposure; used for ranking only. */
export function decayedMastery(mastery: ConceptMastery, now = new Date()): number {
  if (!mastery.lastSeenAt) return mastery.masteryScore;
  const days = (now.getTime() - new Date(mastery.lastSeenAt).getTime()) / 86_400_000;
  if (!Number.isFinite(days) || days <= 0) return mastery.masteryScore;
  return Number((mastery.masteryScore * Math.pow(0.5, days / DECAY_HALF_LIFE_DAYS)).toFixed(4));
}

export function getWeakConcepts(db: Db, limit = 10): ConceptMastery[] {
  const rows = db
    .prepare(
      `SELECT * FROM concept_mastery
       WHERE exposure_count > 0 AND mastery_score < ?
       ORDER BY mastery_score ASC, incorrect_count DESC
       LIMIT ?`,
    )
    .all(WEAK_MASTERY_THRESHOLD, Math.min(Math.max(limit, 1), 100)) as ConceptMasteryRow[];
  return rows.map(serializeMastery);
}

export function getDueConceptReviews(db: Db, limit = 20): ConceptMastery[] {
  const rows = db
    .prepare(
      `SELECT * FROM concept_mastery
       WHERE next_review_at IS NOT NULL AND next_review_at <= ?
       ORDER BY next_review_at ASC
       LIMIT ?`,
    )
    .all(new Date().toISOString(), Math.min(Math.max(limit, 1), 200)) as ConceptMasteryRow[];
  return rows.map(serializeMastery);
}

/* ---------------- Weakness observations ---------------- */

export function serializeWeakness(row: WeaknessRow): Weakness {
  let evidenceEventIds: string[] = [];
  try {
    const parsed = JSON.parse(row.evidence_event_ids_json ?? '[]') as unknown;
    if (Array.isArray(parsed)) evidenceEventIds = parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    evidenceEventIds = [];
  }
  return {
    id: row.id,
    conceptSlug: row.concept_slug,
    weaknessTag: row.weakness_tag,
    severity: Number(row.severity.toFixed(4)),
    status: row.status as WeaknessStatus,
    evidenceEventIds,
    evidenceSummary: row.evidence_summary ?? undefined,
    recommendedAction: row.recommended_action ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at ?? undefined,
  };
}

export interface CreateWeaknessInput {
  conceptSlug: string;
  weaknessTag: string;
  severity?: number;
  evidenceEventIds?: string[];
  evidenceSummary?: string;
  recommendedAction?: string;
}

export function createWeaknessObservation(db: Db, input: CreateWeaknessInput): Weakness {
  const conceptSlug = normalizeConceptSlug(input.conceptSlug);
  const now = new Date().toISOString();
  const existing = db
    .prepare(
      `SELECT * FROM weakness_observations
       WHERE concept_slug = ? AND weakness_tag = ? AND status = 'active'`,
    )
    .get(conceptSlug, input.weaknessTag) as WeaknessRow | undefined;

  if (existing) {
    const current = serializeWeakness(existing);
    const severity = clamp01(Math.max(current.severity, input.severity ?? 0.5));
    const ids = [...new Set([...current.evidenceEventIds, ...(input.evidenceEventIds ?? [])])].slice(-20);
    db.prepare(
      `UPDATE weakness_observations SET
         severity = @severity,
         evidence_event_ids_json = @ids,
         evidence_summary = COALESCE(@summary, evidence_summary),
         recommended_action = COALESCE(@action, recommended_action),
         updated_at = @now
       WHERE id = @id`,
    ).run({
      id: current.id,
      severity,
      ids: JSON.stringify(ids),
      summary: input.evidenceSummary ?? null,
      action: input.recommendedAction ?? null,
      now,
    });
    return serializeWeakness(
      db.prepare('SELECT * FROM weakness_observations WHERE id = ?').get(current.id) as WeaknessRow,
    );
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO weakness_observations (
       id, concept_slug, weakness_tag, severity, status,
       evidence_event_ids_json, evidence_summary, recommended_action,
       created_at, updated_at
     ) VALUES (
       @id, @conceptSlug, @weaknessTag, @severity, 'active',
       @ids, @summary, @action, @now, @now
     )`,
  ).run({
    id,
    conceptSlug,
    weaknessTag: input.weaknessTag,
    severity: clamp01(input.severity ?? 0.5),
    ids: JSON.stringify(input.evidenceEventIds ?? []),
    summary: input.evidenceSummary ?? null,
    action: input.recommendedAction ?? null,
    now,
  });

  return serializeWeakness(
    db.prepare('SELECT * FROM weakness_observations WHERE id = ?').get(id) as WeaknessRow,
  );
}

export interface WeaknessMissInput {
  conceptSlug: string;
  weaknessTag: string;
  eventId?: string;
  cardType?: string;
  lessonTitle?: string;
}

/**
 * Escalates (or opens) a weakness after a missed graded card.
 * Severity climbs with repeat misses and with how low the concept's mastery already is.
 */
export function updateWeaknessFromMiss(db: Db, input: WeaknessMissInput): Weakness {
  const conceptSlug = normalizeConceptSlug(input.conceptSlug);
  const mastery = getConceptMastery(db, conceptSlug);
  const existing = db
    .prepare(
      `SELECT * FROM weakness_observations
       WHERE concept_slug = ? AND weakness_tag = ? AND status = 'active'`,
    )
    .get(conceptSlug, input.weaknessTag) as WeaknessRow | undefined;

  const priorSeverity = existing ? existing.severity : 0.4;
  const masteryPenalty = mastery ? (1 - mastery.masteryScore) * 0.2 : 0.2;
  const severity = clamp01(priorSeverity + 0.15 + masteryPenalty);

  const missCount = (mastery?.incorrectCount ?? 1);
  const summary = `${missCount} miss(es) on ${conceptSlug}${
    input.cardType ? ` (${input.cardType} card)` : ''
  }${input.lessonTitle ? ` in "${input.lessonTitle}"` : ''}.`;

  return createWeaknessObservation(db, {
    conceptSlug,
    weaknessTag: input.weaknessTag,
    severity,
    evidenceEventIds: input.eventId ? [input.eventId] : [],
    evidenceSummary: summary,
    recommendedAction:
      severity >= REMEDIATION_SEVERITY_THRESHOLD
        ? `Generate a remediation lesson focused on ${conceptSlug}.`
        : `Review ${conceptSlug} in the next retrieval session.`,
  });
}

export function resolveWeakness(
  db: Db,
  input: { id: string; status?: Extract<WeaknessStatus, 'resolved' | 'ignored'> },
): Weakness | null {
  const status = input.status ?? 'resolved';
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE weakness_observations
     SET status = ?, resolved_at = ?, updated_at = ?
     WHERE id = ?`,
  ).run(status, now, now, input.id);
  const row = db.prepare('SELECT * FROM weakness_observations WHERE id = ?').get(input.id) as
    | WeaknessRow
    | undefined;
  return row ? serializeWeakness(row) : null;
}

export interface WeaknessFilters {
  status?: WeaknessStatus;
  severityMin?: number;
  conceptSlug?: string;
  limit?: number;
}

export function listWeaknesses(db: Db, filters: WeaknessFilters = {}): Weakness[] {
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};
  if (filters.status) {
    clauses.push('status = @status');
    params.status = filters.status;
  }
  if (typeof filters.severityMin === 'number') {
    clauses.push('severity >= @severityMin');
    params.severityMin = filters.severityMin;
  }
  if (filters.conceptSlug) {
    clauses.push('concept_slug = @conceptSlug');
    params.conceptSlug = normalizeConceptSlug(filters.conceptSlug);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = Math.min(Math.max(filters.limit ?? 25, 1), 200);

  const rows = db
    .prepare(
      `SELECT * FROM weakness_observations ${where} ORDER BY severity DESC, updated_at DESC LIMIT ${limit}`,
    )
    .all(params) as WeaknessRow[];
  return rows.map(serializeWeakness);
}
