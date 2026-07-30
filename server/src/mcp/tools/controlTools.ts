import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../context';
import { runTool } from '../toolSchemas';
import { buildControlSystemStatus } from '../../control/controlStatus';

/** Registers control_system_status — the first tool to call before major work. */
export function registerControlTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'control_system_status',
    {
      title: 'Control system status',
      description:
        'Full status report: health, migrations, flags, row counts, git state, recent audit, backups. No secrets.',
      annotations: { readOnlyHint: true },
    },
    async () => runTool(() => buildControlSystemStatus(ctx.config, ctx.db)),
  );
}
