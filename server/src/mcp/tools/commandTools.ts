import fs from 'node:fs';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../context';
import { allowlistDisplay, runAllowedCommand, runCommand, type CommandResult } from '../../repo/commandRunner';
import { runAllowedCommandInput, runTestsInput, runTypecheckInput, runTool } from '../toolSchemas';

const TYPECHECK_TIMEOUT_MS = 180_000;

function summarize(result: CommandResult) {
  return {
    command: result.command,
    exitCode: result.exitCode,
    ok: result.exitCode === 0 && !result.timedOut,
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    stdout: result.stdout.slice(-8000),
    stderr: result.stderr.slice(-8000),
  };
}

function readScripts(repoRoot: string): Record<string, string> {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    return pkg.scripts ?? {};
  } catch {
    return {};
  }
}

/** Registers run_typecheck, run_tests, run_allowed_command, get_command_allowlist. */
export function registerCommandTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'run_typecheck',
    {
      title: 'Run typecheck',
      description: 'Run app, server, or both typechecks and return exit code, output, and duration.',
      inputSchema: runTypecheckInput,
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      runTool(async () => {
        const target = args.target ?? 'both';
        const results: ReturnType<typeof summarize>[] = [];

        if (target === 'server' || target === 'both') {
          results.push(
            summarize(await runCommand('npm', ['run', 'server:typecheck'], ctx.repoRoot, TYPECHECK_TIMEOUT_MS)),
          );
        }
        if (target === 'app' || target === 'both') {
          results.push(summarize(await runCommand('npx', ['tsc', '--noEmit'], ctx.repoRoot, TYPECHECK_TIMEOUT_MS)));
        }
        return { target, ok: results.every((r) => r.ok), results };
      }),
  );

  server.registerTool(
    'run_tests',
    {
      title: 'Run tests',
      description: 'Run the safest available test script, or report NO_TEST_SCRIPT.',
      inputSchema: runTestsInput,
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      runTool(async () => {
        const target = args.target ?? 'all';
        const scripts = readScripts(ctx.repoRoot);
        const candidates: string[] = [];
        if (target === 'server' || target === 'all') candidates.push('server:test');
        if (target === 'app' || target === 'all') candidates.push('test');

        const scriptName = candidates.find((name) => typeof scripts[name] === 'string');
        if (!scriptName) {
          return {
            code: 'NO_TEST_SCRIPT',
            message: `No test script found for target "${target}".`,
            checked: candidates,
          };
        }
        const result = await runCommand('npm', ['run', scriptName], ctx.repoRoot, TYPECHECK_TIMEOUT_MS);
        return { script: scriptName, ...summarize(result) };
      }),
  );

  server.registerTool(
    'run_allowed_command',
    {
      title: 'Run allowed command',
      description: 'Run an allowlisted command via execFile (no shell).',
      inputSchema: runAllowedCommandInput,
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      runTool(async () => {
        const result = await runAllowedCommand(args.command, args.args ?? [], ctx.repoRoot, TYPECHECK_TIMEOUT_MS);
        return summarize(result);
      }),
  );

  server.registerTool(
    'get_command_allowlist',
    {
      title: 'Get command allowlist',
      description: 'Return the allowed command list for run_allowed_command.',
      annotations: { readOnlyHint: true },
    },
    async () => runTool(() => ({ allowlist: allowlistDisplay() })),
  );
}
