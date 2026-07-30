import { execFile } from 'node:child_process';
import { ToolError } from '../mcp/repoSafety';

export interface CommandResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_BUFFER = 16 * 1024 * 1024;

/**
 * Allowlist of exact command invocations that `run_allowed_command` may execute.
 * Each entry is [command, ...args]. No shell, no arbitrary scripts.
 */
export const COMMAND_ALLOWLIST: ReadonlyArray<readonly string[]> = [
  ['npm', 'run', 'server:typecheck'],
  ['npm', 'run', 'server:build'],
  ['npx', 'tsc', '--noEmit'],
  ['git', 'status', '--short', '--branch'],
  ['git', 'diff'],
];

/** Human-readable form of the allowlist for `get_command_allowlist`. */
export function allowlistDisplay(): string[] {
  return COMMAND_ALLOWLIST.map((entry) => entry.join(' '));
}

function isAllowed(command: string, args: string[]): boolean {
  return COMMAND_ALLOWLIST.some(
    (entry) =>
      entry.length === args.length + 1 &&
      entry[0] === command &&
      entry.slice(1).every((a, i) => a === args[i]),
  );
}

/**
 * Runs a command via execFile (never a shell). Rejects with ToolError on spawn
 * failure; resolves with a structured result (including non-zero exit codes).
 */
export function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<CommandResult> {
  const started = Date.now();
  const display = [command, ...args].join(' ');

  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { cwd, timeout: timeoutMs, maxBuffer: MAX_BUFFER, windowsHide: true },
      (err, stdout, stderr) => {
        const durationMs = Date.now() - started;
        const e = err as
          | (NodeJS.ErrnoException & { code?: number | string; killed?: boolean; signal?: string })
          | null;

        if (e && (e.code === 'ENOENT' || e.code === 'EACCES')) {
          reject(new ToolError('COMMAND_FAILED', `Failed to run "${display}": ${e.message}`));
          return;
        }

        const timedOut = Boolean(e && (e.killed || e.signal === 'SIGTERM') && durationMs >= timeoutMs - 50);
        const exitCode =
          e && typeof e.code === 'number' ? e.code : e && e.code ? 1 : 0;

        resolve({ command: display, exitCode, stdout, stderr, durationMs, timedOut });
      },
    );
  });
}

/** Runs an allowlisted command; rejects with COMMAND_NOT_ALLOWED otherwise. */
export function runAllowedCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs?: number,
): Promise<CommandResult> {
  if (!isAllowed(command, args)) {
    return Promise.reject(
      new ToolError('COMMAND_NOT_ALLOWED', `Command not allowed: "${[command, ...args].join(' ')}".`),
    );
  }
  return runCommand(command, args, cwd, timeoutMs);
}
