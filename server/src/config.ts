import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

export type NodeEnv = 'development' | 'production' | 'test';

export interface ServerConfig {
  nodeEnv: NodeEnv;
  port: number;
  dbPath: string;
  serviceName: string;
  repoRoot: string;
  enableWriteTools: boolean;
  enableGitPush: boolean;
  requireAuth: boolean;
  mcpBearerToken: string;
  apiBearerToken: string;
}

const DEFAULT_PORT = 3000;
const DEFAULT_DB_PATH = 'server/data/microlearn.local.db';
const SERVICE_NAME = 'microlearn-local-server';

function parsePort(raw: string | undefined): number {
  if (!raw) return DEFAULT_PORT;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0 || parsed > 65535) {
    return DEFAULT_PORT;
  }
  return parsed;
}

function parseNodeEnv(raw: string | undefined): NodeEnv {
  if (raw === 'production' || raw === 'test') return raw;
  return 'development';
}

/**
 * Resolves the Microlearn repo root. Prefers MICROLEARN_REPO_ROOT, otherwise
 * process.cwd(). The presence of package.json is verified separately by callers.
 */
function resolveRepoRoot(): string {
  const override = process.env.MICROLEARN_REPO_ROOT?.trim();
  return override ? path.resolve(override) : process.cwd();
}

function parseBool(raw: string | undefined): boolean {
  return raw?.trim().toLowerCase() === 'true';
}

/** Loads server configuration from environment variables with safe defaults. */
export function loadConfig(): ServerConfig {
  const dbPathRaw = process.env.MICROLEARN_DB_PATH?.trim() || DEFAULT_DB_PATH;
  const requireAuth = parseBool(process.env.MICROLEARN_REQUIRE_AUTH);
  const mcpBearerToken = process.env.MICROLEARN_MCP_BEARER_TOKEN?.trim() ?? '';
  const apiBearerToken = process.env.MICROLEARN_API_BEARER_TOKEN?.trim() ?? '';

  if (requireAuth) {
    if (!mcpBearerToken) {
      throw new Error(
        'MICROLEARN_REQUIRE_AUTH=true but MICROLEARN_MCP_BEARER_TOKEN is missing. Set a non-empty MCP bearer token.',
      );
    }
    if (!apiBearerToken) {
      throw new Error(
        'MICROLEARN_REQUIRE_AUTH=true but MICROLEARN_API_BEARER_TOKEN is missing. Set a non-empty API bearer token.',
      );
    }
  }

  return {
    nodeEnv: parseNodeEnv(process.env.NODE_ENV),
    port: parsePort(process.env.MICROLEARN_SERVER_PORT),
    dbPath: path.resolve(process.cwd(), dbPathRaw),
    serviceName: SERVICE_NAME,
    repoRoot: resolveRepoRoot(),
    enableWriteTools: parseBool(process.env.MICROLEARN_ENABLE_WRITE_TOOLS),
    enableGitPush: parseBool(process.env.MICROLEARN_ENABLE_GIT_PUSH),
    requireAuth,
    mcpBearerToken,
    apiBearerToken,
  };
}
