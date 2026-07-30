import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { runAuditedTool } from '../../audit/auditRun';
import type { ToolContext } from '../context';
import { assertConfirmation, assertGitPushEnabled, assertWriteEnabled, resolveWritablePath } from '../guards';
import { currentBranch, git, gitTry } from '../../repo/gitWrite';
import { ToolError } from '../repoSafety';
import {
  createBranchInput,
  createCommitInput,
  pushBranchInput,
  restoreFilesInput,
  stageFilesInput,
} from '../toolSchemas';

const PUSH_CONFIRM = 'push Microlearn branch';
const RESTORE_FILES_CONFIRM = 'restore Microlearn files';
const BRANCH_NAME_RE = /^(?!-)(?!\/)[A-Za-z0-9._/-]+$/;

function assertValidBranchName(name: string): void {
  const n = name.trim();
  if (!BRANCH_NAME_RE.test(n) || n.includes('..') || n.endsWith('/') || n.endsWith('.lock')) {
    throw new ToolError('INVALID_BRANCH_NAME', `Invalid branch name "${name}".`);
  }
}

function isMeaningfulMessage(message: string): boolean {
  const trimmed = message.trim();
  return trimmed.length >= 10 && trimmed.split(/\s+/).length >= 2;
}

/** Registers create_branch, stage_files, create_commit, push_branch, restore_files (audited). */
export function registerGitWriteTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'create_branch',
    {
      title: 'Create branch',
      description: 'Create a git branch, optionally checking it out.',
      inputSchema: createBranchInput,
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      runAuditedTool(
        ctx.db,
        {
          action: 'create_branch',
          entityType: 'git',
          toolName: 'create_branch',
          entityId: () => args.name,
          metadata: { branch: args.name, checkout: args.checkout ?? false },
          args,
        },
        async () => {
          assertWriteEnabled(ctx.config);
          assertValidBranchName(args.name);
          if (args.checkout) await git(ctx.repoRoot, ['checkout', '-b', args.name]);
          else await git(ctx.repoRoot, ['branch', args.name]);
          return { created: args.name, checkedOut: Boolean(args.checkout), currentBranch: await currentBranch(ctx.repoRoot) };
        },
      ),
  );

  server.registerTool(
    'stage_files',
    {
      title: 'Stage files',
      description: 'Stage specified safe paths (rejects sensitive/generated/outside paths).',
      inputSchema: stageFilesInput,
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      runAuditedTool(
        ctx.db,
        {
          action: 'stage_files',
          entityType: 'git',
          toolName: 'stage_files',
          metadata: { paths: args.paths },
          args,
        },
        async () => {
          assertWriteEnabled(ctx.config);
          const rels = args.paths.map((p) => resolveWritablePath(ctx.repoRoot, p).rel);
          await git(ctx.repoRoot, ['add', '--', ...rels]);
          return { staged: rels };
        },
      ),
  );

  server.registerTool(
    'create_commit',
    {
      title: 'Create commit',
      description: 'Commit staged changes with a message. Never pushes.',
      inputSchema: createCommitInput,
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      runAuditedTool(
        ctx.db,
        {
          action: 'create_commit',
          entityType: 'git',
          toolName: 'create_commit',
          entityId: (r) => (r as { commit: string }).commit,
          metadata: { messageLength: args.message.length },
          args,
        },
        async () => {
          assertWriteEnabled(ctx.config);
          if (!isMeaningfulMessage(args.message)) {
            throw new ToolError('INVALID_INPUT', 'Commit message is too short or vague (need >= 10 chars, >= 2 words).');
          }
          const staged = await gitTry(ctx.repoRoot, ['diff', '--cached', '--name-only']);
          if (staged.exitCode === 0 && staged.stdout.trim() === '') {
            throw new ToolError('NOTHING_STAGED', 'No staged changes to commit. Stage files first.');
          }
          await git(ctx.repoRoot, ['commit', '-m', args.message]);
          const hash = (await git(ctx.repoRoot, ['rev-parse', 'HEAD'])).stdout.trim();
          const summary = (await git(ctx.repoRoot, ['log', '-1', '--pretty=%s'])).stdout.trim();
          return { commit: hash, summary, branch: await currentBranch(ctx.repoRoot) };
        },
      ),
  );

  server.registerTool(
    'push_branch',
    {
      title: 'Push branch',
      description: 'Push the current branch. Disabled unless git push flag and confirmation are set. Never force-pushes.',
      inputSchema: pushBranchInput,
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (args) =>
      runAuditedTool(
        ctx.db,
        {
          action: 'push_branch',
          entityType: 'git',
          toolName: 'push_branch',
          entityId: (r) => (r as { branch: string }).branch,
          metadata: { remote: args.remote ?? 'origin', confirmUsed: true },
          args,
        },
        async () => {
          assertWriteEnabled(ctx.config);
          assertGitPushEnabled(ctx.config);
          assertConfirmation(args.confirm, PUSH_CONFIRM);
          const remote = args.remote?.trim() || 'origin';
          const branch = args.branch?.trim() || (await currentBranch(ctx.repoRoot));
          if (!branch) throw new ToolError('GIT_COMMAND_FAILED', 'Could not determine the branch to push.');
          assertValidBranchName(branch);
          const result = await git(ctx.repoRoot, ['push', remote, branch]);
          return { remote, branch, output: (result.stderr || result.stdout).trim() };
        },
      ),
  );

  server.registerTool(
    'restore_files',
    {
      title: 'Restore files',
      description: 'Restore specified files from git. Requires exact confirmation string.',
      inputSchema: restoreFilesInput,
      annotations: { readOnlyHint: false },
    },
    async (args) =>
      runAuditedTool(
        ctx.db,
        {
          action: 'restore_files',
          entityType: 'git',
          toolName: 'restore_files',
          metadata: { paths: args.paths, confirmUsed: true },
          args,
        },
        async () => {
          assertWriteEnabled(ctx.config);
          assertConfirmation(args.confirm, RESTORE_FILES_CONFIRM);
          const rels = args.paths.map((p) => resolveWritablePath(ctx.repoRoot, p).rel);
          await git(ctx.repoRoot, ['restore', '--', ...rels]);
          return { restored: rels };
        },
      ),
  );
}
