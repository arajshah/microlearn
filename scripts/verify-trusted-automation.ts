#!/usr/bin/env npx tsx
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ServerConfig } from '../server/src/config';
import { initDatabase } from '../server/src/db';
import type { McpAuthContext } from '../server/src/auth/mcpAuth';
import {
  consumeGrantOperation,
  createGrant,
  getGrantForAuth,
  isWithinExecutionWindow,
  setGrantStatus,
  tripCircuitBreaker,
} from '../server/src/automation/automationRepository';
import { structuredAutomationConfirmation } from '../server/src/mcp/tools/automationTools';
import { preauthorizeTrustedMutations, requireTrustedAuthorization } from '../server/src/mcp/trustedAuthorization';
import { policyForTool } from '../server/src/mcp/scopePolicy';
import { createRoadmap, patchRoadmap } from '../server/src/api/repository';
import * as curriculum from '../server/src/curriculum/curriculumRepository';
import { deleteRoadmapTransactionally } from '../server/src/automation/roadmapDeletion';
import { recalculateAchievementRecords } from '../server/src/automation/achievementRepair';
import {
  createReminder,
  createSchedule,
  listSchedules,
} from '../server/src/automation/scheduleRepository';
import { processDueReminders, runDueAutomationJobs } from '../server/src/automation/workerService';

const root = mkdtempSync(path.join(tmpdir(), 'microlearn-automation-'));
const dbPath = path.join(root, 'test.db');
const config: ServerConfig = {
  nodeEnv: 'test',
  port: 0,
  dbPath,
  serviceName: 'microlearn-automation-test',
  repoRoot: process.cwd(),
  enableWriteTools: true,
  enableGitPush: false,
  requireAuth: false,
  mcpBearerToken: '',
  apiBearerToken: '',
  oauthIssuer: '',
  oauthAudience: '',
  oauthResourceUrl: '',
};

const auth = (user: string, client = 'chatgpt-client'): McpAuthContext => ({
  kind: 'oauth',
  subject: user,
  clientId: client,
  scopes: ['microlearn:read', 'microlearn:write', 'microlearn:destructive'],
});

function roadmapInput(id: string, title = 'Automation test roadmap') {
  return {
    id,
    title,
    topic: 'Testing',
    goal: 'Verify trusted automation safely',
    description: 'Temporary verification data',
    masteryLevel: 3,
    depth: 'standard' as const,
    units: [{
      id: `${id}-unit`,
      title: 'Unit one',
      description: 'Test unit',
      order: 0,
      lessons: [{
        id: `${id}-lesson`,
        title: 'Lesson one',
        shortDescription: 'Test lesson',
        learningObjective: 'Understand the test',
        estimatedMinutes: 5,
        difficulty: 1,
        order: 0,
        prerequisiteIds: [],
        keyIdeas: ['safety'],
        status: 'available',
      }],
    }],
  };
}

function expectCode(action: () => unknown, code: string): void {
  assert.throws(action, (error: unknown) => Boolean(error && typeof error === 'object' && 'code' in error && error.code === code));
}

const db = initDatabase(config);
try {
  assert.equal(structuredAutomationConfirmation.safeParse(true).success, true);
  assert.equal(structuredAutomationConfirmation.safeParse(false).success, false);
  const owner = auth('user-one');
  const grant = createGrant(db, owner, {
    capabilities: [
      'roadmap.write', 'roadmap.publish', 'roadmap.delete', 'lesson.write', 'lesson.delete',
      'lesson.generate', 'review.write', 'achievement.recalculate', 'reminder.write',
      'schedule.write', 'diagnostic.read', 'diagnostic.repair',
    ],
    timezone: 'UTC',
    dailyOperationLimit: 100,
    allowWholeRoadmapDelete: true,
    allowBadgeDefinitionChanges: false,
    auditMetadata: { confirmation: { confirmed: true } },
  });
  assert.equal(grant.status, 'active');
  assert.equal(getGrantForAuth(db, owner)?.id, grant.id);
  assert.equal(getGrantForAuth(db, auth('user-one', 'wrong-client')), null);
  assert.equal(getGrantForAuth(db, auth('wrong-user')), null);

  const ctx = { config, db, repoRoot: process.cwd(), auth: owner };
  const used = requireTrustedAuthorization(ctx, 'create_roadmap', {}, { consume: false });
  assert.equal(used.id, grant.id);
  const preflightCtx = { ...ctx, trustedAuthorizations: new Map() };
  preauthorizeTrustedMutations(preflightCtx, {
    method: 'tools/call', params: { name: 'create_roadmap', arguments: {} },
  });
  assert.equal(preflightCtx.trustedAuthorizations.size, 1);
  expectCode(() => requireTrustedAuthorization(ctx, 'create_file', {}, { consume: false }), 'AUTOMATION_NOT_ALLOWED');
  assert.equal(policyForTool('create_file').trustedAutomationAllowed, false);
  assert.equal(policyForTool('push_branch').trustedAutomationAllowed, false);
  assert.equal(policyForTool('delete_roadmap').requiredScopes.includes('microlearn:destructive'), true);

  const editable = curriculum.createRoadmap(db, {
    title: 'Editable roadmap', topic: 'Automation', goal: 'Exercise mutations', description: 'Verification',
    masteryLevel: 2, depth: 'quick', changeSummary: 'Create test roadmap',
    units: [{
      title: 'Existing unit', description: 'Initial', order: 0,
      lessons: [{
        title: 'Existing lesson', shortDescription: 'Initial', learningObjective: 'Start',
        estimatedMinutes: 5, difficulty: 1, order: 0, keyIdeas: ['start'],
      }],
    }],
  });
  const addedUnit = curriculum.createUnit(db, {
    roadmapId: editable.id, title: 'Added unit', description: 'Created by automation', changeSummary: 'Add unit',
  });
  const updatedUnit = curriculum.updateUnit(db, {
    roadmapId: editable.id, unitId: addedUnit.unitId, patch: { title: 'Updated unit' }, changeSummary: 'Edit unit',
  });
  assert.equal(updatedUnit.units.some((unit) => unit.title === 'Updated unit'), true);
  const addedLesson = curriculum.createLessonNode(db, {
    roadmapId: editable.id, unitId: addedUnit.unitId, title: 'Added lesson', shortDescription: 'Created',
    learningObjective: 'Verify lesson creation', estimatedMinutes: 5, difficulty: 1,
    keyIdeas: ['creation'], changeSummary: 'Add lesson',
  });
  const updatedLesson = curriculum.updateLessonNode(db, {
    roadmapId: editable.id, lessonNodeId: addedLesson.lessonNodeId,
    patch: { title: 'Updated lesson' }, changeSummary: 'Edit lesson',
  });
  assert.equal(updatedLesson.units.flatMap((unit) => unit.lessons).some((lesson) => lesson.title === 'Updated lesson'), true);

  createRoadmap(db, roadmapInput('roadmap-delete'));
  patchRoadmap(db, 'roadmap-delete', { status: 'published' });
  const deletion = deleteRoadmapTransactionally(db, 'roadmap-delete');
  assert.equal(deletion.previousStatus, 'published');
  assert.equal(deletion.status, 'deleted');
  assert.equal(deletion.affected.lessonNodes, 1);
  assert.equal((db.prepare('SELECT status FROM roadmaps WHERE id=?').get('roadmap-delete') as { status: string }).status, 'deleted');

  createRoadmap(db, roadmapInput('roadmap-rollback'));
  assert.throws(() => deleteRoadmapTransactionally(db, 'roadmap-rollback', { beforeCommit: () => { throw new Error('test rollback'); } }));
  assert.equal((db.prepare('SELECT status FROM roadmaps WHERE id=?').get('roadmap-rollback') as { status: string }).status, 'draft');

  const badgeRepair = recalculateAchievementRecords(db);
  assert.equal(badgeRepair.awarded.includes('path_starter'), true);
  const badgeRepairAgain = recalculateAchievementRecords(db);
  assert.equal(badgeRepairAgain.awarded.length, 0);

  const firstSchedule = createSchedule(db, {
    grantId: grant.id,
    userId: grant.userId,
    jobType: 'achievement_recalculate',
    schedule: { type: 'once', at: new Date(Date.now() + 60_000).toISOString() },
    timezone: 'UTC',
    idempotencyKey: 'achievement-recalc-once',
  });
  const duplicateSchedule = createSchedule(db, {
    grantId: grant.id,
    userId: grant.userId,
    jobType: 'achievement_recalculate',
    schedule: { type: 'once', at: new Date(Date.now() + 120_000).toISOString() },
    timezone: 'UTC',
    idempotencyKey: 'achievement-recalc-once',
  });
  assert.equal(firstSchedule.id, duplicateSchedule.id);
  assert.equal(listSchedules(db, grant.userId).length, 1);
  db.prepare('UPDATE automation_schedules SET next_run_at=? WHERE id=?').run(new Date(Date.now() - 1_000).toISOString(), firstSchedule.id);
  assert.equal(runDueAutomationJobs(db).executed, 1);
  assert.equal(runDueAutomationJobs(db).executed, 0);

  const weaknessTs = new Date().toISOString();
  db.prepare(
    `INSERT INTO weakness_observations (
       id, concept_slug, weakness_tag, severity, status, evidence_event_ids_json,
       evidence_summary, recommended_action, created_at, updated_at
     ) VALUES ('weakness-1', 'automation-safety', 'low_accuracy', 0.9, 'active', '[]',
       'Stored assessment evidence', 'Targeted review', ?, ?)`,
  ).run(weaknessTs, weaknessTs);
  for (const idempotencyKey of ['review-lesson-one', 'review-lesson-two']) {
    const reviewSchedule = createSchedule(db, {
      grantId: grant.id,
      userId: grant.userId,
      jobType: 'review_lesson',
      schedule: { type: 'once', at: new Date(Date.now() + 60_000).toISOString() },
      payload: { roadmapId: 'roadmap-rollback', limit: 5 },
      timezone: 'UTC',
      idempotencyKey,
    });
    db.prepare('UPDATE automation_schedules SET next_run_at=? WHERE id=?').run(new Date(Date.now() - 1_000).toISOString(), reviewSchedule.id);
    assert.equal(runDueAutomationJobs(db).executed, 1);
  }
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM remediation_queue WHERE concept_slug='automation-safety' AND status='open'").get() as { count: number }).count, 1);
  const snapshotSchedule = createSchedule(db, {
    grantId: grant.id,
    userId: grant.userId,
    jobType: 'learning_snapshot',
    schedule: { type: 'once', at: new Date(Date.now() + 60_000).toISOString() },
    timezone: 'UTC',
    idempotencyKey: 'diagnostic-snapshot-once',
  });
  db.prepare('UPDATE automation_schedules SET next_run_at=? WHERE id=?').run(new Date(Date.now() - 1_000).toISOString(), snapshotSchedule.id);
  assert.equal(runDueAutomationJobs(db).executed, 1);
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM learning_snapshots').get() as { count: number }).count > 0, true);

  const reminder = createReminder(db, {
    grantId: grant.id,
    userId: grant.userId,
    roadmapId: 'roadmap-rollback',
    title: 'Review time',
    body: 'Review your weak topics.',
    channel: 'push',
    schedule: { type: 'once', at: new Date(Date.now() + 60_000).toISOString() },
    timezone: 'UTC',
  });
  db.prepare('UPDATE automation_reminders SET next_trigger_at=? WHERE id=?').run(new Date(Date.now() - 1_000).toISOString(), reminder.id);
  const reminders = processDueReminders(db);
  assert.equal(reminders.unconfigured, 1);
  assert.equal((db.prepare('SELECT status FROM notification_jobs WHERE reminder_id=?').get(reminder.id) as { status: string }).status, 'unconfigured');
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM automation_reminders WHERE id=?').get(reminder.id) as { count: number }).count, 1);

  const restricted = createGrant(db, auth('restricted-user'), {
    capabilities: ['roadmap.write'],
    roadmapIds: ['allowed-roadmap'],
    timezone: 'UTC',
    allowWholeRoadmapDelete: false,
    allowBadgeDefinitionChanges: false,
    auditMetadata: { bearerToken: 'must-not-be-stored' },
  });
  assert.deepEqual(restricted.auditMetadata, { bearerToken: '[redacted]' });
  const restrictedCtx = { ...ctx, auth: auth('restricted-user') };
  assert.equal(requireTrustedAuthorization(restrictedCtx, 'update_roadmap', { roadmapId: 'allowed-roadmap' }, { consume: false }).id, restricted.id);
  expectCode(
    () => requireTrustedAuthorization(restrictedCtx, 'update_roadmap', { roadmapId: 'other-roadmap' }, { consume: false }),
    'AUTOMATION_ROADMAP_DENIED',
  );
  expectCode(
    () => preauthorizeTrustedMutations({ ...restrictedCtx, trustedAuthorizations: new Map() }, [
      { method: 'tools/call', params: { name: 'update_roadmap', arguments: { roadmapId: 'allowed-roadmap' } } },
      { method: 'tools/call', params: { name: 'update_roadmap', arguments: { roadmapId: 'other-roadmap' } } },
    ]),
    'AUTOMATION_ROADMAP_DENIED',
  );

  const limitedAuth = auth('limited-user');
  const limited = createGrant(db, limitedAuth, {
    capabilities: ['roadmap.write'],
    dailyOperationLimit: 1,
    timezone: 'UTC',
    allowWholeRoadmapDelete: false,
    allowBadgeDefinitionChanges: false,
  });
  consumeGrantOperation(db, limited.id);
  expectCode(() => consumeGrantOperation(db, limited.id), 'AUTOMATION_DAILY_LIMIT');
  setGrantStatus(db, limitedAuth, limited.id, 'paused');
  expectCode(
    () => requireTrustedAuthorization({ ...ctx, auth: limitedAuth }, 'create_roadmap', {}, { consume: false }),
    'AUTOMATION_INACTIVE',
  );
  setGrantStatus(db, limitedAuth, limited.id, 'active');
  tripCircuitBreaker(db, limited.id, 'verification breaker', limitedAuth);
  expectCode(
    () => requireTrustedAuthorization({ ...ctx, auth: limitedAuth }, 'create_roadmap', {}, { consume: false }),
    'AUTOMATION_CIRCUIT_BROKEN',
  );
  expectCode(
    () => preauthorizeTrustedMutations({ ...ctx, auth: limitedAuth, trustedAuthorizations: new Map() }, {
      method: 'tools/call', params: { name: 'create_roadmap', arguments: {} },
    }),
    'AUTOMATION_CIRCUIT_BROKEN',
  );

  const windowAuth = auth('window-user');
  const tomorrow = (new Date().getUTCDay() + 1) % 7;
  const windowGrant = createGrant(db, windowAuth, {
    capabilities: ['roadmap.write'],
    executionWindows: [{ days: [tomorrow], start: '00:00', end: '23:59' }],
    timezone: 'UTC',
    allowWholeRoadmapDelete: false,
    allowBadgeDefinitionChanges: false,
  });
  assert.equal(isWithinExecutionWindow(windowGrant), false);
  expectCode(
    () => requireTrustedAuthorization({ ...ctx, auth: windowAuth }, 'create_roadmap', {}, { consume: false }),
    'AUTOMATION_OUTSIDE_WINDOW',
  );

  const failureAuth = auth('failure-user');
  const failureGrant = createGrant(db, failureAuth, {
    capabilities: ['schedule.write', 'diagnostic.read'],
    timezone: 'UTC',
    allowWholeRoadmapDelete: false,
    allowBadgeDefinitionChanges: false,
  });
  const failureSchedule = createSchedule(db, {
    grantId: failureGrant.id,
    userId: failureGrant.userId,
    jobType: 'roadmap_health_check',
    schedule: { type: 'interval', intervalMinutes: 5 },
    payload: { roadmapId: 'missing-roadmap' },
    timezone: 'UTC',
    retryLimit: 3,
    idempotencyKey: 'repeated-failure-test',
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    db.prepare("UPDATE automation_schedules SET status='active', next_run_at=? WHERE id=?")
      .run(new Date(Date.now() - 10_000 - attempt * 60_000).toISOString(), failureSchedule.id);
    const run = runDueAutomationJobs(db);
    assert.equal(run.failed, 1, `worker failure attempt ${attempt + 1}`);
    assert.equal(getGrantForAuth(db, failureAuth)?.failureCount, attempt + 1);
  }
  assert.equal(getGrantForAuth(db, failureAuth)?.status, 'circuit-broken');

  const revokedAuth = auth('revoked-user');
  const revoked = createGrant(db, revokedAuth, {
    capabilities: ['roadmap.write'], timezone: 'UTC',
    allowWholeRoadmapDelete: false, allowBadgeDefinitionChanges: false,
  });
  setGrantStatus(db, revokedAuth, revoked.id, 'revoked');
  assert.equal(getGrantForAuth(db, revokedAuth), null);

  const beforeCloseGrantId = getGrantForAuth(db, owner)?.id;
  db.close();
  const reopened = initDatabase(config);
  try {
    assert.equal(getGrantForAuth(reopened, owner)?.id, beforeCloseGrantId);
    assert.equal((reopened.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE id='0009_trusted_automation'").get() as { count: number }).count, 1);
  } finally {
    reopened.close();
  }

  console.log('Trusted Automation verification passed.');
  console.log('  grants, restrictions, deletion rollback, badges, schedules, reminders, and worker breaker validated');
} finally {
  if (db.open) db.close();
  rmSync(root, { recursive: true, force: true });
}
