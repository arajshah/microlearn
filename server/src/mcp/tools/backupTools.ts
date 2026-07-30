import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../context';
import { runTool } from '../toolSchemas';
import { runAuditedTool } from '../../audit/auditRun';
import { assertConfirmation, assertWriteEnabled } from '../guards';
import {
  exportCurriculumBackup,
  exportSqliteBackup,
  listBackupFiles,
} from '../../backup/backupService';

const exportCurriculumInput = {
  includeDeleted: z.boolean().optional(),
};

const exportSqliteInput = {
  confirm: z.string().describe('Must be exactly "backup Microlearn database".'),
};

const listBackupsInput = {
  limit: z.number().int().positive().max(200).optional(),
};

const SQLITE_BACKUP_CONFIRM = 'backup Microlearn database';

/** Registers export_curriculum_backup, export_sqlite_backup, list_backups. */
export function registerBackupTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'export_curriculum_backup',
    {
      title: 'Export curriculum backup',
      description: 'Export curriculum tables to a timestamped JSON file under server/backups/.',
      inputSchema: exportCurriculumInput,
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      runAuditedTool(
        ctx.db,
        {
          action: 'export_curriculum_backup',
          entityType: 'backup',
          toolName: 'export_curriculum_backup',
          metadata: { includeDeleted: args.includeDeleted ?? false },
          args,
        },
        () => {
          assertWriteEnabled(ctx.config);
          return exportCurriculumBackup(ctx.db, ctx.config.repoRoot, args.includeDeleted);
        },
      ),
  );

  server.registerTool(
    'export_sqlite_backup',
    {
      title: 'Export SQLite backup',
      description: 'Copy the SQLite database to server/backups/ (confirmation required).',
      inputSchema: exportSqliteInput,
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      runAuditedTool(
        ctx.db,
        {
          action: 'export_sqlite_backup',
          entityType: 'backup',
          toolName: 'export_sqlite_backup',
          metadata: { confirmUsed: true },
          args,
        },
        () => {
          assertWriteEnabled(ctx.config);
          assertConfirmation(args.confirm, SQLITE_BACKUP_CONFIRM);
          return exportSqliteBackup(ctx.config);
        },
      ),
  );

  server.registerTool(
    'list_backups',
    {
      title: 'List backups',
      description: 'List backup files under server/backups/.',
      inputSchema: listBackupsInput,
      annotations: { readOnlyHint: true },
    },
    async (args) => runTool(() => ({ backups: listBackupFiles(ctx.config.repoRoot, args.limit) })),
  );
}
