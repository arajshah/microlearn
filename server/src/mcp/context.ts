import type { ServerConfig } from '../config';
import type { Db } from '../db';
import type { McpAuthContext } from '../auth/mcpAuth';
import type { TrustedAutomationGrant } from '../automation/types';

/** Shared, read-only context handed to every MCP tool. */
export interface ToolContext {
  config: ServerConfig;
  db: Db;
  repoRoot: string;
  auth: McpAuthContext;
  trustedAuthorizations?: Map<string, TrustedAutomationGrant[]>;
}
