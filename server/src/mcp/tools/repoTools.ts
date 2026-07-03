import fs from 'node:fs';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../context';
import {
  ToolError,
  isIgnoredDirName,
  isIgnoredRelPath,
  isSensitiveFile,
  looksBinary,
  safeResolve,
  toPosixRelative,
} from '../repoSafety';
import {
  listFilesInput,
  readFileInput,
  runTool,
  searchCodeInput,
} from '../toolSchemas';

const DEFAULT_LIST_MAX = 500;
const DEFAULT_READ_MAX_BYTES = 200_000;
const DEFAULT_SEARCH_MAX = 100;
const SEARCH_MAX_FILE_BYTES = 512_000;

interface FileEntry {
  path: string;
  type: 'file' | 'directory';
  size?: number;
}

function listDirectory(
  repoRoot: string,
  startAbs: string,
  recursive: boolean,
  maxResults: number,
): { entries: FileEntry[]; truncated: boolean } {
  const entries: FileEntry[] = [];
  const stack: string[] = [startAbs];
  let truncated = false;

  while (stack.length > 0) {
    const current = stack.pop() as string;
    let dirents: fs.Dirent[];
    try {
      dirents = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    dirents.sort((a, b) => a.name.localeCompare(b.name));

    for (const dirent of dirents) {
      const abs = path.join(current, dirent.name);
      const rel = toPosixRelative(repoRoot, abs);

      if (dirent.isDirectory()) {
        if (isIgnoredDirName(dirent.name) || isIgnoredRelPath(rel)) continue;
        entries.push({ path: rel, type: 'directory' });
        if (recursive) stack.push(abs);
      } else if (dirent.isFile()) {
        if (isSensitiveFile(rel) || isIgnoredRelPath(rel)) continue;
        let size: number | undefined;
        try {
          size = fs.statSync(abs).size;
        } catch {
          size = undefined;
        }
        entries.push({ path: rel, type: 'file', size });
      }

      if (entries.length >= maxResults) {
        truncated = true;
        return { entries, truncated };
      }
    }
  }

  return { entries, truncated };
}

function searchFiles(
  repoRoot: string,
  startAbs: string,
  query: string,
  caseSensitive: boolean,
  maxResults: number,
): { matches: Array<{ path: string; line: number; text: string }>; truncated: boolean } {
  const matches: Array<{ path: string; line: number; text: string }> = [];
  const needle = caseSensitive ? query : query.toLowerCase();
  const stack: string[] = [startAbs];
  let truncated = false;

  while (stack.length > 0) {
    const current = stack.pop() as string;
    let dirents: fs.Dirent[];
    try {
      dirents = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    dirents.sort((a, b) => a.name.localeCompare(b.name));

    for (const dirent of dirents) {
      const abs = path.join(current, dirent.name);
      const rel = toPosixRelative(repoRoot, abs);

      if (dirent.isDirectory()) {
        if (isIgnoredDirName(dirent.name) || isIgnoredRelPath(rel)) continue;
        stack.push(abs);
        continue;
      }
      if (!dirent.isFile()) continue;
      if (isSensitiveFile(rel) || isIgnoredRelPath(rel)) continue;

      let stat: fs.Stats;
      try {
        stat = fs.statSync(abs);
      } catch {
        continue;
      }
      if (stat.size > SEARCH_MAX_FILE_BYTES) continue;

      let buffer: Buffer;
      try {
        buffer = fs.readFileSync(abs);
      } catch {
        continue;
      }
      if (looksBinary(buffer)) continue;

      const lines = buffer.toString('utf8').split(/\r?\n/);
      for (let i = 0; i < lines.length; i += 1) {
        const haystack = caseSensitive ? lines[i] : lines[i].toLowerCase();
        if (haystack.includes(needle)) {
          matches.push({ path: rel, line: i + 1, text: lines[i].trim().slice(0, 200) });
          if (matches.length >= maxResults) {
            truncated = true;
            return { matches, truncated };
          }
        }
      }
    }
  }

  return { matches, truncated };
}

/** Registers list_files, read_file, and search_code. */
export function registerRepoTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'list_files',
    {
      title: 'List files',
      description:
        'Lists files under the repo root (optionally recursive), skipping heavy/generated/sensitive paths. Returns relative paths.',
      inputSchema: listFilesInput,
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      runTool(() => {
        const maxResults = args.maxResults ?? DEFAULT_LIST_MAX;
        const recursive = args.recursive ?? false;
        const startAbs = safeResolve(ctx.repoRoot, args.directory);

        const stat = fs.statSync(startAbs);
        if (!stat.isDirectory()) {
          throw new ToolError('NOT_A_DIRECTORY', 'Requested path is not a directory.');
        }
        const relStart = toPosixRelative(ctx.repoRoot, startAbs);
        if (relStart && isIgnoredRelPath(relStart)) {
          throw new ToolError('INVALID_INPUT', 'That directory is excluded from inspection.');
        }

        const { entries, truncated } = listDirectory(ctx.repoRoot, startAbs, recursive, maxResults);
        return {
          directory: relStart || '.',
          recursive,
          count: entries.length,
          truncated,
          entries,
        };
      }),
  );

  server.registerTool(
    'read_file',
    {
      title: 'Read file',
      description: 'Reads a text file inside the repo, with a size limit. Blocks sensitive and binary files.',
      inputSchema: readFileInput,
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      runTool(() => {
        const maxBytes = args.maxBytes ?? DEFAULT_READ_MAX_BYTES;
        const abs = safeResolve(ctx.repoRoot, args.path);
        const rel = toPosixRelative(ctx.repoRoot, abs);

        if (isSensitiveFile(rel) || isIgnoredRelPath(rel)) {
          throw new ToolError('SENSITIVE_FILE_BLOCKED', 'This file is blocked from being read.');
        }

        let stat: fs.Stats;
        try {
          stat = fs.statSync(abs);
        } catch {
          throw new ToolError('NOT_FOUND', 'File not found.');
        }
        if (!stat.isFile()) {
          throw new ToolError('NOT_A_FILE', 'Requested path is not a file.');
        }

        const buffer = fs.readFileSync(abs);
        if (looksBinary(buffer)) {
          throw new ToolError('BINARY_FILE_UNSUPPORTED', 'Binary files cannot be read.');
        }

        const totalBytes = buffer.length;
        const truncated = totalBytes > maxBytes;
        const slice = truncated ? buffer.subarray(0, maxBytes) : buffer;

        return {
          path: rel,
          bytes: totalBytes,
          returnedBytes: slice.length,
          truncated,
          warning: truncated ? `File truncated to ${maxBytes} bytes.` : undefined,
          content: slice.toString('utf8'),
        };
      }),
  );

  server.registerTool(
    'search_code',
    {
      title: 'Search code',
      description:
        'Searches text files in the repo for a query string. Returns relative path, line number, and the matching line.',
      inputSchema: searchCodeInput,
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      runTool(() => {
        const maxResults = args.maxResults ?? DEFAULT_SEARCH_MAX;
        const caseSensitive = args.caseSensitive ?? false;
        const startAbs = safeResolve(ctx.repoRoot, args.directory);

        const stat = fs.statSync(startAbs);
        if (!stat.isDirectory()) {
          throw new ToolError('NOT_A_DIRECTORY', 'Search directory is not a directory.');
        }

        const { matches, truncated } = searchFiles(
          ctx.repoRoot,
          startAbs,
          args.query,
          caseSensitive,
          maxResults,
        );
        return {
          query: args.query,
          directory: toPosixRelative(ctx.repoRoot, startAbs) || '.',
          caseSensitive,
          count: matches.length,
          truncated,
          matches,
        };
      }),
  );
}
