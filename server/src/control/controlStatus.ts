import type { Db } from '../db';
import type { ServerConfig } from '../config';
import { checkDatabaseHealth } from '../db';
import { listAuditEvents, countAuditEvents } from '../audit/auditService';
import { countBackups } from '../backup/backupService';
import { countOutcomes } from '../outcomes/outcomeRepository';
import { countSourceDocuments } from '../sources/sourceRepository';
import {
  countRetrievalAttempts,
  countRetrievalItems,
  countRetrievalSessions,
} from '../retrieval/retrievalRepository';
import {
  countAchievements,
  countDailyActivityDays,
  countUserAchievements,
  getStreakRow,
} from '../gamification/gamificationRepository';
import { getGitBranch } from '../mcp/tools/gitTools';
import { runCommand } from '../repo/commandRunner';
import { TOOL_COUNT } from '../mcp/toolSchemas';
import { MIGRATIONS } from '../db/schema';

function tableCount(db: Db, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c;
}

function appliedMigrations(db: Db): string[] {
  try {
    return (db.prepare('SELECT id FROM schema_migrations ORDER BY id ASC').all() as Array<{ id: string }>).map(
      (r) => r.id,
    );
  } catch {
    return [];
  }
}

/** Builds the full control-system status report (read-only, no secrets). */
export async function buildControlSystemStatus(config: ServerConfig, db: Db) {
  const dbOk = checkDatabaseHealth(db);
  const applied = appliedMigrations(db);
  const gitBranch = await getGitBranch(config.repoRoot);
  const gitStatus = await runCommand('git', ['status', '--short'], config.repoRoot, 10_000).catch(() => null);

  return {
    server: {
      service: config.serviceName,
      env: config.nodeEnv,
      port: config.port,
      healthy: true,
      time: new Date().toISOString(),
    },
    database: {
      ok: dbOk,
      path: config.dbPath,
      migrations: {
        defined: MIGRATIONS.map((m) => m.id),
        applied,
        pending: MIGRATIONS.filter((m) => !applied.includes(m.id)).map((m) => m.id),
      },
      rowCounts: {
        roadmaps: tableCount(db, 'roadmaps'),
        units: tableCount(db, 'roadmap_units'),
        lessonNodes: tableCount(db, 'lesson_nodes'),
        blueprints: tableCount(db, 'lesson_blueprints'),
        generatedLessons: tableCount(db, 'generated_lessons'),
        outcomes: countOutcomes(db),
        contentVersions: tableCount(db, 'content_versions'),
        auditEvents: countAuditEvents(db),
        progressEvents: tableCount(db, 'progress_events'),
        sourceDocuments: countSourceDocuments(db),
        retrievalItems: countRetrievalItems(db),
        retrievalSessions: countRetrievalSessions(db),
        retrievalAttempts: countRetrievalAttempts(db),
        achievements: countAchievements(db),
        userAchievements: countUserAchievements(db),
        dailyActivityDays: countDailyActivityDays(db),
      },
      gamification: {
        studyStreak: getStreakRow(db, 'study')?.current_count ?? 0,
        retrievalStreak: getStreakRow(db, 'retrieval')?.current_count ?? 0,
      },
    },
    repo: {
      root: config.repoRoot,
      gitBranch,
      gitDirty: gitStatus ? gitStatus.stdout.trim().length > 0 : null,
    },
    flags: {
      writeToolsEnabled: config.enableWriteTools,
      gitPushEnabled: config.enableGitPush,
      authRequired: config.requireAuth,
      mcpTokenConfigured: config.requireAuth ? Boolean(config.mcpBearerToken) : false,
      apiTokenConfigured: config.requireAuth ? Boolean(config.apiBearerToken) : false,
    },
    mcp: {
      toolCount: TOOL_COUNT,
      endpoint: '/mcp',
    },
    api: {
      routes: [
        'GET /api/health',
        'GET/POST /api/roadmaps',
        'GET/PATCH/DELETE /api/roadmaps/:roadmapId',
        'GET /api/roadmaps/:roadmapId/lessons',
        'GET /api/roadmaps/:roadmapId/outcomes',
        'POST /api/outcomes',
        'GET /api/lesson-nodes/:lessonNodeId/outcomes',
        'GET/POST /api/lessons',
        'GET /api/lessons/:lessonId',
        'POST /api/sources/extract',
        'GET /api/sources',
        'GET /api/sources/:sourceId',
        'GET /api/retrieval/due',
        'GET /api/retrieval/summary',
        'POST /api/retrieval/items/seed',
        'POST /api/retrieval/sessions',
        'PATCH /api/retrieval/sessions/:sessionId/finish',
        'POST /api/retrieval/attempts',
        'GET /api/profile/summary',
        'GET /api/achievements',
        'GET /api/activity',
        'POST /api/activity',
      ],
    },
    backups: {
      directory: 'server/backups/',
      count: countBackups(config.repoRoot),
    },
    recentAuditEvents: listAuditEvents(db, { limit: 10 }),
  };
}
