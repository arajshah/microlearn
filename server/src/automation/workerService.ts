import { randomUUID } from 'node:crypto';
import type { Db } from '../db';
import type { McpAuthContext } from '../auth/mcpAuth';
import { buildCurrentLearningSnapshot, storeLearningSnapshot } from '../adaptive/snapshots';
import { recommendRemediationForWeaknesses } from '../adaptive/remediation';
import { validateRoadmap } from '../curriculum/curriculumRepository';
import { recalculateAchievementRecords } from './achievementRepair';
import {
  consumeScheduledGrantOperation,
  getGrantById,
  noteAutomationFailure,
  recordAutomationAudit,
  tripCircuitBreaker,
} from './automationRepository';
import { calculateNextRun } from './scheduleRepository';
import type { AutomationCapability, AutomationJobType, AutomationScheduleSpec } from './types';

interface DueScheduleRow {
  id: string;
  grant_id: string;
  user_id: string;
  job_type: AutomationJobType;
  schedule_json: string;
  payload_json: string;
  timezone: string;
  next_run_at: string;
  retry_limit: number;
  consecutive_failures: number;
}

const JOB_CAPABILITIES: Record<AutomationJobType, AutomationCapability> = {
  learning_snapshot: 'diagnostic.repair',
  achievement_recalculate: 'achievement.recalculate',
  review_lesson: 'review.write',
  roadmap_health_check: 'diagnostic.read',
};

function workerAuth(userId: string, clientId?: string): McpAuthContext {
  return { kind: 'oauth', subject: userId, clientId: clientId ?? 'automation-worker', scopes: [] };
}

function executeJob(db: Db, row: DueScheduleRow, payload: Record<string, unknown>) {
  switch (row.job_type) {
    case 'learning_snapshot':
      return { snapshot: storeLearningSnapshot(db, buildCurrentLearningSnapshot(db)) };
    case 'achievement_recalculate':
      return recalculateAchievementRecords(db);
    case 'review_lesson':
      return recommendRemediationForWeaknesses(db, {
        roadmapId: typeof payload.roadmapId === 'string' ? payload.roadmapId : undefined,
        limit: typeof payload.limit === 'number' ? payload.limit : 5,
      });
    case 'roadmap_health_check': {
      if (typeof payload.roadmapId !== 'string') throw new Error('ROADMAP_ID_REQUIRED');
      return validateRoadmap(db, payload.roadmapId);
    }
  }
}

function nextAfterSuccess(row: DueScheduleRow, completedAt: Date): string | null {
  const spec = JSON.parse(row.schedule_json) as AutomationScheduleSpec;
  return spec.type === 'once' ? null : calculateNextRun(spec, row.timezone, completedAt);
}

function roadmapIdFromPayload(payload: Record<string, unknown>): string | undefined {
  return typeof payload.roadmapId === 'string' ? payload.roadmapId : undefined;
}

export function runDueAutomationJobs(db: Db, at = new Date()): { executed: number; failed: number; skipped: number } {
  const rows = db.prepare(
    `SELECT * FROM automation_schedules WHERE status='active' AND next_run_at IS NOT NULL AND next_run_at<=?
     ORDER BY next_run_at ASC LIMIT 50`,
  ).all(at.toISOString()) as DueScheduleRow[];
  let executed = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    const grant = getGrantById(db, row.grant_id);
    const auth = workerAuth(row.user_id, grant?.oauthClientId);
    const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
    try {
      consumeScheduledGrantOperation(db, {
        grantId: row.grant_id,
        capability: JOB_CAPABILITIES[row.job_type],
        roadmapId: roadmapIdFromPayload(payload),
        at,
      });
    } catch (error) {
      skipped += 1;
      db.prepare("UPDATE automation_schedules SET status='paused', updated_at=? WHERE id=?").run(at.toISOString(), row.id);
      recordAutomationAudit(db, auth, {
        grantId: row.grant_id,
        toolName: 'automation_worker_authorization',
        capability: JOB_CAPABILITIES[row.job_type],
        result: 'rejected',
        metadata: { scheduleId: row.id, code: error instanceof Error ? error.name : 'AUTHORIZATION_REJECTED' },
      });
      continue;
    }

    const executionKey = `${row.id}:${row.next_run_at}`;
    if (db.prepare('SELECT id FROM automation_job_executions WHERE idempotency_key=?').get(executionKey)) {
      skipped += 1;
      continue;
    }
    const executionId = randomUUID();
    db.prepare(
      `INSERT INTO automation_job_executions (
         id, schedule_id, grant_id, status, scheduled_for, idempotency_key, attempt, started_at
       ) VALUES (?, ?, ?, 'running', ?, ?, ?, ?)`,
    ).run(executionId, row.id, row.grant_id, row.next_run_at, executionKey, row.consecutive_failures + 1, at.toISOString());

    try {
      const result = executeJob(db, row, payload);
      if (row.job_type === 'roadmap_health_check' && 'errors' in result && result.errors.length >= 10) {
        tripCircuitBreaker(db, row.grant_id, 'Health check detected substantial curriculum corruption.', auth);
      }
      const completedAt = new Date();
      const next = nextAfterSuccess(row, completedAt);
      db.transaction(() => {
        db.prepare("UPDATE automation_job_executions SET status='succeeded', completed_at=?, result_json=? WHERE id=?")
          .run(completedAt.toISOString(), JSON.stringify(result), executionId);
        db.prepare(
          `UPDATE automation_schedules SET status=?, last_run_at=?, next_run_at=?,
             consecutive_failures=0, updated_at=? WHERE id=?`,
        ).run(next ? 'active' : 'completed', completedAt.toISOString(), next, completedAt.toISOString(), row.id);
      })();
      recordAutomationAudit(db, auth, {
        grantId: row.grant_id,
        jobId: executionId,
        toolName: 'automation_worker_execution',
        capability: JOB_CAPABILITIES[row.job_type],
        result: 'succeeded',
        metadata: { scheduleId: row.id, jobType: row.job_type },
      });
      executed += 1;
    } catch {
      const completedAt = new Date();
      const failures = row.consecutive_failures + 1;
      const stop = failures >= row.retry_limit;
      const retryAt = stop ? row.next_run_at : new Date(completedAt.getTime() + Math.min(2 ** failures, 60) * 60_000).toISOString();
      db.transaction(() => {
        db.prepare("UPDATE automation_job_executions SET status='failed', completed_at=?, error_code='JOB_FAILED' WHERE id=?")
          .run(completedAt.toISOString(), executionId);
        db.prepare(
          'UPDATE automation_schedules SET consecutive_failures=?, status=?, next_run_at=?, updated_at=? WHERE id=?',
        ).run(failures, stop ? 'paused' : 'active', retryAt, completedAt.toISOString(), row.id);
      })();
      noteAutomationFailure(db, row.grant_id, 'Scheduled job repeatedly failed.', auth);
      recordAutomationAudit(db, auth, {
        grantId: row.grant_id,
        jobId: executionId,
        toolName: 'automation_worker_execution',
        capability: JOB_CAPABILITIES[row.job_type],
        result: 'failed',
        metadata: { scheduleId: row.id, jobType: row.job_type, code: 'JOB_FAILED' },
      });
      failed += 1;
    }
  }
  return { executed, failed, skipped };
}

export function processDueReminders(db: Db, at = new Date()): { queued: number; unconfigured: number; skipped: number } {
  const rows = db.prepare(
    `SELECT * FROM automation_reminders WHERE status='active' AND next_trigger_at IS NOT NULL AND next_trigger_at<=?
     ORDER BY next_trigger_at ASC LIMIT 100`,
  ).all(at.toISOString()) as Array<{
    id: string; grant_id: string; user_id: string; roadmap_id: string | null; channel: string;
    title: string; body: string; schedule_json: string; timezone: string; next_trigger_at: string;
  }>;
  let queued = 0;
  let unconfigured = 0;
  let skipped = 0;
  for (const row of rows) {
    const grant = getGrantById(db, row.grant_id);
    const auth = workerAuth(row.user_id, grant?.oauthClientId);
    try {
      consumeScheduledGrantOperation(db, {
        grantId: row.grant_id,
        capability: 'reminder.write',
        roadmapId: row.roadmap_id ?? undefined,
        at,
      });
    } catch {
      skipped += 1;
      db.prepare("UPDATE automation_reminders SET status='paused', updated_at=? WHERE id=?").run(at.toISOString(), row.id);
      continue;
    }
    const status = row.channel === 'push' ? 'unconfigured' : 'pending';
    if (status === 'unconfigured') unconfigured += 1;
    else queued += 1;
    const ts = at.toISOString();
    const spec = JSON.parse(row.schedule_json) as AutomationScheduleSpec;
    const next = spec.type === 'once' ? null : calculateNextRun(spec, row.timezone, at);
    db.transaction(() => {
      db.prepare(
        `INSERT OR IGNORE INTO notification_jobs (
           id, reminder_id, channel, status, scheduled_for, payload_json, error_code, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        randomUUID(), row.id, row.channel, status, row.next_trigger_at,
        JSON.stringify({ title: row.title, body: row.body }),
        status === 'unconfigured' ? 'PUSH_NOT_CONFIGURED' : null, ts, ts,
      );
      db.prepare('UPDATE automation_reminders SET status=?, last_triggered_at=?, next_trigger_at=?, updated_at=? WHERE id=?')
        .run(next ? 'active' : 'completed', ts, next, ts, row.id);
    })();
    recordAutomationAudit(db, auth, {
      grantId: row.grant_id,
      jobId: row.id,
      toolName: 'automation_reminder_delivery',
      capability: 'reminder.write',
      result: status,
      metadata: { channel: row.channel, pushConfigured: row.channel !== 'push' },
    });
  }
  return { queued, unconfigured, skipped };
}
