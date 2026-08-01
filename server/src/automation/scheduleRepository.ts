import { randomUUID } from 'node:crypto';
import type { Db } from '../db';
import { ToolError } from '../mcp/repoSafety';
import type { AutomationJobType, AutomationScheduleSpec, ReminderChannel } from './types';

interface ScheduleRow {
  id: string;
  grant_id: string;
  user_id: string;
  job_type: AutomationJobType;
  status: string;
  schedule_type: string;
  schedule_json: string;
  payload_json: string;
  timezone: string;
  next_run_at: string | null;
  last_run_at: string | null;
  retry_limit: number;
  consecutive_failures: number;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
}

interface ReminderRow {
  id: string;
  grant_id: string;
  user_id: string;
  roadmap_id: string | null;
  title: string;
  body: string;
  channel: ReminderChannel;
  status: string;
  timezone: string;
  schedule_json: string;
  next_trigger_at: string | null;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
}

function now(): string {
  return new Date().toISOString();
}

function localTime(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(date);
  } catch {
    throw new ToolError('INVALID_TIMEZONE', `Unsupported timezone "${timezone}".`);
  }
}

/** Pure next-run calculation shared by MCP writes and the standalone worker. */
export function calculateNextRun(spec: AutomationScheduleSpec, timezone: string, from = new Date()): string | null {
  if (spec.type === 'once') {
    if (!spec.at || !Number.isFinite(Date.parse(spec.at))) throw new ToolError('INVALID_SCHEDULE', 'A valid ISO "at" value is required.');
    return Date.parse(spec.at) > from.getTime() ? new Date(spec.at).toISOString() : null;
  }
  if (spec.type === 'interval') {
    if (!spec.intervalMinutes || spec.intervalMinutes < 1) throw new ToolError('INVALID_SCHEDULE', 'intervalMinutes must be positive.');
    return new Date(from.getTime() + spec.intervalMinutes * 60_000).toISOString();
  }
  if (!spec.timeOfDay || !/^([01]\d|2[0-3]):[0-5]\d$/.test(spec.timeOfDay)) {
    throw new ToolError('INVALID_SCHEDULE', 'Daily schedules require timeOfDay in HH:mm format.');
  }
  for (let minutes = 1; minutes <= 48 * 60; minutes += 1) {
    const candidate = new Date(from.getTime() + minutes * 60_000);
    if (localTime(candidate, timezone) === spec.timeOfDay) return candidate.toISOString();
  }
  throw new ToolError('INVALID_SCHEDULE', 'Could not calculate the next daily run.');
}

function serializeSchedule(row: ScheduleRow) {
  return {
    id: row.id,
    grantId: row.grant_id,
    userId: row.user_id,
    jobType: row.job_type,
    status: row.status,
    schedule: JSON.parse(row.schedule_json) as AutomationScheduleSpec,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    timezone: row.timezone,
    nextRunAt: row.next_run_at ?? undefined,
    lastRunAt: row.last_run_at ?? undefined,
    retryLimit: row.retry_limit,
    consecutiveFailures: row.consecutive_failures,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeReminder(row: ReminderRow) {
  return {
    id: row.id,
    grantId: row.grant_id,
    userId: row.user_id,
    roadmapId: row.roadmap_id ?? undefined,
    title: row.title,
    body: row.body,
    channel: row.channel,
    status: row.status,
    timezone: row.timezone,
    schedule: JSON.parse(row.schedule_json) as AutomationScheduleSpec,
    nextTriggerAt: row.next_trigger_at ?? undefined,
    lastTriggeredAt: row.last_triggered_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listSchedules(db: Db, userId: string) {
  return (db.prepare('SELECT * FROM automation_schedules WHERE user_id=? ORDER BY created_at DESC').all(userId) as ScheduleRow[]).map(serializeSchedule);
}

export function getSchedule(db: Db, userId: string, id: string) {
  const row = db.prepare('SELECT * FROM automation_schedules WHERE id=? AND user_id=?').get(id, userId) as ScheduleRow | undefined;
  if (!row) throw new ToolError('NOT_FOUND', `Automation schedule "${id}" not found.`);
  return serializeSchedule(row);
}

export function createSchedule(db: Db, input: {
  grantId: string; userId: string; jobType: AutomationJobType; schedule: AutomationScheduleSpec;
  payload?: Record<string, unknown>; timezone: string; retryLimit?: number; idempotencyKey: string;
}) {
  const existing = db.prepare('SELECT * FROM automation_schedules WHERE grant_id=? AND idempotency_key=?')
    .get(input.grantId, input.idempotencyKey) as ScheduleRow | undefined;
  if (existing) return serializeSchedule(existing);
  const ts = now();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO automation_schedules (
       id, grant_id, user_id, job_type, status, schedule_type, schedule_json,
       payload_json, timezone, next_run_at, retry_limit, idempotency_key, created_at, updated_at
     ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, input.grantId, input.userId, input.jobType, input.schedule.type,
    JSON.stringify(input.schedule), JSON.stringify(input.payload ?? {}), input.timezone,
    calculateNextRun(input.schedule, input.timezone, new Date(ts)), input.retryLimit ?? 3,
    input.idempotencyKey, ts, ts,
  );
  return getSchedule(db, input.userId, id);
}

export function updateSchedule(db: Db, userId: string, id: string, patch: {
  schedule?: AutomationScheduleSpec; payload?: Record<string, unknown>; timezone?: string; retryLimit?: number;
}) {
  const before = getSchedule(db, userId, id);
  const schedule = patch.schedule ?? before.schedule;
  const timezone = patch.timezone ?? before.timezone;
  const ts = now();
  db.prepare(
    `UPDATE automation_schedules SET schedule_type=?, schedule_json=?, payload_json=?, timezone=?,
       next_run_at=?, retry_limit=?, consecutive_failures=0, updated_at=? WHERE id=? AND user_id=?`,
  ).run(
    schedule.type, JSON.stringify(schedule), JSON.stringify(patch.payload ?? before.payload), timezone,
    calculateNextRun(schedule, timezone, new Date(ts)), patch.retryLimit ?? before.retryLimit, ts, id, userId,
  );
  return getSchedule(db, userId, id);
}

export function setScheduleStatus(db: Db, userId: string, id: string, status: 'active' | 'paused') {
  const before = getSchedule(db, userId, id);
  const next = status === 'active' ? calculateNextRun(before.schedule, before.timezone, new Date()) : before.nextRunAt ?? null;
  db.prepare('UPDATE automation_schedules SET status=?, next_run_at=?, updated_at=? WHERE id=? AND user_id=?')
    .run(status, next, now(), id, userId);
  return getSchedule(db, userId, id);
}

export function deleteSchedule(db: Db, userId: string, id: string) {
  const before = getSchedule(db, userId, id);
  db.prepare('DELETE FROM automation_schedules WHERE id=? AND user_id=?').run(id, userId);
  return { id, deleted: true, previousStatus: before.status };
}

export function listReminders(db: Db, userId: string) {
  return (db.prepare('SELECT * FROM automation_reminders WHERE user_id=? ORDER BY created_at DESC').all(userId) as ReminderRow[]).map(serializeReminder);
}

export function getReminder(db: Db, userId: string, id: string) {
  const row = db.prepare('SELECT * FROM automation_reminders WHERE id=? AND user_id=?').get(id, userId) as ReminderRow | undefined;
  if (!row) throw new ToolError('NOT_FOUND', `Automation reminder "${id}" not found.`);
  return serializeReminder(row);
}

export function createReminder(db: Db, input: {
  grantId: string; userId: string; roadmapId?: string; title: string; body: string;
  channel: ReminderChannel; schedule: AutomationScheduleSpec; timezone: string;
}) {
  const ts = now();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO automation_reminders (
       id, grant_id, user_id, roadmap_id, title, body, channel, status,
       timezone, schedule_json, next_trigger_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
  ).run(
    id, input.grantId, input.userId, input.roadmapId ?? null, input.title, input.body,
    input.channel, input.timezone, JSON.stringify(input.schedule),
    calculateNextRun(input.schedule, input.timezone, new Date(ts)), ts, ts,
  );
  return getReminder(db, input.userId, id);
}

export function updateReminder(db: Db, userId: string, id: string, patch: {
  title?: string; body?: string; channel?: ReminderChannel; schedule?: AutomationScheduleSpec; timezone?: string;
}) {
  const before = getReminder(db, userId, id);
  const schedule = patch.schedule ?? before.schedule;
  const timezone = patch.timezone ?? before.timezone;
  const ts = now();
  db.prepare(
    `UPDATE automation_reminders SET title=?, body=?, channel=?, schedule_json=?, timezone=?,
       next_trigger_at=?, updated_at=? WHERE id=? AND user_id=?`,
  ).run(
    patch.title ?? before.title, patch.body ?? before.body, patch.channel ?? before.channel,
    JSON.stringify(schedule), timezone, calculateNextRun(schedule, timezone, new Date(ts)), ts, id, userId,
  );
  return getReminder(db, userId, id);
}

export function setReminderStatus(db: Db, userId: string, id: string, status: 'active' | 'paused') {
  const before = getReminder(db, userId, id);
  const next = status === 'active' ? calculateNextRun(before.schedule, before.timezone, new Date()) : before.nextTriggerAt ?? null;
  db.prepare('UPDATE automation_reminders SET status=?, next_trigger_at=?, updated_at=? WHERE id=? AND user_id=?')
    .run(status, next, now(), id, userId);
  return getReminder(db, userId, id);
}

export function deleteReminder(db: Db, userId: string, id: string) {
  const before = getReminder(db, userId, id);
  db.prepare('DELETE FROM automation_reminders WHERE id=? AND user_id=?').run(id, userId);
  return { id, deleted: true, previousStatus: before.status };
}
