import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../context';
import { assertWriteEnabled } from '../guards';
import { ToolError } from '../repoSafety';
import { runTool } from '../toolSchemas';
import { requireTrustedAuthorization } from '../trustedAuthorization';
import {
  automationIdentity,
  createGrant,
  getGrantForAuth,
  recordAutomationAudit,
  setGrantStatus,
  tripCircuitBreaker,
  updateGrant,
} from '../../automation/automationRepository';
import { deleteRoadmapTransactionally } from '../../automation/roadmapDeletion';
import { recalculateAchievementRecords } from '../../automation/achievementRepair';
import {
  createReminder,
  createSchedule,
  deleteReminder,
  deleteSchedule,
  listReminders,
  listSchedules,
  setReminderStatus,
  setScheduleStatus,
  updateReminder,
  updateSchedule,
} from '../../automation/scheduleRepository';
import {
  AUTOMATION_CAPABILITIES,
  AUTOMATION_JOB_TYPES,
  type AutomationCapability,
  type AutomationJobType,
} from '../../automation/types';

const DEFAULT_CAPABILITIES: AutomationCapability[] = AUTOMATION_CAPABILITIES.filter(
  (capability) => capability !== 'roadmap.delete' && capability !== 'achievement.definitions',
);
export const structuredAutomationConfirmation = z.literal(true);
const capabilitySchema = z.enum(AUTOMATION_CAPABILITIES);
const executionWindowSchema = z.object({
  days: z.array(z.number().int().min(0).max(6)).optional(),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});
const scheduleSpecSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('once'), at: z.string().datetime({ offset: true }) }),
  z.object({ type: z.literal('interval'), intervalMinutes: z.number().int().min(5).max(43_200) }),
  z.object({ type: z.literal('daily'), timeOfDay: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) }),
]);

function validateTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
  } catch {
    throw new ToolError('INVALID_TIMEZONE', `Unsupported timezone "${timezone}".`);
  }
}

function requiresExpansionConfirmation(
  current: NonNullable<ReturnType<typeof getGrantForAuth>>,
  patch: {
    capabilities?: AutomationCapability[];
    roadmapIds?: string[] | null;
    allowWholeRoadmapDelete?: boolean;
    allowBadgeDefinitionChanges?: boolean;
  },
): boolean {
  if (patch.capabilities?.some((capability) => !current.capabilities.includes(capability))) return true;
  if (patch.allowWholeRoadmapDelete && !current.allowWholeRoadmapDelete) return true;
  if (patch.allowBadgeDefinitionChanges && !current.allowBadgeDefinitionChanges) return true;
  if (current.roadmapIds?.length && (patch.roadmapIds === null || patch.roadmapIds?.some((id) => !current.roadmapIds!.includes(id)))) return true;
  return false;
}

const JOB_CAPABILITIES: Record<AutomationJobType, AutomationCapability> = {
  learning_snapshot: 'diagnostic.repair',
  achievement_recalculate: 'achievement.recalculate',
  review_lesson: 'review.write',
  roadmap_health_check: 'diagnostic.read',
};

/** Registers persistent Trusted Automation, scheduling, reminder, and repair tools. */
export function registerAutomationTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'enable_trusted_automation',
    {
      title: 'Enable Trusted Automation',
      description: 'Create a persistent, client-bound grant. Requires confirmed: true.',
      inputSchema: {
        confirmed: structuredAutomationConfirmation,
        capabilities: z.array(capabilitySchema).min(1).optional(),
        roadmapIds: z.array(z.string().min(1)).min(1).optional(),
        dailyOperationLimit: z.number().int().min(1).max(10_000).optional(),
        executionWindows: z.array(executionWindowSchema).max(20).optional(),
        timezone: z.string().min(1).optional(),
        expiresAt: z.string().datetime({ offset: true }).optional(),
        allowWholeRoadmapDelete: z.boolean().optional(),
        allowBadgeDefinitionChanges: z.boolean().optional(),
        auditMetadata: z.record(z.string(), z.unknown()).optional(),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) => runTool(() => {
      assertWriteEnabled(ctx.config);
      const timezone = args.timezone ?? 'UTC';
      validateTimezone(timezone);
      const requested = args.capabilities ?? DEFAULT_CAPABILITIES;
      const capabilities = [...requested];
      if (args.allowWholeRoadmapDelete && !capabilities.includes('roadmap.delete')) capabilities.push('roadmap.delete');
      if (args.allowBadgeDefinitionChanges && !capabilities.includes('achievement.definitions')) capabilities.push('achievement.definitions');
      return {
        grant: createGrant(ctx.db, ctx.auth, {
          capabilities,
          roadmapIds: args.roadmapIds,
          dailyOperationLimit: args.dailyOperationLimit,
          executionWindows: args.executionWindows,
          timezone,
          expiresAt: args.expiresAt,
          allowWholeRoadmapDelete: args.allowWholeRoadmapDelete ?? false,
          allowBadgeDefinitionChanges: args.allowBadgeDefinitionChanges ?? false,
          auditMetadata: args.auditMetadata,
        }),
      };
    }),
  );

  server.registerTool(
    'get_trusted_automation_status',
    {
      title: 'Get Trusted Automation status',
      description: 'Return the current grant, including pause, expiration, limits, and circuit-breaker state.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => runTool(() => ({ grant: getGrantForAuth(ctx.db, ctx.auth) })),
  );

  server.registerTool(
    'update_trusted_automation',
    {
      title: 'Update Trusted Automation',
      description: 'Update grant boundaries. Expansion or circuit-breaker resume requires confirmed: true.',
      inputSchema: {
        grantId: z.string().min(1),
        capabilities: z.array(capabilitySchema).min(1).optional(),
        roadmapIds: z.array(z.string().min(1)).min(1).nullable().optional(),
        dailyOperationLimit: z.number().int().min(1).max(10_000).nullable().optional(),
        executionWindows: z.array(executionWindowSchema).max(20).nullable().optional(),
        timezone: z.string().min(1).optional(),
        expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
        allowWholeRoadmapDelete: z.boolean().optional(),
        allowBadgeDefinitionChanges: z.boolean().optional(),
        auditMetadata: z.record(z.string(), z.unknown()).optional(),
        resume: z.boolean().optional(),
        confirmed: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) => runTool(() => {
      assertWriteEnabled(ctx.config);
      const current = getGrantForAuth(ctx.db, ctx.auth);
      if (!current || current.id !== args.grantId) throw new ToolError('AUTOMATION_GRANT_NOT_FOUND', 'Grant not found for this user and client.');
      if ((requiresExpansionConfirmation(current, args) || args.resume) && args.confirmed !== true) {
        throw new ToolError('EXCEPTIONAL_CONFIRMATION_REQUIRED', 'Expanding or resuming Trusted Automation requires confirmed: true.');
      }
      if (args.timezone) validateTimezone(args.timezone);
      let grant = updateGrant(ctx.db, ctx.auth, args.grantId, {
        capabilities: args.capabilities,
        roadmapIds: args.roadmapIds,
        dailyOperationLimit: args.dailyOperationLimit,
        executionWindows: args.executionWindows,
        timezone: args.timezone,
        expiresAt: args.expiresAt,
        allowWholeRoadmapDelete: args.allowWholeRoadmapDelete,
        allowBadgeDefinitionChanges: args.allowBadgeDefinitionChanges,
        auditMetadata: args.auditMetadata,
      });
      if (args.resume) grant = setGrantStatus(ctx.db, ctx.auth, args.grantId, 'active');
      return { grant };
    }),
  );

  server.registerTool(
    'pause_trusted_automation',
    {
      title: 'Pause Trusted Automation',
      description: 'Pause all trusted mutations and worker activity for this grant.',
      inputSchema: { grantId: z.string().min(1) },
      annotations: { readOnlyHint: false },
    },
    async (args) => runTool(() => {
      assertWriteEnabled(ctx.config);
      return { grant: setGrantStatus(ctx.db, ctx.auth, args.grantId, 'paused') };
    }),
  );

  server.registerTool(
    'revoke_trusted_automation',
    {
      title: 'Revoke Trusted Automation',
      description: 'Permanently revoke this grant. Requires confirmed: true.',
      inputSchema: { grantId: z.string().min(1), confirmed: structuredAutomationConfirmation },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async (args) => runTool(() => {
      assertWriteEnabled(ctx.config);
      return { grant: setGrantStatus(ctx.db, ctx.auth, args.grantId, 'revoked') };
    }),
  );

  server.registerTool(
    'delete_roadmap',
    {
      title: 'Delete roadmap',
      description: 'Transactionally soft-delete a roadmap. Requires confirmed: true or explicit roadmap.delete authority.',
      inputSchema: {
        roadmapId: z.string().min(1),
        confirmed: z.boolean().optional(),
        changeSummary: z.string().min(1),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async (args) => runTool(() => {
      assertWriteEnabled(ctx.config);
      const trusted = args.confirmed === true
        ? null
        : requireTrustedAuthorization(ctx, 'delete_roadmap', args, { requireWholeRoadmapDelete: true });
      const size = (ctx.db.prepare(
        `SELECT (SELECT COUNT(*) FROM lesson_nodes WHERE roadmap_id=?)
          + (SELECT COUNT(*) FROM generated_lessons WHERE roadmap_id=?)
          + (SELECT COUNT(*) FROM retrieval_items WHERE roadmap_id=?) AS count`,
      ).get(args.roadmapId, args.roadmapId, args.roadmapId) as { count: number }).count;
      if (size > 1_000 && args.confirmed !== true) {
        if (trusted) tripCircuitBreaker(ctx.db, trusted.id, 'Roadmap deletion exceeded the server-controlled volume threshold.', ctx.auth);
        throw new ToolError('EXCEPTIONAL_CONFIRMATION_REQUIRED', 'Large roadmap deletion requires confirmed: true.');
      }
      const before = ctx.db.prepare('SELECT id, status, version FROM roadmaps WHERE id=?').get(args.roadmapId);
      const summary = deleteRoadmapTransactionally(ctx.db, args.roadmapId);
      recordAutomationAudit(ctx.db, ctx.auth, {
        grantId: trusted?.id,
        toolName: 'delete_roadmap',
        targetIds: [args.roadmapId],
        capability: 'roadmap.delete',
        result: 'soft-deleted',
        before,
        after: summary,
        metadata: { changeSummary: args.changeSummary, exceptionalConfirmation: args.confirmed === true },
      });
      return { summary };
    }),
  );

  server.registerTool(
    'recalculate_achievements',
    {
      title: 'Recalculate achievements',
      description: 'Repair achievement records from persisted evidence while preserving one-way unlock semantics.',
      inputSchema: {},
      annotations: { readOnlyHint: false },
    },
    async (args) => runTool(() => {
      assertWriteEnabled(ctx.config);
      const grant = requireTrustedAuthorization(ctx, 'recalculate_achievements', args);
      const result = recalculateAchievementRecords(ctx.db);
      recordAutomationAudit(ctx.db, ctx.auth, {
        grantId: grant.id,
        toolName: 'recalculate_achievements',
        capability: 'achievement.recalculate',
        result: 'recalculated',
        after: { awarded: result.awarded, revoked: result.revoked },
      });
      return result;
    }),
  );

  server.registerTool(
    'list_automation_schedules',
    { title: 'List automation schedules', description: 'List schedules owned by the authenticated user.', inputSchema: {}, annotations: { readOnlyHint: true } },
    async () => runTool(() => ({ schedules: listSchedules(ctx.db, automationIdentity(ctx.auth).userId) })),
  );

  server.registerTool(
    'create_automation_schedule',
    {
      title: 'Create automation schedule',
      description: 'Create an idempotent schedule for an allowlisted Microlearn job type.',
      inputSchema: {
        jobType: z.enum(AUTOMATION_JOB_TYPES),
        schedule: scheduleSpecSchema,
        payload: z.record(z.string(), z.unknown()).optional(),
        timezone: z.string().min(1).optional(),
        retryLimit: z.number().int().min(1).max(5).optional(),
        idempotencyKey: z.string().min(8).max(200),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) => runTool(() => {
      assertWriteEnabled(ctx.config);
      const grant = requireTrustedAuthorization(ctx, 'create_automation_schedule', args);
      const jobCapability = JOB_CAPABILITIES[args.jobType];
      if (!grant.capabilities.includes(jobCapability)) throw new ToolError('AUTOMATION_CAPABILITY_DENIED', `Scheduled job requires "${jobCapability}".`);
      const timezone = args.timezone ?? grant.timezone;
      validateTimezone(timezone);
      return { schedule: createSchedule(ctx.db, {
        grantId: grant.id,
        userId: grant.userId,
        jobType: args.jobType,
        schedule: args.schedule,
        payload: args.payload,
        timezone,
        retryLimit: args.retryLimit,
        idempotencyKey: args.idempotencyKey,
      }) };
    }),
  );

  server.registerTool(
    'update_automation_schedule',
    {
      title: 'Update automation schedule', description: 'Update schedule timing, payload, timezone, or retry limit.',
      inputSchema: {
        scheduleId: z.string().min(1), schedule: scheduleSpecSchema.optional(),
        payload: z.record(z.string(), z.unknown()).optional(), timezone: z.string().min(1).optional(),
        retryLimit: z.number().int().min(1).max(5).optional(),
      }, annotations: { readOnlyHint: false },
    },
    async (args) => runTool(() => {
      assertWriteEnabled(ctx.config);
      const grant = requireTrustedAuthorization(ctx, 'update_automation_schedule', args);
      if (args.timezone) validateTimezone(args.timezone);
      return { schedule: updateSchedule(ctx.db, grant.userId, args.scheduleId, args) };
    }),
  );

  for (const [name, status] of [['pause_automation_schedule', 'paused'], ['resume_automation_schedule', 'active']] as const) {
    server.registerTool(
      name,
      { title: `${status === 'active' ? 'Resume' : 'Pause'} automation schedule`, description: `${status === 'active' ? 'Resume' : 'Pause'} a schedule.`, inputSchema: { scheduleId: z.string().min(1) }, annotations: { readOnlyHint: false } },
      async (args) => runTool(() => {
        assertWriteEnabled(ctx.config);
        const grant = requireTrustedAuthorization(ctx, name, args);
        return { schedule: setScheduleStatus(ctx.db, grant.userId, args.scheduleId, status) };
      }),
    );
  }

  server.registerTool(
    'delete_automation_schedule',
    { title: 'Delete automation schedule', description: 'Delete a schedule under active Trusted Automation.', inputSchema: { scheduleId: z.string().min(1) }, annotations: { readOnlyHint: false, destructiveHint: true } },
    async (args) => runTool(() => {
      assertWriteEnabled(ctx.config);
      const grant = requireTrustedAuthorization(ctx, 'delete_automation_schedule', args);
      return deleteSchedule(ctx.db, grant.userId, args.scheduleId);
    }),
  );

  server.registerTool(
    'list_automation_reminders',
    { title: 'List automation reminders', description: 'List reminders owned by the authenticated user.', inputSchema: {}, annotations: { readOnlyHint: true } },
    async () => runTool(() => ({ reminders: listReminders(ctx.db, automationIdentity(ctx.auth).userId) })),
  );

  server.registerTool(
    'create_automation_reminder',
    {
      title: 'Create automation reminder', description: 'Create a persistent reminder. Push records remain saved when push is unconfigured.',
      inputSchema: {
        roadmapId: z.string().min(1).optional(), title: z.string().min(1).max(120), body: z.string().min(1).max(500),
        channel: z.enum(['in_app', 'local', 'push']).optional(), schedule: scheduleSpecSchema,
        timezone: z.string().min(1).optional(),
      }, annotations: { readOnlyHint: false },
    },
    async (args) => runTool(() => {
      assertWriteEnabled(ctx.config);
      const grant = requireTrustedAuthorization(ctx, 'create_automation_reminder', args);
      const timezone = args.timezone ?? grant.timezone;
      validateTimezone(timezone);
      const reminder = createReminder(ctx.db, {
        grantId: grant.id, userId: grant.userId, roadmapId: args.roadmapId,
        title: args.title, body: args.body, channel: args.channel ?? 'in_app', schedule: args.schedule, timezone,
      });
      return { reminder, notificationStatus: reminder.channel === 'push' ? 'push_not_configured_until_worker_credentials_exist' : 'ready' };
    }),
  );

  server.registerTool(
    'update_automation_reminder',
    {
      title: 'Update automation reminder', description: 'Update reminder content, channel, or schedule.',
      inputSchema: {
        reminderId: z.string().min(1), title: z.string().min(1).max(120).optional(), body: z.string().min(1).max(500).optional(),
        channel: z.enum(['in_app', 'local', 'push']).optional(), schedule: scheduleSpecSchema.optional(), timezone: z.string().min(1).optional(),
      }, annotations: { readOnlyHint: false },
    },
    async (args) => runTool(() => {
      assertWriteEnabled(ctx.config);
      const grant = requireTrustedAuthorization(ctx, 'update_automation_reminder', args);
      if (args.timezone) validateTimezone(args.timezone);
      return { reminder: updateReminder(ctx.db, grant.userId, args.reminderId, args) };
    }),
  );

  for (const [name, status] of [['pause_automation_reminder', 'paused'], ['resume_automation_reminder', 'active']] as const) {
    server.registerTool(
      name,
      { title: `${status === 'active' ? 'Resume' : 'Pause'} automation reminder`, description: `${status === 'active' ? 'Resume' : 'Pause'} a reminder.`, inputSchema: { reminderId: z.string().min(1) }, annotations: { readOnlyHint: false } },
      async (args) => runTool(() => {
        assertWriteEnabled(ctx.config);
        const grant = requireTrustedAuthorization(ctx, name, args);
        return { reminder: setReminderStatus(ctx.db, grant.userId, args.reminderId, status) };
      }),
    );
  }

  server.registerTool(
    'delete_automation_reminder',
    { title: 'Delete automation reminder', description: 'Delete a reminder under active Trusted Automation.', inputSchema: { reminderId: z.string().min(1) }, annotations: { readOnlyHint: false, destructiveHint: true } },
    async (args) => runTool(() => {
      assertWriteEnabled(ctx.config);
      const grant = requireTrustedAuthorization(ctx, 'delete_automation_reminder', args);
      return deleteReminder(ctx.db, grant.userId, args.reminderId);
    }),
  );
}
