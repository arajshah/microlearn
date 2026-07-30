import { runCommand, type CommandResult } from './commandRunner';
import { ToolError } from '../mcp/repoSafety';

const GIT_TIMEOUT_MS = 15_000;

/** Runs a git command; throws GIT_COMMAND_FAILED on non-zero exit. */
export async function git(repoRoot: string, args: string[]): Promise<CommandResult> {
  const result = await runCommand('git', args, repoRoot, GIT_TIMEOUT_MS);
  if (result.timedOut) {
    throw new ToolError('TIMEOUT', `git ${args.join(' ')} timed out.`);
  }
  if (result.exitCode !== 0) {
    throw new ToolError('GIT_COMMAND_FAILED', (result.stderr || result.stdout || `git ${args[0]} failed`).trim());
  }
  return result;
}

/** Runs a git command and returns the result without throwing on non-zero. */
export async function gitTry(repoRoot: string, args: string[]): Promise<CommandResult> {
  return runCommand('git', args, repoRoot, GIT_TIMEOUT_MS);
}

/** Returns the current branch name, or null if unavailable. */
export async function currentBranch(repoRoot: string): Promise<string | null> {
  const res = await gitTry(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (res.exitCode !== 0) return null;
  return res.stdout.trim() || null;
}
