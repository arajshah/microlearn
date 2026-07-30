import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { runAuditedTool } from '../../audit/auditRun';
import type { ToolContext } from '../context';
import { assertConfirmation, assertWriteEnabled, resolveWritablePath } from '../guards';
import { git } from '../../repo/gitWrite';
import { ToolError, looksBinary } from '../repoSafety';
import {
  applyPatchInput,
  createFileInput,
  deleteFileInput,
  moveFileInput,
  restoreFileInput,
} from '../toolSchemas';

const DELETE_CONFIRM = 'delete Microlearn file';
const RESTORE_CONFIRM = 'restore Microlearn file';

function patchTargets(patch: string): string[] {
  const targets = new Set<string>();
  const re = /^(?:diff --git a\/(\S+) b\/(\S+)|\+\+\+ b\/(\S+)|--- a\/(\S+))/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(patch)) !== null) {
    for (const g of [m[1], m[2], m[3], m[4]]) {
      if (g && g !== '/dev/null') targets.add(g);
    }
  }
  return [...targets];
}

/** Registers create_file, apply_patch, move_file, delete_file, restore_file (audited). */
export function registerWriteTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'create_file',
    {
      title: 'Create file',
      description: 'Create a text file in the repo. Rejects sensitive/binary/outside paths.',
      inputSchema: createFileInput,
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      runAuditedTool(
        ctx.db,
        {
          action: 'create_file',
          entityType: 'repo_file',
          toolName: 'create_file',
          entityId: (r) => (r as { path: string }).path,
          metadata: { path: args.path },
          args,
        },
        () => {
          assertWriteEnabled(ctx.config);
          const { abs, rel } = resolveWritablePath(ctx.repoRoot, args.path);
          if (looksBinary(Buffer.from(args.content, 'utf8'))) {
            throw new ToolError('BINARY_FILE_UNSUPPORTED', 'Refusing to write binary-looking content.');
          }
          const exists = fs.existsSync(abs);
          if (exists && !args.overwrite) {
            throw new ToolError('FILE_EXISTS', `File "${rel}" already exists. Pass overwrite:true to replace it.`);
          }
          if (exists && !fs.statSync(abs).isFile()) {
            throw new ToolError('NOT_A_FILE', `"${rel}" exists but is not a file.`);
          }
          fs.mkdirSync(path.dirname(abs), { recursive: true });
          fs.writeFileSync(abs, args.content, 'utf8');
          return { path: rel, bytesWritten: Buffer.byteLength(args.content, 'utf8'), overwritten: exists };
        },
      ),
  );

  server.registerTool(
    'apply_patch',
    {
      title: 'Apply patch',
      description: 'Apply a unified diff via git apply. Supports checkOnly validation.',
      inputSchema: applyPatchInput,
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      runAuditedTool(
        ctx.db,
        {
          action: 'apply_patch',
          entityType: 'repo_file',
          toolName: 'apply_patch',
          metadata: { checkOnly: args.checkOnly ?? false, fileCount: patchTargets(args.patch).length },
          args,
        },
        async () => {
          assertWriteEnabled(ctx.config);
          const targets = patchTargets(args.patch);
          if (targets.length === 0) {
            throw new ToolError('PATCH_FAILED', 'Could not identify any files in the patch.');
          }
          for (const t of targets) resolveWritablePath(ctx.repoRoot, t);
          const tmpDir = path.join(os.tmpdir(), 'microlearn-patches');
          fs.mkdirSync(tmpDir, { recursive: true });
          const patchFile = path.join(tmpDir, `patch-${Date.now()}-${Math.random().toString(36).slice(2)}.diff`);
          const normalized = args.patch.endsWith('\n') ? args.patch : `${args.patch}\n`;
          fs.writeFileSync(patchFile, normalized, 'utf8');
          try {
            await git(ctx.repoRoot, ['apply', '--check', patchFile]).catch((e) => {
              throw new ToolError('PATCH_FAILED', e instanceof Error ? e.message : 'Patch does not apply cleanly.');
            });
            if (args.checkOnly) return { applied: false, checkedOnly: true, files: targets };
            await git(ctx.repoRoot, ['apply', patchFile]).catch((e) => {
              throw new ToolError('PATCH_FAILED', e instanceof Error ? e.message : 'Patch failed to apply.');
            });
            return { applied: true, checkedOnly: false, files: targets };
          } finally {
            fs.rmSync(patchFile, { force: true });
          }
        },
      ),
  );

  server.registerTool(
    'move_file',
    {
      title: 'Move file',
      description: 'Move or rename a file within the repo.',
      inputSchema: moveFileInput,
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      runAuditedTool(
        ctx.db,
        {
          action: 'move_file',
          entityType: 'repo_file',
          toolName: 'move_file',
          entityId: (r) => (r as { to: string }).to,
          metadata: { from: args.from, to: args.to },
          args,
        },
        () => {
          assertWriteEnabled(ctx.config);
          const from = resolveWritablePath(ctx.repoRoot, args.from);
          const to = resolveWritablePath(ctx.repoRoot, args.to);
          if (!fs.existsSync(from.abs)) throw new ToolError('NOT_FOUND', `Source "${from.rel}" not found.`);
          if (!fs.statSync(from.abs).isFile()) throw new ToolError('NOT_A_FILE', `Source "${from.rel}" is not a file.`);
          if (fs.existsSync(to.abs) && !args.overwrite) {
            throw new ToolError('FILE_EXISTS', `Destination "${to.rel}" exists. Pass overwrite:true to replace it.`);
          }
          fs.mkdirSync(path.dirname(to.abs), { recursive: true });
          fs.renameSync(from.abs, to.abs);
          return { from: from.rel, to: to.rel };
        },
      ),
  );

  server.registerTool(
    'delete_file',
    {
      title: 'Delete file',
      description: 'Delete a repo file. Requires exact confirmation string.',
      inputSchema: deleteFileInput,
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async (args) =>
      runAuditedTool(
        ctx.db,
        {
          action: 'delete_file',
          entityType: 'repo_file',
          toolName: 'delete_file',
          entityId: (r) => (r as { deleted: string }).deleted,
          metadata: { path: args.path, confirmUsed: true },
          args,
        },
        () => {
          assertWriteEnabled(ctx.config);
          assertConfirmation(args.confirm, DELETE_CONFIRM);
          const { abs, rel } = resolveWritablePath(ctx.repoRoot, args.path);
          if (!fs.existsSync(abs)) throw new ToolError('NOT_FOUND', `File "${rel}" not found.`);
          if (!fs.statSync(abs).isFile()) throw new ToolError('NOT_A_FILE', `"${rel}" is not a file.`);
          fs.rmSync(abs, { force: true });
          return { deleted: rel };
        },
      ),
  );

  server.registerTool(
    'restore_file',
    {
      title: 'Restore file',
      description: 'Restore one file from git. Requires exact confirmation string.',
      inputSchema: restoreFileInput,
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      runAuditedTool(
        ctx.db,
        {
          action: 'restore_file',
          entityType: 'repo_file',
          toolName: 'restore_file',
          entityId: (r) => (r as { restored: string }).restored,
          metadata: { path: args.path, confirmUsed: true },
          args,
        },
        async () => {
          assertWriteEnabled(ctx.config);
          assertConfirmation(args.confirm, RESTORE_CONFIRM);
          const { rel } = resolveWritablePath(ctx.repoRoot, args.path);
          await git(ctx.repoRoot, ['restore', '--', rel]);
          return { restored: rel };
        },
      ),
  );
}
