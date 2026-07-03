import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ToolError } from './repoSafety';

/** Concise catalog of the tools this MCP server exposes (read-only). */
export const TOOL_CATALOG: ReadonlyArray<{ name: string; description: string }> = [
  { name: 'server_status', description: 'Server service name, time, environment, database health, repo root, and tool count.' },
  { name: 'list_capabilities', description: 'Lists the available MCP tools and what each one does.' },
  { name: 'get_project_info', description: 'High-level project info: package name/version, package manager, scripts, dependency summary, Expo/RN indicators, server folder status, git branch.' },
  { name: 'list_files', description: 'Lists files under the repo root (optionally recursive), skipping heavy/generated/sensitive paths. Returns relative paths.' },
  { name: 'read_file', description: 'Reads a text file inside the repo, with a size limit. Blocks sensitive and binary files.' },
  { name: 'search_code', description: 'Searches text files in the repo for a query string. Returns relative path, line number, and the matching line.' },
  { name: 'git_status', description: 'Read-only git status: current branch, clean flag, changed/staged/untracked files.' },
  { name: 'git_diff', description: 'Read-only git diff (optionally staged), size-limited.' },
  { name: 'get_package_info', description: 'Parsed package.json: name, scripts, dependencies, devDependencies, and key framework versions.' },
];

export const TOOL_COUNT = TOOL_CATALOG.length;

// ---- Input schemas (zod raw shapes) ----

export const listFilesInput = {
  directory: z.string().optional().describe('Repo-relative directory to list. Defaults to repo root.'),
  recursive: z.boolean().optional().describe('Recurse into subdirectories. Default false.'),
  maxResults: z.number().int().positive().max(2000).optional().describe('Maximum entries to return. Default 500.'),
};

export const readFileInput = {
  path: z.string().describe('Repo-relative path to a text file.'),
  maxBytes: z.number().int().positive().max(1_000_000).optional().describe('Maximum bytes to read. Default 200000.'),
};

export const searchCodeInput = {
  query: z.string().min(1).describe('Text to search for.'),
  directory: z.string().optional().describe('Repo-relative directory to search under. Defaults to repo root.'),
  maxResults: z.number().int().positive().max(500).optional().describe('Maximum matches to return. Default 100.'),
  caseSensitive: z.boolean().optional().describe('Case-sensitive match. Default false.'),
};

export const gitDiffInput = {
  staged: z.boolean().optional().describe('Return the staged diff instead of the working-tree diff.'),
  maxBytes: z.number().int().positive().max(2_000_000).optional().describe('Maximum diff bytes to return. Default 200000.'),
};

// ---- Result helpers ----

/** Wraps successful structured data as a text CallToolResult (JSON). */
export function toolOk(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

/** Wraps an error as a structured, non-throwing CallToolResult. */
export function toolFail(code: string, message: string): CallToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify({ error: { code, message } }, null, 2) }],
  };
}

/** Runs a tool handler and converts thrown errors into structured tool errors. */
export async function runTool(handler: () => Promise<unknown> | unknown): Promise<CallToolResult> {
  try {
    return toolOk(await handler());
  } catch (err) {
    if (err instanceof ToolError) return toolFail(err.code, err.message);
    const message = err instanceof Error ? err.message : 'Unexpected tool error.';
    return toolFail('INVALID_INPUT', message);
  }
}
