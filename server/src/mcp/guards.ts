import type { ServerConfig } from '../config';
import { ToolError, isSensitiveFile, safeResolve, toPosixRelative, isIgnoredRelPath } from './repoSafety';

/** Throws unless write tools are enabled via MICROLEARN_ENABLE_WRITE_TOOLS. */
export function assertWriteEnabled(config: ServerConfig): void {
  if (!config.enableWriteTools) {
    throw new ToolError(
      'WRITE_TOOLS_DISABLED',
      'Write tools are disabled. Start the server with MICROLEARN_ENABLE_WRITE_TOOLS=true to enable them.',
    );
  }
}

/** Throws unless git push is enabled via MICROLEARN_ENABLE_GIT_PUSH. */
export function assertGitPushEnabled(config: ServerConfig): void {
  if (!config.enableGitPush) {
    throw new ToolError(
      'GIT_PUSH_DISABLED',
      'Git push is disabled. Start the server with MICROLEARN_ENABLE_GIT_PUSH=true to enable it.',
    );
  }
}

/** Throws CONFIRMATION_REQUIRED unless the confirmation string matches exactly. */
export function assertConfirmation(actual: string, expected: string): void {
  if (actual !== expected) {
    throw new ToolError('CONFIRMATION_REQUIRED', `This action requires confirm to equal "${expected}".`);
  }
}

/**
 * Resolves a repo-relative path for a write operation, rejecting escapes,
 * sensitive files, and ignored/generated paths. Returns { abs, rel }.
 */
export function resolveWritablePath(
  repoRoot: string,
  requested: string,
): { abs: string; rel: string } {
  const abs = safeResolve(repoRoot, requested);
  const rel = toPosixRelative(repoRoot, abs);
  if (!rel) {
    throw new ToolError('INVALID_INPUT', 'Refusing to operate on the repo root itself.');
  }
  if (isSensitiveFile(rel)) {
    throw new ToolError('SENSITIVE_FILE_BLOCKED', `Refusing to touch sensitive file "${rel}".`);
  }
  if (isIgnoredRelPath(rel)) {
    throw new ToolError('SENSITIVE_FILE_BLOCKED', `Refusing to touch excluded path "${rel}".`);
  }
  return { abs, rel };
}
