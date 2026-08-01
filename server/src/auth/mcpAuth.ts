import { createHash, timingSafeEqual } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import type { ServerConfig } from '../config';
import { isOAuthConfigured } from '../config';
import { logger } from '../logger';
import { parseBearerToken } from './bearerAuth';

export const MCP_SCOPES = [
  'microlearn:read',
  'microlearn:write',
  'microlearn:destructive',
] as const;

export type McpScope = (typeof MCP_SCOPES)[number];

export interface McpAuthContext {
  kind: 'static' | 'oauth';
  subject: string | null;
  scopes: string[];
  clientId?: string | null;
}

type JoseModule = typeof import('jose');
type JwtKeyResolver = Parameters<JoseModule['jwtVerify']>[1];
type JoseLoader = () => Promise<JoseModule>;
export type OAuthTokenVerifier = (token: string) => Promise<McpAuthContext>;

export interface OAuthVerifierOptions {
  keyResolver?: JwtKeyResolver;
  loadJose?: JoseLoader;
}

const loadJoseModule: JoseLoader = new Function('return import("jose")') as JoseLoader;

function constantTimeTokenMatch(actual: string, expected: string): boolean {
  if (!expected) return false;
  const actualDigest = createHash('sha256').update(actual, 'utf8').digest();
  const expectedDigest = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

function claimStrings(value: unknown): string[] {
  if (typeof value === 'string') return value.split(/\s+/).filter(Boolean);
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  return [];
}

function verifiedScopes(payload: Record<string, unknown>): string[] {
  return [...new Set([...claimStrings(payload.scope), ...claimStrings(payload.scp)])];
}

/** Builds a cached Keycloak JWT verifier. Tests may inject local signing keys. */
export function createOAuthTokenVerifier(
  config: ServerConfig,
  options: OAuthVerifierOptions = {},
): OAuthTokenVerifier {
  if (!isOAuthConfigured(config)) {
    throw new Error('OAuth token verification requires complete OAuth configuration.');
  }

  let remoteKeyResolver: JwtKeyResolver | undefined;
  return async (token: string): Promise<McpAuthContext> => {
    const jose = await (options.loadJose ?? loadJoseModule)();
    const keyResolver = options.keyResolver ?? (remoteKeyResolver ??= jose.createRemoteJWKSet(
      new URL(`${config.oauthIssuer}/protocol/openid-connect/certs`),
    ));
    const { payload } = await jose.jwtVerify(token, keyResolver, {
      algorithms: ['RS256'],
      issuer: config.oauthIssuer,
      audience: config.oauthAudience,
    });

    const clientId = typeof payload.azp === 'string'
      ? payload.azp
      : typeof payload.client_id === 'string'
        ? payload.client_id
        : null;

    return {
      kind: 'oauth',
      subject: typeof payload.sub === 'string' ? payload.sub : null,
      scopes: verifiedScopes(payload),
      clientId,
    };
  };
}

/** Authenticates either the configured static MCP token or a verified OAuth JWT. */
export async function authenticateMcpToken(
  token: string,
  config: ServerConfig,
  verifyOAuth?: OAuthTokenVerifier,
): Promise<McpAuthContext> {
  if (constantTimeTokenMatch(token, config.mcpBearerToken)) {
    return { kind: 'static', subject: null, scopes: [...MCP_SCOPES], clientId: null };
  }
  if (!isOAuthConfigured(config)) throw new Error('invalid_token');
  return (verifyOAuth ?? createOAuthTokenVerifier(config))(token);
}

export function protectedResourceMetadataUrl(config: ServerConfig): string {
  if (!isOAuthConfigured(config)) return '';
  const resource = new URL(config.oauthResourceUrl);
  const suffix = resource.pathname === '/' ? '' : resource.pathname;
  return `${resource.origin}/.well-known/oauth-protected-resource${suffix}`;
}

function challengeValue(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}

export function buildMcpBearerChallenge(
  config: ServerConfig,
  options: { error?: 'invalid_token' | 'insufficient_scope'; scopes?: readonly string[] } = {},
): string {
  const values: string[] = [];
  const metadataUrl = protectedResourceMetadataUrl(config);
  if (metadataUrl) values.push(`resource_metadata="${challengeValue(metadataUrl)}"`);
  if (options.error) values.push(`error="${options.error}"`);
  if (options.scopes?.length) values.push(`scope="${challengeValue(options.scopes.join(' '))}"`);
  return values.length ? `Bearer ${values.join(', ')}` : 'Bearer';
}

export function sendMcpInsufficientScope(
  res: Response,
  config: ServerConfig,
  requiredScopes: readonly string[],
  id: unknown = null,
): void {
  res.setHeader('WWW-Authenticate', buildMcpBearerChallenge(config, {
    error: 'insufficient_scope',
    scopes: requiredScopes,
  }));
  res.status(403).json({
    jsonrpc: '2.0',
    error: {
      code: -32001,
      message: 'Insufficient OAuth scope for this MCP operation.',
      data: { requiredScopes },
    },
    id: id ?? null,
  });
}

/** Express middleware for the combined static-token and OAuth MCP auth path. */
export function createMcpAuthMiddleware(
  config: ServerConfig,
  verifyOAuth?: OAuthTokenVerifier,
) {
  const verifier = verifyOAuth ?? (isOAuthConfigured(config) ? createOAuthTokenVerifier(config) : undefined);
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const token = parseBearerToken(req.headers.authorization);
    if (!token) {
      res.setHeader('WWW-Authenticate', buildMcpBearerChallenge(config));
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Bearer authentication is required.' } });
      return;
    }

    try {
      res.locals.mcpAuth = await authenticateMcpToken(token, config, verifier);
      next();
    } catch {
      logger.warn('MCP authentication failed', { category: 'invalid_token' });
      res.setHeader('WWW-Authenticate', buildMcpBearerChallenge(config, { error: 'invalid_token' }));
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Bearer token is invalid or expired.' } });
    }
  };
}

export function getMcpAuthContext(res: Response): McpAuthContext {
  const context = res.locals.mcpAuth as McpAuthContext | undefined;
  return context ?? { kind: 'static', subject: null, scopes: [...MCP_SCOPES], clientId: null };
}

export function isMcpAuthenticationRequired(config: ServerConfig): boolean {
  return config.requireAuth || isOAuthConfigured(config);
}

export function protectedResourceMetadata(config: ServerConfig) {
  return {
    resource: config.oauthResourceUrl,
    authorization_servers: [config.oauthIssuer],
    scopes_supported: [...MCP_SCOPES],
    bearer_methods_supported: ['header'],
  };
}

/** Public RFC 9728 metadata routes for the configured MCP resource. */
export function createProtectedResourceMetadataRouter(config: ServerConfig): Router {
  const router = Router();
  if (!isOAuthConfigured(config)) return router;

  const metadata = protectedResourceMetadata(config);
  const metadataPath = new URL(protectedResourceMetadataUrl(config)).pathname;
  router.get(metadataPath, (_req, res) => res.json(metadata));
  if (metadataPath !== '/.well-known/oauth-protected-resource') {
    router.get('/.well-known/oauth-protected-resource', (_req, res) => res.json(metadata));
  }
  return router;
}
