import { Router, type Request, type Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { ServerConfig } from '../config';
import type { Db } from '../db';
import { logger } from '../logger';
import type { ToolContext } from './context';
import { assertRepoRoot } from './repoSafety';
import { TOOL_COUNT } from './toolSchemas';
import { registerServerTools } from './tools/serverTools';
import { registerRepoTools } from './tools/repoTools';
import { registerGitTools } from './tools/gitTools';

const MCP_SERVER_NAME = 'microlearn-local-mcp';
const MCP_SERVER_VERSION = '0.1.0';

/** Builds a fresh MCP server instance with all read-only tools registered. */
function buildMcpServer(ctx: ToolContext): McpServer {
  const server = new McpServer(
    { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  registerServerTools(server, ctx);
  registerRepoTools(server, ctx);
  registerGitTools(server, ctx);

  return server;
}

function methodNotAllowed(res: Response): void {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed. Use POST for the MCP Streamable HTTP endpoint.' },
    id: null,
  });
}

/**
 * Creates the /mcp router using stateless Streamable HTTP (JSON responses, no SSE).
 * A fresh server + transport are created per request, which is the recommended
 * stateless pattern and avoids cross-request state.
 */
export function createMcpRouter(config: ServerConfig, db: Db): Router {
  assertRepoRoot(config.repoRoot);
  const ctx: ToolContext = { config, db, repoRoot: config.repoRoot };
  const router = Router();

  logger.info('MCP endpoint mounted', {
    path: '/mcp',
    transport: 'streamable-http',
    tools: TOOL_COUNT,
    repoRoot: config.repoRoot,
  });

  router.post('/mcp', async (req: Request, res: Response) => {
    const server = buildMcpServer(ctx);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on('close', () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      logger.error('MCP request failed', err instanceof Error ? err.message : 'unknown error');
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal MCP error.' },
          id: null,
        });
      }
    }
  });

  router.get('/mcp', (_req, res) => methodNotAllowed(res));
  router.delete('/mcp', (_req, res) => methodNotAllowed(res));

  return router;
}
