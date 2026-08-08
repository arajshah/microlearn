#!/usr/bin/env npx tsx
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
} from 'jose';
import type { ServerConfig } from '../server/src/config';
import { isOAuthConfigured, loadConfig } from '../server/src/config';
import {
  authenticateMcpToken,
  buildMcpBearerChallenge,
  createMcpAuthMiddleware,
  createOAuthTokenVerifier,
  createProtectedResourceMetadataRouter,
  getMcpAuthContext,
  isMcpAuthenticationRequired,
  protectedResourceMetadataUrl,
  sendMcpInsufficientScope,
} from '../server/src/auth/mcpAuth';
import {
  missingMcpScopes,
  MCP_TOOL_POLICY_COUNTS,
  requiredScopesForMcpRequest,
  requiredScopesForTool,
} from '../server/src/mcp/scopePolicy';
import { assertConfirmation, assertWriteEnabled } from '../server/src/mcp/guards';

const issuer = 'https://auth.example.test/realms/microlearn';
const audience = 'https://api.example.test/mcp';
const resourceUrl = 'https://api.example.test/mcp';
const staticToken = 'static-mcp-token-for-tests';

const config: ServerConfig = {
  nodeEnv: 'test',
  port: 0,
  dbPath: '/tmp/microlearn-oauth-test.db',
  serviceName: 'microlearn-test',
  repoRoot: process.cwd(),
  enableWriteTools: true,
  enableGitPush: true,
  requireAuth: true,
  mcpBearerToken: staticToken,
  apiBearerToken: 'unchanged-api-token',
  oauthIssuer: issuer,
  oauthAudience: audience,
  oauthResourceUrl: resourceUrl,
};

async function expectRejected(action: () => Promise<unknown>, label: string): Promise<void> {
  let rejected = false;
  try {
    await action();
  } catch {
    rejected = true;
  }
  assert.equal(rejected, true, `${label} should be rejected`);
}

async function main(): Promise<void> {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = 'microlearn-test-key';
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';
  const verifier = createOAuthTokenVerifier(config, {
    keyResolver: createLocalJWKSet({ keys: [publicJwk] }),
  });

  const sign = async (options: {
    scopes?: string;
    tokenIssuer?: string;
    tokenAudience?: string;
    expiresAt?: string;
    signingKey?: CryptoKey;
  } = {}) => new SignJWT({
    scope: options.scopes ?? 'microlearn:read',
    azp: 'chatgpt-test-client',
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'microlearn-test-key', typ: 'JWT' })
    .setIssuer(options.tokenIssuer ?? issuer)
    .setAudience(options.tokenAudience ?? audience)
    .setSubject('test-user')
    .setIssuedAt()
    .setExpirationTime(options.expiresAt ?? '5m')
    .sign(options.signingKey ?? privateKey);

  const readToken = await sign();
  const writeToken = await sign({ scopes: 'microlearn:write' });
  const destructiveToken = await sign({ scopes: 'microlearn:write microlearn:destructive' });

  const staticAuth = await authenticateMcpToken(staticToken, config, verifier);
  assert.equal(staticAuth.kind, 'static');
  assert.deepEqual(staticAuth.scopes, [
    'microlearn:read',
    'microlearn:write',
    'microlearn:destructive',
  ]);

  const oauthAuth = await authenticateMcpToken(readToken, config, verifier);
  assert.equal(oauthAuth.subject, 'test-user');
  assert.equal(oauthAuth.clientId, 'chatgpt-test-client');
  assert.deepEqual(oauthAuth.scopes, ['microlearn:read']);

  const expiredToken = await sign({ expiresAt: '1 second ago' });
  await expectRejected(() => verifier(expiredToken), 'expired token');
  const wrongIssuerToken = await sign({ tokenIssuer: 'https://wrong.example.test' });
  const wrongAudienceToken = await sign({ tokenAudience: 'https://wrong.example.test/mcp' });
  await expectRejected(() => verifier(wrongIssuerToken), 'wrong issuer');
  await expectRejected(() => verifier(wrongAudienceToken), 'wrong audience');
  const otherKeys = await generateKeyPair('RS256');
  const wrongSignatureToken = await sign({ signingKey: otherKeys.privateKey });
  await expectRejected(() => verifier(wrongSignatureToken), 'wrong signature');

  assert.deepEqual(requiredScopesForTool('server_status'), ['microlearn:read']);
  assert.deepEqual(requiredScopesForTool('update_roadmap'), ['microlearn:write']);
  assert.deepEqual(requiredScopesForTool('delete_file'), [
    'microlearn:write',
    'microlearn:destructive',
  ]);
  assert.deepEqual(MCP_TOOL_POLICY_COUNTS, { read: 47, write: 56, destructive: 25 });
  assert.deepEqual(requiredScopesForTool('future_unclassified_tool'), [
    'microlearn:write',
    'microlearn:destructive',
  ]);
  assert.throws(() => assertConfirmation('almost right', 'delete Microlearn file'));
  assert.doesNotThrow(() => assertConfirmation('delete Microlearn file', 'delete Microlearn file'));
  assert.throws(
    () => assertWriteEnabled({ ...config, enableWriteTools: false }),
    /Write tools are disabled/,
  );

  const app = express();
  app.use(express.json());
  app.use(createProtectedResourceMetadataRouter(config));
  app.use('/mcp', createMcpAuthMiddleware(config, verifier));
  app.post('/mcp', (req, res) => {
    const requirement = requiredScopesForMcpRequest(req.body);
    if (requirement) {
      const missing = missingMcpScopes(getMcpAuthContext(res), requirement.requiredScopes);
      if (missing.length) {
        sendMcpInsufficientScope(res, config, requirement.requiredScopes, requirement.id);
        return;
      }
    }
    res.json({ ok: true, auth: getMcpAuthContext(res) });
  });

  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const call = (token: string | null, name: string) => fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name, arguments: {} } }),
  });

  const missing = await call(null, 'server_status');
  assert.equal(missing.status, 401);
  assert.match(missing.headers.get('www-authenticate') ?? '', /resource_metadata=/);

  const invalidToken = 'invalid-secret-token-value';
  const capturedWarnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => capturedWarnings.push(args.map(String).join(' '));
  const invalid = await call(invalidToken, 'server_status');
  console.warn = originalWarn;
  assert.equal(invalid.status, 401);
  assert.match(invalid.headers.get('www-authenticate') ?? '', /error="invalid_token"/);
  assert.equal((await invalid.text()).includes(invalidToken), false);
  assert.equal(capturedWarnings.some((line) => line.includes(invalidToken)), false);
  assert.equal((await call(expiredToken, 'server_status')).status, 401);
  assert.equal((await call(wrongIssuerToken, 'server_status')).status, 401);
  assert.equal((await call(wrongAudienceToken, 'server_status')).status, 401);
  assert.equal((await call(wrongSignatureToken, 'server_status')).status, 401);

  assert.equal((await call(readToken, 'server_status')).status, 200);
  const readDeniedWrite = await call(readToken, 'update_roadmap');
  assert.equal(readDeniedWrite.status, 403);
  assert.match(readDeniedWrite.headers.get('www-authenticate') ?? '', /error="insufficient_scope"/);
  assert.match(readDeniedWrite.headers.get('www-authenticate') ?? '', /resource_metadata=/);
  assert.equal((await call(writeToken, 'update_roadmap')).status, 200);
  assert.equal((await call(writeToken, 'delete_file')).status, 403);
  assert.equal((await call(destructiveToken, 'delete_file')).status, 200);
  assert.equal((await call(staticToken, 'delete_file')).status, 200);

  const metadataResponse = await fetch(`${baseUrl}/.well-known/oauth-protected-resource/mcp`);
  assert.equal(metadataResponse.status, 200);
  const metadata = await metadataResponse.json() as Record<string, unknown>;
  assert.equal(metadata.resource, resourceUrl);
  assert.deepEqual(metadata.authorization_servers, [issuer]);
  assert.equal(
    protectedResourceMetadataUrl(config),
    'https://api.example.test/.well-known/oauth-protected-resource/mcp',
  );
  assert.match(buildMcpBearerChallenge(config), /resource_metadata="https:\/\/api\.example\.test\/\.well-known\/oauth-protected-resource\/mcp"/);

  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));

  const oauthDisabled = { ...config, requireAuth: false, oauthIssuer: '', oauthAudience: '', oauthResourceUrl: '' };
  assert.equal(isOAuthConfigured(oauthDisabled), false);
  assert.equal(isMcpAuthenticationRequired(oauthDisabled), false);
  assert.equal((await authenticateMcpToken(staticToken, oauthDisabled)).kind, 'static');

  const envNames = [
    'MICROLEARN_OAUTH_ISSUER',
    'MICROLEARN_OAUTH_AUDIENCE',
    'MICROLEARN_OAUTH_RESOURCE_URL',
    'MICROLEARN_REQUIRE_AUTH',
    'NODE_ENV',
  ] as const;
  const savedEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  try {
    for (const name of envNames) delete process.env[name];
    process.env.MICROLEARN_OAUTH_ISSUER = issuer;
    assert.throws(() => loadConfig(), /must be configured together/);
    process.env.NODE_ENV = 'test';
    process.env.MICROLEARN_OAUTH_ISSUER = `${issuer}/`;
    process.env.MICROLEARN_OAUTH_AUDIENCE = `${audience}/`;
    process.env.MICROLEARN_OAUTH_RESOURCE_URL = `${resourceUrl}/`;
    const normalizedConfig = loadConfig();
    assert.equal(normalizedConfig.oauthIssuer, issuer);
    assert.equal(normalizedConfig.oauthAudience, audience);
    assert.equal(normalizedConfig.oauthResourceUrl, resourceUrl);
    process.env.NODE_ENV = 'production';
    process.env.MICROLEARN_OAUTH_ISSUER = 'http://auth.example.test/realms/microlearn';
    process.env.MICROLEARN_OAUTH_AUDIENCE = audience;
    process.env.MICROLEARN_OAUTH_RESOURCE_URL = resourceUrl;
    assert.throws(() => loadConfig(), /must use HTTPS in production/);
  } finally {
    for (const name of envNames) {
      const value = savedEnv[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }

  console.log('MCP OAuth verification passed.');
  console.log('  static + JWT auth, claims, scopes, metadata, challenges, and config validated');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
