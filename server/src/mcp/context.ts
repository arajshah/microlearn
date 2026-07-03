import type { ServerConfig } from '../config';
import type { Db } from '../db';

/** Shared, read-only context handed to every MCP tool. */
export interface ToolContext {
  config: ServerConfig;
  db: Db;
  repoRoot: string;
}
