import { randomUUID } from 'node:crypto';
import type { Db } from '../db';
import { hasCompletedDiagnostic } from './diagnostics';
import { getEventStats, listLearningEvents } from './events';
import {
  getDueConceptReviews,
  getWeakConcepts,
  listConceptMastery,
  listWeaknesses,
  REMEDIATION_SEVERITY_THRESHOLD,
} from './mastery';
import { listOpenRemediations } from './remediation';
import type {
  ConceptMastery,
  LearningEvent,
  NextAction,
  SnapshotType,
  Weakness,
} from './types';

export interface LearningSnapshot {
  id?: string;
  snapshotType: SnapshotType;
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
  recommendedNextActions: NextAction[];
  createdAt: string;
}

function compactMastery(list: ConceptMastery[]) {
  return list.map((m) => ({
    conceptSlug: m.conceptSlug,
    masteryScore: m.masteryScore,
    trend: m.trend,
  }));
}

interface ActiveRoadmap {
  id: string;
  title: string;
  nextNodeId?: string;
  nextNodeTitle?: string;
}

/** Most recently touched roadmap that still has an incomplete node. */
function findActiveRoadmap(db: Db, roadmapId?: string): ActiveRoadmap | null {
  const roadmap = roadmapId
    ? (db.prepare('SELECT id, title FROM roadmaps WHERE id = ?').get(roadmapId) as
        | { id: string; title: string }
        | undefined)
    : (db
        .prepare(
          `SELECT id, title FROM roadmaps
           WHERE status != 'deleted'
           ORDER BY updated_at DESC LIMIT 1`,
        )
        .get() as { id: string; title: string } | undefined);

  if (!roadmap) return null;

  const nextNode = db
    .prepare(
      `SELECT id, title FROM lesson_nodes
       WHERE roadmap_id = ? AND status IN ('available', 'active')
       ORDER BY node_order ASC LIMIT 1`,
    )
    .get(roadmap.id) as { id: string; title: string } | undefined;

  return {
    id: roadmap.id,
    title: roadmap.title,
    nextNodeId: nextNode?.id,
    nextNodeTitle: nextNode?.title,
  };
}

/**
 * Recommendation ladder (first match wins):
 *   no roadmap -> start_new_roadmap
 *   roadmap without diagnostic -> run_diagnostic
 *   severe weakness -> generate_remediation
 *   due reviews -> review_due_concepts
 *   otherwise -> continue_lesson
 */
export function recommendNextLearningAction(
  db: Db,
  options: { roadmapId?: string; availableMinutes?: number; goal?: string } = {},
): NextAction[] {
  const actions: NextAction[] = [];
  const activeRoadmap = findActiveRoadmap(db, options.roadmapId);

  if (!activeRoadmap) {
    actions.push({
      action: 'start_new_roadmap',
      reason: 'No roadmap exists yet, so there is no learning path to continue.',
      evidence: { roadmapCount: 0 },
    });
    return actions;
  }

  const diagnosticDone = hasCompletedDiagnostic(db, activeRoadmap.id);
  const severeWeaknesses = listWeaknesses(db, {
    status: 'active',
    severityMin: REMEDIATION_SEVERITY_THRESHOLD,
    limit: 3,
  });
  const dueReviews = getDueConceptReviews(db, 10);

  if (!diagnosticDone) {
    actions.push({
      action: 'run_diagnostic',
      reason: `No completed diagnostic for "${activeRoadmap.title}", so starting mastery is unknown.`,
      evidence: { roadmapId: activeRoadmap.id, completedDiagnostics: 0 },
      roadmapId: activeRoadmap.id,
    });
  }

  if (severeWeaknesses.length > 0) {
    const top = severeWeaknesses[0];
    actions.push({
      action: 'generate_remediation',
      reason: `Concept "${top.conceptSlug}" has an active ${top.weaknessTag} weakness at severity ${top.severity.toFixed(2)}.`,
      evidence: {
        weaknessId: top.id,
        conceptSlug: top.conceptSlug,
        severity: top.severity,
        evidenceEventIds: top.evidenceEventIds.slice(0, 5),
      },
      roadmapId: activeRoadmap.id,
      conceptSlug: top.conceptSlug,
    });
  }

  if (dueReviews.length > 0) {
    actions.push({
      action: 'review_due_concepts',
      reason: `${dueReviews.length} concept(s) are past their scheduled review date.`,
      evidence: {
        dueCount: dueReviews.length,
        concepts: dueReviews.slice(0, 5).map((d) => d.conceptSlug),
      },
      roadmapId: activeRoadmap.id,
    });
  }

  if (activeRoadmap.nextNodeId) {
    actions.push({
      action: 'continue_lesson',
      reason: `"${activeRoadmap.nextNodeTitle}" is the next available lesson in "${activeRoadmap.title}".`,
      evidence: {
        roadmapId: activeRoadmap.id,
        lessonNodeId: activeRoadmap.nextNodeId,
        availableMinutes: options.availableMinutes,
      },
      roadmapId: activeRoadmap.id,
      lessonNodeId: activeRoadmap.nextNodeId,
    });
  }

  if (actions.length === 0) {
    actions.push({
      action: 'start_new_roadmap',
      reason: `"${activeRoadmap.title}" has no remaining available lessons.`,
      evidence: { roadmapId: activeRoadmap.id },
    });
  }

  return actions;
}

interface BuildSnapshotOptions {
  snapshotType?: SnapshotType;
  roadmapId?: string;
  since?: string;
  activityLimit?: number;
}

function buildSnapshot(db: Db, options: BuildSnapshotOptions = {}): LearningSnapshot {
  const snapshotType = options.snapshotType ?? 'current_state';
  const stats = getEventStats(db, options.since);
  const weakConcepts = getWeakConcepts(db, 5);
  const dueReviews = getDueConceptReviews(db, 10);
  const strongest = listConceptMastery(db, { sort: 'strongest', limit: 5 });
  const openRemediations = listOpenRemediations(db, 5);
  const activeConcepts = (
    db.prepare('SELECT COUNT(*) AS n FROM concept_mastery WHERE exposure_count > 0').get() as {
      n: number;
    }
  ).n;

  const recentEvents = listLearningEvents(db, {
    roadmapId: options.roadmapId,
    since: options.since,
    limit: options.activityLimit ?? 10,
  });

  const recommendedNextActions = recommendNextLearningAction(db, { roadmapId: options.roadmapId });

  const accuracyText =
    stats.accuracy == null ? 'no graded answers yet' : `${Math.round(stats.accuracy * 100)}% accuracy`;
  const summary = [
    `${stats.lessonsCompleted} lesson(s) completed, ${stats.cardsAnswered} card(s) answered (${accuracyText}).`,
    `${activeConcepts} concept(s) in progress, ${weakConcepts.length} weak, ${dueReviews.length} due for review.`,
    recommendedNextActions[0] ? `Next: ${recommendedNextActions[0].action}.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const title =
    snapshotType === 'roadmap' && options.roadmapId
      ? `Roadmap learning state (${options.roadmapId})`
      : snapshotType === 'daily'
        ? `Daily learning state (${new Date().toISOString().slice(0, 10)})`
        : 'Current learning state';

  return {
    snapshotType,
    title,
    summary,
    stats: {
      lessonsCompleted: stats.lessonsCompleted,
      cardsAnswered: stats.cardsAnswered,
      accuracy: stats.accuracy,
      activeConcepts,
      weakConcepts: weakConcepts.length,
      dueReviews: dueReviews.length,
    },
    recentActivity: recentEvents.map((e) => ({
      eventId: e.id,
      eventType: e.eventType,
      timestamp: e.timestamp,
      conceptSlug: e.conceptSlug,
      lessonId: e.lessonId,
      correct: e.correct,
    })),
    strongestConcepts: compactMastery(strongest),
    weakestConcepts: weakConcepts.map((m) => ({
      conceptSlug: m.conceptSlug,
      masteryScore: m.masteryScore,
      incorrectCount: m.incorrectCount,
    })),
    dueReviews: dueReviews.map((m) => ({
      conceptSlug: m.conceptSlug,
      nextReviewAt: m.nextReviewAt,
      masteryScore: m.masteryScore,
    })),
    openRemediations: openRemediations.map((r) => ({
      id: r.id,
      conceptSlug: r.conceptSlug,
      severity: r.severity,
      status: r.status,
    })),
    recommendedNextActions,
    createdAt: new Date().toISOString(),
  };
}

export function buildCurrentLearningSnapshot(db: Db): LearningSnapshot {
  return buildSnapshot(db, { snapshotType: 'current_state' });
}

export function buildDailyLearningSnapshot(db: Db): LearningSnapshot {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  return buildSnapshot(db, { snapshotType: 'daily', since });
}

export function buildRoadmapLearningSnapshot(db: Db, roadmapId: string): LearningSnapshot {
  return buildSnapshot(db, { snapshotType: 'roadmap', roadmapId });
}

/** Persists a snapshot so ChatGPT can retrieve a stable point-in-time summary. */
export function storeLearningSnapshot(db: Db, snapshot: LearningSnapshot): LearningSnapshot {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO learning_snapshots (
       id, snapshot_type, title, summary, strengths_json, weaknesses_json,
       due_reviews_json, recommendations_json, stats_json, created_at
     ) VALUES (
       @id, @snapshotType, @title, @summary, @strengths, @weaknesses,
       @dueReviews, @recommendations, @stats, @createdAt
     )`,
  ).run({
    id,
    snapshotType: snapshot.snapshotType,
    title: snapshot.title,
    summary: snapshot.summary,
    strengths: JSON.stringify(snapshot.strongestConcepts),
    weaknesses: JSON.stringify(snapshot.weakestConcepts),
    dueReviews: JSON.stringify(snapshot.dueReviews),
    recommendations: JSON.stringify(snapshot.recommendedNextActions),
    stats: JSON.stringify(snapshot.stats),
    createdAt: snapshot.createdAt,
  });
  return { ...snapshot, id };
}

export function listLearningSnapshots(
  db: Db,
  filters: { snapshotType?: SnapshotType; limit?: number } = {},
) {
  const where = filters.snapshotType ? 'WHERE snapshot_type = @snapshotType' : '';
  const limit = Math.min(Math.max(filters.limit ?? 10, 1), 100);
  return db
    .prepare(
      `SELECT id, snapshot_type, title, summary, stats_json, created_at
       FROM learning_snapshots ${where} ORDER BY created_at DESC LIMIT ${limit}`,
    )
    .all(filters.snapshotType ? { snapshotType: filters.snapshotType } : {}) as Array<
    Record<string, unknown>
  >;
}

export interface LearningStateOptions {
  includeEvents?: boolean;
  includeWeaknesses?: boolean;
  includeDueReviews?: boolean;
  limit?: number;
}

export interface LearningState {
  summary: string;
  stats: LearningSnapshot['stats'];
  weakestConcepts: LearningSnapshot['weakestConcepts'];
  strongestConcepts: LearningSnapshot['strongestConcepts'];
  openRemediations: LearningSnapshot['openRemediations'];
  recommendedNextAction: NextAction | null;
  recommendedNextActions: NextAction[];
  /** Compact activity list; present unless raw events were requested. */
  recentActivity?: LearningSnapshot['recentActivity'];
  dueReviews?: LearningSnapshot['dueReviews'];
  weaknesses?: Weakness[];
  recentEvents?: LearningEvent[];
}

/** Compact learning state for MCP. Heavy sections are opt-in to keep payloads small. */
export function getLearningState(db: Db, options: LearningStateOptions = {}): LearningState {
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 50);
  const snapshot = buildCurrentLearningSnapshot(db);

  const state: LearningState = {
    summary: snapshot.summary,
    stats: snapshot.stats,
    weakestConcepts: snapshot.weakestConcepts.slice(0, limit),
    strongestConcepts: snapshot.strongestConcepts.slice(0, limit),
    openRemediations: snapshot.openRemediations,
    recommendedNextAction: snapshot.recommendedNextActions[0] ?? null,
    recommendedNextActions: snapshot.recommendedNextActions,
  };

  if (options.includeDueReviews !== false) {
    state.dueReviews = snapshot.dueReviews.slice(0, limit);
  }
  if (options.includeWeaknesses) {
    state.weaknesses = listWeaknesses(db, { status: 'active', limit });
  }
  if (options.includeEvents) {
    state.recentEvents = listLearningEvents(db, { limit });
  } else {
    state.recentActivity = snapshot.recentActivity.slice(0, limit);
  }

  return state;
}
