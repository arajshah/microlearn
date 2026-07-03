import fs from 'node:fs';
import path from 'node:path';

/** Structured error codes surfaced to MCP clients. */
export type ToolErrorCode =
  | 'PATH_OUTSIDE_REPO'
  | 'SENSITIVE_FILE_BLOCKED'
  | 'FILE_TOO_LARGE'
  | 'BINARY_FILE_UNSUPPORTED'
  | 'TOO_MANY_RESULTS'
  | 'GIT_COMMAND_FAILED'
  | 'NOT_FOUND'
  | 'NOT_A_FILE'
  | 'NOT_A_DIRECTORY'
  | 'INVALID_INPUT';

/** Error type carrying a stable code for tool responses. */
export class ToolError extends Error {
  constructor(
    public readonly code: ToolErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ToolError';
  }
}

/** Directory names skipped everywhere (heavy or generated). */
export const IGNORED_DIR_NAMES: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  '.expo',
  'dist',
  'build',
  'coverage',
]);

/** Repo-relative path prefixes that are always skipped. */
export const IGNORED_PATH_PREFIXES: readonly string[] = ['server/data'];

/**
 * Sensitive filename matchers. Files matching these are never listed or read.
 * Covers env files, keys, certificates, and local database files.
 */
const SENSITIVE_MATCHERS: ReadonlyArray<(base: string) => boolean> = [
  (b) => b === '.env',
  (b) => b.startsWith('.env.'),
  (b) => b.endsWith('.pem'),
  (b) => b.endsWith('.key'),
  (b) => b.endsWith('.crt'),
  (b) => b.endsWith('.p12'),
  (b) => b.endsWith('.sqlite'),
  (b) => b.endsWith('.db'),
  (b) => b.endsWith('.db-shm'),
  (b) => b.endsWith('.db-wal'),
];

/** Normalizes a repo-relative path to forward slashes without leading "./". */
export function toPosixRelative(repoRoot: string, absPath: string): string {
  const rel = path.relative(repoRoot, absPath);
  return rel.split(path.sep).join('/');
}

/** True if a directory name should be skipped during traversal. */
export function isIgnoredDirName(name: string): boolean {
  return IGNORED_DIR_NAMES.has(name);
}

/** True if a repo-relative path falls under a skipped prefix or ignored dir segment. */
export function isIgnoredRelPath(relPath: string): boolean {
  const normalized = relPath.split(path.sep).join('/');
  if (IGNORED_PATH_PREFIXES.some((p) => normalized === p || normalized.startsWith(`${p}/`))) {
    return true;
  }
  return normalized.split('/').some((seg) => IGNORED_DIR_NAMES.has(seg));
}

/** True if a filename matches a sensitive pattern and must never be exposed. */
export function isSensitiveFile(relOrBase: string): boolean {
  const base = path.basename(relOrBase);
  return SENSITIVE_MATCHERS.some((m) => m(base));
}

/**
 * Resolves a client-supplied path against the repo root and guarantees it stays
 * inside the repo, even through symlinks. Throws ToolError on any escape.
 */
export function safeResolve(repoRoot: string, requested: string | undefined): string {
  const rootReal = fs.realpathSync(repoRoot);
  const rel = (requested ?? '.').trim();

  if (path.isAbsolute(rel)) {
    // Absolute paths are only allowed if they point back inside the repo.
    const abs = path.resolve(rel);
    assertInside(rootReal, abs);
    return abs;
  }

  const abs = path.resolve(rootReal, rel);
  assertInside(rootReal, abs);

  // Resolve symlinks where the target exists and re-check containment.
  const realAbs = realpathIfExists(abs);
  assertInside(rootReal, realAbs);
  return abs;
}

function assertInside(rootReal: string, abs: string): void {
  const rel = path.relative(rootReal, abs);
  if (rel === '') return;
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new ToolError('PATH_OUTSIDE_REPO', 'Requested path is outside the repository root.');
  }
}

function realpathIfExists(abs: string): string {
  try {
    return fs.realpathSync(abs);
  } catch {
    return abs;
  }
}

/** Verifies the repo root exists and contains package.json. */
export function assertRepoRoot(repoRoot: string): void {
  const pkg = path.join(repoRoot, 'package.json');
  if (!fs.existsSync(pkg)) {
    throw new ToolError(
      'INVALID_INPUT',
      `Repo root "${repoRoot}" does not contain package.json. Set MICROLEARN_REPO_ROOT.`,
    );
  }
}

/** Heuristic binary check: scans the leading bytes for a NUL byte. */
export function looksBinary(buffer: Buffer): boolean {
  const scanLen = Math.min(buffer.length, 8000);
  for (let i = 0; i < scanLen; i += 1) {
    if (buffer[i] === 0) return true;
  }
  return false;
}
