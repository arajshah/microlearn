import fs from 'node:fs';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../context';
import { checkDatabaseHealth } from '../../db';
import { TOOL_CATALOG, TOOL_COUNT, runTool } from '../toolSchemas';
import { getGitBranch } from './gitTools';

interface PackageJson {
  name?: string;
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function readPackageJson(repoRoot: string): PackageJson | null {
  try {
    const raw = fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8');
    return JSON.parse(raw) as PackageJson;
  } catch {
    return null;
  }
}

function inferPackageManager(repoRoot: string): string {
  if (fs.existsSync(path.join(repoRoot, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(repoRoot, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(repoRoot, 'bun.lockb'))) return 'bun';
  if (fs.existsSync(path.join(repoRoot, 'package-lock.json'))) return 'npm';
  return 'unknown';
}

function pickVersions(
  deps: Record<string, string> | undefined,
  devDeps: Record<string, string> | undefined,
  names: string[],
): Record<string, string> {
  const merged = { ...(deps ?? {}), ...(devDeps ?? {}) };
  const out: Record<string, string> = {};
  for (const name of names) {
    if (merged[name]) out[name] = merged[name];
  }
  return out;
}

/** Registers server_status, list_capabilities, get_project_info, and get_package_info. */
export function registerServerTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'server_status',
    {
      title: 'Server status',
      description:
        'Server service name, time, environment, database health, repo root, and tool count.',
      annotations: { readOnlyHint: true },
    },
    async () =>
      runTool(() => {
        const pkg = readPackageJson(ctx.repoRoot);
        return {
          service: ctx.config.serviceName,
          time: new Date().toISOString(),
          env: ctx.config.nodeEnv,
          database: { ok: checkDatabaseHealth(ctx.db) },
          repoRoot: ctx.repoRoot,
          toolCount: TOOL_COUNT,
          version: pkg?.version ?? null,
        };
      }),
  );

  server.registerTool(
    'list_capabilities',
    {
      title: 'List capabilities',
      description: 'Lists the available MCP tools and what each one does.',
      annotations: { readOnlyHint: true },
    },
    async () =>
      runTool(() => ({
        count: TOOL_COUNT,
        readOnly: true,
        tools: TOOL_CATALOG,
      })),
  );

  server.registerTool(
    'get_project_info',
    {
      title: 'Get project info',
      description:
        'High-level project info: package name/version, package manager, scripts, dependency summary, Expo/RN indicators, server folder status, git branch.',
      annotations: { readOnlyHint: true },
    },
    async () =>
      runTool(async () => {
        const pkg = readPackageJson(ctx.repoRoot);
        const deps = pkg?.dependencies ?? {};
        const devDeps = pkg?.devDependencies ?? {};
        const hasExpo = Boolean(deps.expo || devDeps.expo);
        const hasReactNative = Boolean(deps['react-native'] || devDeps['react-native']);
        const serverDir = path.join(ctx.repoRoot, 'server');

        return {
          name: pkg?.name ?? null,
          version: pkg?.version ?? null,
          packageManager: inferPackageManager(ctx.repoRoot),
          scripts: pkg?.scripts ?? {},
          dependencyCounts: {
            dependencies: Object.keys(deps).length,
            devDependencies: Object.keys(devDeps).length,
          },
          frameworks: {
            expo: hasExpo,
            reactNative: hasReactNative,
            expoRouter: Boolean(deps['expo-router']),
          },
          server: {
            present: fs.existsSync(serverDir),
            hasSrc: fs.existsSync(path.join(serverDir, 'src')),
          },
          gitBranch: await getGitBranch(ctx.repoRoot),
        };
      }),
  );

  server.registerTool(
    'get_package_info',
    {
      title: 'Get package info',
      description:
        'Parsed package.json: name, scripts, dependencies, devDependencies, and key framework versions.',
      annotations: { readOnlyHint: true },
    },
    async () =>
      runTool(() => {
        const pkg = readPackageJson(ctx.repoRoot);
        if (!pkg) {
          return { name: null, scripts: {}, dependencies: {}, devDependencies: {}, keyVersions: {} };
        }
        return {
          name: pkg.name ?? null,
          version: pkg.version ?? null,
          scripts: pkg.scripts ?? {},
          dependencies: pkg.dependencies ?? {},
          devDependencies: pkg.devDependencies ?? {},
          keyVersions: pickVersions(pkg.dependencies, pkg.devDependencies, [
            'expo',
            'react',
            'react-native',
            'typescript',
            'express',
            'better-sqlite3',
            '@modelcontextprotocol/sdk',
          ]),
        };
      }),
  );
}
