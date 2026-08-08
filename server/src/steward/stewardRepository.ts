import { randomUUID } from 'node:crypto';
import type { Db } from '../db';
import { getLearningState } from '../adaptive/snapshots';
import { sanitizeAuditPayload } from '../audit/auditService';
import { listRoadmaps } from '../curriculum/curriculumRepository';
import { ToolError } from '../mcp/repoSafety';

export type StewardRunStatus = 'running' | 'completed' | 'no_change' | 'failed';

export interface CurriculumStrategyInput {
  summary: string;
  currentPhase: string;
  priorities: string[];
  deprioritizedAreas: string[];
  activeHypotheses: string[];
  nearTermObjectives: string[];
  upcomingPlan: string[];
  concerns: string[];
  lastReviewedAt?: string;
}

export interface StewardAction {
  type: string;
  entityType?: string;
  entityId?: string;
  summary: string;
}

interface CharterRow {
  id: string;
  version: number;
  content: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

interface StrategyRow {
  id: string;
  strategy_version: number;
  summary: string;
  current_phase: string;
  priorities_json: string;
  deprioritized_areas_json: string;
  active_hypotheses_json: string;
  near_term_objectives_json: string;
  upcoming_plan_json: string;
  concerns_json: string;
  last_reviewed_at: string;
  created_at: string;
  updated_at: string;
}

interface StewardRunRow {
  id: string;
  idempotency_key: string | null;
  actor: string;
  status: StewardRunStatus;
  strategy_version_before: number | null;
  strategy_version_after: number | null;
  summary: string | null;
  actions_json: string;
  error_code: string | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

function now(): string {
  return new Date().toISOString();
}

function parseArray(raw: string): string[] {
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function parseActions(raw: string): StewardAction[] {
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? value as StewardAction[] : [];
  } catch {
    return [];
  }
}

function rejectPrivateReasoning(value: unknown, path = 'input'): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectPrivateReasoning(item, `${path}[${index}]`));
    return;
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (/chain.?of.?thought|hidden.?reason|private.?reason|(^|_)reasoning($|_)/i.test(key)) {
      throw new ToolError(
        'PRIVATE_REASONING_NOT_ACCEPTED',
        `Private model reasoning is not accepted at ${path}.${key}; provide a concise summary instead.`,
      );
    }
    rejectPrivateReasoning(item, `${path}.${key}`);
  }
}

const CREDENTIAL_TEXT = /\bBearer\s+[A-Za-z0-9._~-]{8,}|\bsk-[A-Za-z0-9_-]{8,}|(?:api[_ -]?key|token|secret|password)\s*[:=]\s*\S{6,}/i;

function rejectCredentialContent(value: unknown, path = 'input'): void {
  if (typeof value === 'string') {
    if (CREDENTIAL_TEXT.test(value)) {
      throw new ToolError(
        'SENSITIVE_CONTENT_REJECTED',
        `Credential-like content is not accepted at ${path}.`,
      );
    }
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectCredentialContent(item, `${path}[${index}]`));
    return;
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    rejectCredentialContent(item, `${path}.${key}`);
  }
}

function safeErrorMessage(message: string): string {
  return message
    .replace(/\bBearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]+/gi, '[redacted]')
    .replace(/((?:api[_ -]?key|token|secret|password)\s*[:=]\s*)\S+/gi, '$1[redacted]');
}

function serializeCharter(row: CharterRow) {
  return {
    id: row.id,
    version: row.version,
    content: row.content,
    active: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeStrategy(row: StrategyRow) {
  return {
    id: row.id,
    strategyVersion: row.strategy_version,
    summary: row.summary,
    currentPhase: row.current_phase,
    priorities: parseArray(row.priorities_json),
    deprioritizedAreas: parseArray(row.deprioritized_areas_json),
    activeHypotheses: parseArray(row.active_hypotheses_json),
    nearTermObjectives: parseArray(row.near_term_objectives_json),
    upcomingPlan: parseArray(row.upcoming_plan_json),
    concerns: parseArray(row.concerns_json),
    lastReviewedAt: row.last_reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeRun(row: StewardRunRow) {
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key ?? undefined,
    actor: row.actor,
    status: row.status,
    strategyVersionBefore: row.strategy_version_before ?? undefined,
    strategyVersionAfter: row.strategy_version_after ?? undefined,
    summary: row.summary ?? undefined,
    actions: parseActions(row.actions_json),
    errorCode: row.error_code ?? undefined,
    errorMessage: row.error_message ?? undefined,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getCurriculumStewardCharter(db: Db) {
  const row = db
    .prepare('SELECT * FROM curriculum_steward_charters WHERE is_active = 1 ORDER BY version DESC LIMIT 1')
    .get() as CharterRow | undefined;
  if (!row) throw new ToolError('STEWARD_CHARTER_MISSING', 'The Curriculum Steward charter has not been initialized.');
  return serializeCharter(row);
}

export function updateCurriculumStewardCharter(
  db: Db,
  input: { content: string; expectedVersion?: number },
) {
  rejectPrivateReasoning(input);
  rejectCredentialContent(input);
  const tx = db.transaction(() => {
    const current = getCurriculumStewardCharter(db);
    if (input.expectedVersion !== undefined && input.expectedVersion !== current.version) {
      throw new ToolError(
        'VERSION_CONFLICT',
        `Charter version ${input.expectedVersion} is stale; current version is ${current.version}.`,
      );
    }
    const ts = now();
    const id = randomUUID();
    const version = current.version + 1;
    db.prepare('UPDATE curriculum_steward_charters SET is_active = 0, updated_at = ? WHERE is_active = 1').run(ts);
    db.prepare(
      `INSERT INTO curriculum_steward_charters
        (id, version, content, is_active, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?)`,
    ).run(id, version, input.content, ts, ts);
    return getCurriculumStewardCharter(db);
  });
  return tx();
}

export function getCurriculumStrategy(db: Db) {
  const row = db
    .prepare('SELECT * FROM curriculum_strategies ORDER BY strategy_version DESC LIMIT 1')
    .get() as StrategyRow | undefined;
  if (!row) throw new ToolError('CURRICULUM_STRATEGY_MISSING', 'The curriculum strategy has not been initialized.');
  return serializeStrategy(row);
}

export function updateCurriculumStrategy(
  db: Db,
  input: CurriculumStrategyInput & { expectedVersion?: number },
) {
  rejectPrivateReasoning(input);
  rejectCredentialContent(input);
  const tx = db.transaction(() => {
    const current = getCurriculumStrategy(db);
    if (input.expectedVersion !== undefined && input.expectedVersion !== current.strategyVersion) {
      throw new ToolError(
        'VERSION_CONFLICT',
        `Strategy version ${input.expectedVersion} is stale; current version is ${current.strategyVersion}.`,
      );
    }
    const ts = now();
    const version = current.strategyVersion + 1;
    const id = randomUUID();
    db.prepare(
      `INSERT INTO curriculum_strategies (
         id, strategy_version, summary, current_phase, priorities_json,
         deprioritized_areas_json, active_hypotheses_json, near_term_objectives_json,
         upcoming_plan_json, concerns_json, last_reviewed_at, created_at, updated_at
       ) VALUES (
         @id, @version, @summary, @currentPhase, @priorities,
         @deprioritizedAreas, @activeHypotheses, @nearTermObjectives,
         @upcomingPlan, @concerns, @lastReviewedAt, @ts, @ts
       )`,
    ).run({
      id,
      version,
      summary: input.summary,
      currentPhase: input.currentPhase,
      priorities: JSON.stringify(input.priorities),
      deprioritizedAreas: JSON.stringify(input.deprioritizedAreas),
      activeHypotheses: JSON.stringify(input.activeHypotheses),
      nearTermObjectives: JSON.stringify(input.nearTermObjectives),
      upcomingPlan: JSON.stringify(input.upcomingPlan),
      concerns: JSON.stringify(input.concerns),
      lastReviewedAt: input.lastReviewedAt ?? ts,
      ts,
    });
    return getCurriculumStrategy(db);
  });
  return tx();
}

function getRunRow(db: Db, runId: string): StewardRunRow {
  const row = db.prepare('SELECT * FROM curriculum_steward_runs WHERE id = ?').get(runId) as StewardRunRow | undefined;
  if (!row) throw new ToolError('STEWARD_RUN_NOT_FOUND', `Curriculum Steward run "${runId}" was not found.`);
  return row;
}

export function beginCurriculumStewardRun(
  db: Db,
  input: { idempotencyKey?: string; actor?: string } = {},
) {
  rejectPrivateReasoning(input);
  rejectCredentialContent(input);
  const tx = db.transaction(() => {
    if (input.idempotencyKey) {
      const duplicate = db
        .prepare('SELECT * FROM curriculum_steward_runs WHERE idempotency_key = ?')
        .get(input.idempotencyKey) as StewardRunRow | undefined;
      if (duplicate) return { run: serializeRun(duplicate), reused: true };
    }
    const running = db
      .prepare("SELECT id FROM curriculum_steward_runs WHERE status = 'running' LIMIT 1")
      .get() as { id: string } | undefined;
    if (running) {
      throw new ToolError('STEWARD_RUN_IN_PROGRESS', `Curriculum Steward run "${running.id}" is already active.`);
    }
    const ts = now();
    const id = randomUUID();
    const strategyVersion = getCurriculumStrategy(db).strategyVersion;
    db.prepare(
      `INSERT INTO curriculum_steward_runs (
         id, idempotency_key, actor, status, strategy_version_before,
         actions_json, started_at, created_at, updated_at
       ) VALUES (?, ?, ?, 'running', ?, '[]', ?, ?, ?)`,
    ).run(id, input.idempotencyKey ?? null, input.actor ?? 'curriculum_steward', strategyVersion, ts, ts, ts);
    return { run: serializeRun(getRunRow(db, id)), reused: false };
  });
  return tx();
}

export function completeCurriculumStewardRun(
  db: Db,
  input: {
    runId: string;
    status: 'completed' | 'no_change';
    summary: string;
    actions?: StewardAction[];
    resultingStrategyVersion?: number;
  },
) {
  rejectPrivateReasoning(input);
  rejectCredentialContent(input);
  const tx = db.transaction(() => {
    const existing = getRunRow(db, input.runId);
    if (existing.status !== 'running') {
      if (existing.status === input.status) return { run: serializeRun(existing), reused: true };
      throw new ToolError('STEWARD_RUN_ALREADY_FINISHED', `Run "${input.runId}" already ended as ${existing.status}.`);
    }
    const currentVersion = getCurriculumStrategy(db).strategyVersion;
    const resultingVersion = input.resultingStrategyVersion ?? currentVersion;
    const strategyExists = db
      .prepare('SELECT 1 FROM curriculum_strategies WHERE strategy_version = ?')
      .get(resultingVersion);
    if (!strategyExists) {
      throw new ToolError('INVALID_STRATEGY_VERSION', `Strategy version ${resultingVersion} does not exist.`);
    }
    const actions = sanitizeAuditPayload(input.actions ?? []) as StewardAction[];
    const ts = now();
    db.prepare(
      `UPDATE curriculum_steward_runs SET
         status = ?, strategy_version_after = ?, summary = ?, actions_json = ?,
         error_code = NULL, error_message = NULL, completed_at = ?, updated_at = ?
       WHERE id = ?`,
    ).run(input.status, resultingVersion, input.summary, JSON.stringify(actions), ts, ts, input.runId);
    return { run: serializeRun(getRunRow(db, input.runId)), reused: false };
  });
  return tx();
}

export function failCurriculumStewardRun(
  db: Db,
  input: { runId: string; errorCode: string; errorMessage: string; summary?: string },
) {
  rejectPrivateReasoning(input);
  rejectCredentialContent({ summary: input.summary });
  const tx = db.transaction(() => {
    const existing = getRunRow(db, input.runId);
    if (existing.status !== 'running') {
      if (existing.status === 'failed') return { run: serializeRun(existing), reused: true };
      throw new ToolError('STEWARD_RUN_ALREADY_FINISHED', `Run "${input.runId}" already ended as ${existing.status}.`);
    }
    const ts = now();
    db.prepare(
      `UPDATE curriculum_steward_runs SET
         status = 'failed', strategy_version_after = ?, summary = ?, actions_json = '[]',
         error_code = ?, error_message = ?, completed_at = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      getCurriculumStrategy(db).strategyVersion,
      input.summary ?? 'The Curriculum Steward run failed without changing curriculum.',
      input.errorCode,
      safeErrorMessage(input.errorMessage),
      ts,
      ts,
      input.runId,
    );
    return { run: serializeRun(getRunRow(db, input.runId)), reused: false };
  });
  return tx();
}

export function getRecentCurriculumStewardRuns(db: Db, limit = 10) {
  const boundedLimit = Math.min(Math.max(limit, 1), 50);
  const rows = db
    .prepare(`SELECT * FROM curriculum_steward_runs ORDER BY started_at DESC LIMIT ${boundedLimit}`)
    .all() as StewardRunRow[];
  return rows.map(serializeRun);
}

function scalarCount(db: Db, sql: string, ...params: unknown[]): number {
  return (db.prepare(sql).get(...params) as { count: number }).count;
}

/** Bounded planning snapshot for an external steward. It intentionally excludes secrets and raw logs. */
export function getCurriculumStewardState(
  db: Db,
  options: { roadmapLimit?: number; lessonLimit?: number; runLimit?: number } = {},
) {
  const roadmapLimit = Math.min(Math.max(options.roadmapLimit ?? 20, 1), 50);
  const lessonLimit = Math.min(Math.max(options.lessonLimit ?? 20, 1), 50);
  const runLimit = Math.min(Math.max(options.runLimit ?? 10, 1), 25);
  const roadmaps = listRoadmaps(db, { status: 'all', includeCounts: true });
  const activeRoadmaps = roadmaps
    .filter((roadmap) => roadmap.status === 'draft' || roadmap.status === 'published')
    .slice(0, roadmapLimit);
  const currentAndUpcomingLessons = db.prepare(
    `SELECT n.id, n.roadmap_id AS roadmapId, r.title AS roadmapTitle, n.title,
            n.status, n.estimated_minutes AS estimatedMinutes, n.difficulty,
            n.generated_lesson_id AS generatedLessonId, n.updated_at AS updatedAt
     FROM lesson_nodes n
     JOIN roadmaps r ON r.id = n.roadmap_id
     WHERE r.status IN ('draft', 'published')
       AND n.status IN ('active', 'available', 'generating', 'locked', 'error')
     ORDER BY CASE n.status
       WHEN 'active' THEN 0 WHEN 'available' THEN 1 WHEN 'generating' THEN 2
       WHEN 'error' THEN 3 ELSE 4 END, r.updated_at DESC, n.node_order ASC
     LIMIT ${lessonLimit}`,
  ).all() as Array<Record<string, unknown>>;
  const recentlyCompletedLessons = db.prepare(
    `SELECT n.id, n.roadmap_id AS roadmapId, r.title AS roadmapTitle, n.title,
            n.generated_lesson_id AS generatedLessonId, n.updated_at AS completedAt
     FROM lesson_nodes n
     JOIN roadmaps r ON r.id = n.roadmap_id
     WHERE n.status = 'completed'
     ORDER BY n.updated_at DESC LIMIT ${Math.min(lessonLimit, 20)}`,
  ).all() as Array<Record<string, unknown>>;
  const recentGenerationFailures = db.prepare(
    `SELECT id, entity_type AS entityType, entity_id AS entityId, error_code AS errorCode,
            completed_at AS completedAt
     FROM generation_jobs WHERE status = 'failed'
     ORDER BY updated_at DESC LIMIT 10`,
  ).all() as Array<Record<string, unknown>>;
  const recentAchievements = db.prepare(
    `SELECT a.key, a.title, a.tier, ua.unlocked_at AS unlockedAt
     FROM user_achievements ua
     JOIN achievements a ON a.id = ua.achievement_id
     ORDER BY ua.unlocked_at DESC LIMIT 10`,
  ).all() as Array<Record<string, unknown>>;

  return {
    generatedAt: now(),
    charter: getCurriculumStewardCharter(db),
    strategy: getCurriculumStrategy(db),
    recentRuns: getRecentCurriculumStewardRuns(db, runLimit),
    activeRoadmaps,
    currentAndUpcomingLessons,
    recentlyCompletedLessons,
    learningState: getLearningState(db, { includeDueReviews: true, includeWeaknesses: true, limit: 10 }),
    reviewState: {
      activeReviewSets: scalarCount(db, "SELECT COUNT(*) AS count FROM review_sets WHERE status = 'active'"),
      dueRetrievalItems: scalarCount(
        db,
        "SELECT COUNT(*) AS count FROM retrieval_items WHERE status = 'active' AND due_at <= ?",
        now(),
      ),
      recentAttempts: scalarCount(
        db,
        'SELECT COUNT(*) AS count FROM retrieval_attempts WHERE created_at >= ?',
        new Date(Date.now() - 7 * 86_400_000).toISOString(),
      ),
    },
    diagnostics: {
      completed: scalarCount(db, "SELECT COUNT(*) AS count FROM diagnostic_sessions WHERE status = 'completed'"),
      openRemediations: scalarCount(db, "SELECT COUNT(*) AS count FROM remediation_queue WHERE status = 'open'"),
      recentGenerationFailures,
    },
    progression: {
      unlockedAchievementCount: scalarCount(db, 'SELECT COUNT(*) AS count FROM user_achievements'),
      recentAchievements,
      archivedRoadmapCount: roadmaps.filter((roadmap) => roadmap.status === 'archived').length,
      retiredRoadmapCount: roadmaps.filter((roadmap) => roadmap.status === 'deleted').length,
    },
    limits: { roadmapLimit, lessonLimit, runLimit },
  };
}
