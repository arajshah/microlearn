import { execFile } from 'node:child_process';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../context';
import { ToolError } from '../repoSafety';
import { gitDiffInput, runTool } from '../toolSchemas';

const GIT_TIMEOUT_MS = 8000;
const GIT_MAX_BUFFER = 8 * 1024 * 1024;
const DEFAULT_DIFF_MAX_BYTES = 200_000;

interface GitResult {
  stdout: string;
  stderr: string;
}

/** Runs a single read-only git command with a timeout. Rejects with ToolError. */
function runGit(repoRoot: string, args: string[]): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { cwd: repoRoot, timeout: GIT_TIMEOUT_MS, maxBuffer: GIT_MAX_BUFFER, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) {
          reject(new ToolError('GIT_COMMAND_FAILED', (stderr || err.message).trim()));
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

/** Best-effort current branch. Returns null if the repo is not a git repository. */
export async function getGitBranch(repoRoot: string): Promise<string | null> {
  try {
    const { stdout } = await runGit(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/** Registers read-only git_status and git_diff tools. */
export function registerGitTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'git_status',
    {
      title: 'Git status',
      description: 'Read-only git status: current branch, clean flag, changed/staged/untracked files.',
      annotations: { readOnlyHint: true },
    },
    async () =>
      runTool(async () => {
        const { stdout } = await runGit(ctx.repoRoot, ['status', '--porcelain=v1', '--branch']);
        const lines = stdout.split('\n').filter((l) => l.length > 0);

        let branch: string | null = null;
        const changed: string[] = [];
        const staged: string[] = [];
        const untracked: string[] = [];

        for (const line of lines) {
          if (line.startsWith('##')) {
            branch = line.slice(2).trim().split('...')[0].trim() || null;
            continue;
          }
          const x = line[0];
          const y = line[1];
          const file = line.slice(3);
          if (x === '?' && y === '?') {
            untracked.push(file);
            continue;
          }
          if (x !== ' ' && x !== '?') staged.push(file);
          if (y !== ' ' && y !== '?') changed.push(file);
        }

        return {
          branch: branch ?? (await getGitBranch(ctx.repoRoot)),
          clean: changed.length === 0 && staged.length === 0 && untracked.length === 0,
          staged,
          changed,
          untracked,
        };
      }),
  );

  server.registerTool(
    'git_diff',
    {
      title: 'Git diff',
      description: 'Read-only git diff (optionally staged), size-limited.',
      inputSchema: gitDiffInput,
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      runTool(async () => {
        const maxBytes = args.maxBytes ?? DEFAULT_DIFF_MAX_BYTES;
        const gitArgs = args.staged ? ['diff', '--staged'] : ['diff'];
        const { stdout } = await runGit(ctx.repoRoot, gitArgs);

        const buffer = Buffer.from(stdout, 'utf8');
        const truncated = buffer.length > maxBytes;
        const diff = truncated ? buffer.subarray(0, maxBytes).toString('utf8') : stdout;

        return {
          staged: args.staged ?? false,
          bytes: buffer.length,
          truncated,
          warning: truncated ? `Diff truncated to ${maxBytes} bytes.` : undefined,
          diff,
        };
      }),
  );
}
