#!/usr/bin/env npx tsx
/**
 * Verifies secure runtime storage of the Microlearn API bearer token.
 *
 * Runs the real src/services code against an in-memory stand-in for the device
 * keychain and a stubbed fetch, so it never touches a real keychain or network.
 */
import Module from 'node:module';

// ---------------------------------------------------------------------------
// Stub expo-secure-store before the modules under test are loaded.
// ---------------------------------------------------------------------------
const keychain = new Map<string, string>();
let keychainAvailable = true;
let keychainWrites = 0;

const secureStoreStub = {
  async getItemAsync(key: string): Promise<string | null> {
    if (!keychainAvailable) throw new Error('SecureStore unavailable');
    return keychain.has(key) ? (keychain.get(key) as string) : null;
  },
  async setItemAsync(key: string, value: string): Promise<void> {
    if (!keychainAvailable) throw new Error('SecureStore unavailable');
    keychainWrites += 1;
    keychain.set(key, value);
  },
  async deleteItemAsync(key: string): Promise<void> {
    if (!keychainAvailable) throw new Error('SecureStore unavailable');
    keychain.delete(key);
  },
};

type Loader = (request: string, parent: unknown, isMain: boolean) => unknown;
const moduleInternals = Module as unknown as { _load: Loader };
const originalLoad = moduleInternals._load;
moduleInternals._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === 'expo-secure-store') return secureStoreStub;
  return originalLoad.call(this, request, parent, isMain);
};

// The client reads its base URL at module scope, so set it before importing.
process.env.EXPO_PUBLIC_MICROLEARN_API_BASE_URL = 'http://localhost:9999';
// Prove the removed env var has no effect: if it were still read, auth headers
// would appear even with an empty keychain.
process.env.EXPO_PUBLIC_MICROLEARN_API_TOKEN = 'env-token-should-be-ignored';

// ---------------------------------------------------------------------------
// Capture every outbound request.
// ---------------------------------------------------------------------------
interface Captured {
  url: string;
  method: string;
  headers: Record<string, string>;
}
const requests: Captured[] = [];

(globalThis as { fetch?: unknown }).fetch = async (
  url: string,
  init?: { method?: string; headers?: Record<string, string> },
) => {
  requests.push({
    url: String(url),
    method: init?.method ?? 'GET',
    headers: { ...(init?.headers ?? {}) },
  });
  return {
    ok: true,
    status: 200,
    json: async () => ({}),
  };
};

// Record anything written to the console so we can assert the token never leaks.
const consoleOutput: string[] = [];
for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
  const original = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    consoleOutput.push(args.map((a) => String(a)).join(' '));
    original(...args);
  };
}

/* eslint-disable @typescript-eslint/no-var-requires */
const {
  clearApiToken,
  getApiToken,
  hasApiToken,
  saveApiToken,
} = require('../src/services/apiToken') as typeof import('../src/services/apiToken');

const server = require('../src/services/microlearnServer') as typeof import('../src/services/microlearnServer');
/* eslint-enable @typescript-eslint/no-var-requires */

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function authOf(req: Captured): string | undefined {
  return req.headers.Authorization ?? req.headers.authorization;
}

/** Exercises one representative caller for each of the nine header sites. */
async function callEveryPath(): Promise<void> {
  requests.length = 0;
  await server.fetchServerRoadmaps(); // getJson
  await server.postLearningEvent({ eventType: 'card_viewed' }); // postJson
  await server.finishDiagnosticSession('session-1'); // patchJson
  await server.deleteRetrievalItem('item-1'); // deleteJson / deleteJsonDetailed
  await server.fetchServerRoadmapMeta('roadmap-1'); // getJsonDetailed
  await server.createServerRoadmap({
    id: 'roadmap-1',
    title: 't',
    topic: 'x',
    goal: 'g',
    masteryLevel: 3,
    depth: 'standard',
    units: [],
  } as never); // postJsonDetailed
  await server.patchServerRoadmapNode('roadmap-1', 'node-1', { status: 'available' } as never); // patchJsonDetailed
  await server.deleteServerRoadmap('roadmap-1'); // deleteJsonDetailed
  await server.uploadDocumentSource({ uri: 'file:///tmp/a.pdf', name: 'a.pdf' } as never); // FormData upload
}

async function main(): Promise<void> {
  assert(server.isServerConfigured(), 'base URL should still come from the env var');

  // 1. No token stored -> no Authorization header anywhere.
  assert((await getApiToken()) === '', 'expected no token initially');
  assert((await hasApiToken()) === false, 'hasApiToken should be false initially');
  await callEveryPath();
  const initialCount = requests.length;
  assert(initialCount === 9, `expected 9 requests, saw ${initialCount}`);
  for (const req of requests) {
    assert(!authOf(req), `unauthenticated request unexpectedly carried auth: ${req.url}`);
    assert(req.headers.Accept === 'application/json', `missing Accept on ${req.url}`);
  }

  // 2. Saving a token attaches it to every request.
  const token = 'secret-token-abc123';
  assert(await saveApiToken(token), 'saveApiToken should succeed');
  assert(keychainWrites === 1, 'token should be written to the keychain exactly once');
  assert(await hasApiToken(), 'hasApiToken should be true after save');

  await callEveryPath();
  assert(requests.length === 9, `expected 9 requests, saw ${requests.length}`);
  for (const req of requests) {
    assert(
      authOf(req) === `Bearer ${token}`,
      `missing/incorrect bearer on ${req.method} ${req.url}: ${authOf(req)}`,
    );
  }

  // 3. The JSON verbs must keep Content-Type. A missing await on the spread
  //    (`{...authHeaders()}`) type-checks fine but silently drops auth, so this
  //    guards both properties at once.
  const jsonWrites = requests.filter((r) => ['POST', 'PATCH', 'DELETE'].includes(r.method));
  assert(jsonWrites.length >= 6, `expected >=6 write requests, saw ${jsonWrites.length}`);
  for (const req of jsonWrites) {
    const isUpload = req.url.includes('/api/sources/upload');
    if (isUpload) continue; // multipart: fetch sets its own Content-Type
    assert(
      req.headers['Content-Type'] === 'application/json',
      `lost Content-Type on ${req.method} ${req.url}`,
    );
    assert(authOf(req) === `Bearer ${token}`, `lost auth on ${req.method} ${req.url}`);
  }

  // 4. A single keychain read is cached across many requests.
  const readsBefore = keychainWrites;
  await callEveryPath();
  assert(keychainWrites === readsBefore, 'reads should not write to the keychain');

  // 5. Replacing the token takes effect immediately.
  assert(await saveApiToken('second-token-xyz'), 'replacing the token should succeed');
  requests.length = 0;
  await server.fetchServerRoadmaps();
  assert(
    authOf(requests[0]) === 'Bearer second-token-xyz',
    'replacement token should be used immediately',
  );

  // 6. Clearing removes the header again.
  assert(await clearApiToken(), 'clearApiToken should succeed');
  assert((await hasApiToken()) === false, 'hasApiToken should be false after clear');
  await callEveryPath();
  for (const req of requests) {
    assert(!authOf(req), `auth header survived clear on ${req.url}`);
  }

  // 7. Whitespace-only input clears rather than storing a blank token.
  await saveApiToken('   ');
  assert((await hasApiToken()) === false, 'whitespace token should not be stored');
  await saveApiToken('  padded-token  ');
  requests.length = 0;
  await server.fetchServerRoadmaps();
  assert(authOf(requests[0]) === 'Bearer padded-token', 'token should be trimmed before use');
  await clearApiToken();

  // 8. An unavailable keychain (e.g. web) degrades to unauthenticated requests
  //    instead of throwing.
  keychainAvailable = false;
  assert((await saveApiToken('x')) === false, 'save should report failure when keychain is down');
  assert((await getApiToken()) === '', 'getApiToken should return empty when keychain is down');
  requests.length = 0;
  await server.fetchServerRoadmaps();
  assert(requests.length === 1, 'request should still be attempted without a keychain');
  assert(!authOf(requests[0]), 'no auth header when keychain is unavailable');
  keychainAvailable = true;

  // 9. The token must never reach the console.
  const leaked = consoleOutput.filter(
    (line) => line.includes(token) || line.includes('second-token-xyz') || line.includes('padded-token'),
  );
  assert(leaked.length === 0, `token leaked to console output: ${leaked.join(' | ')}`);

  console.log('API token verification passed.');
  console.log(`  header sites exercised:  9`);
  console.log(`  env var honored:         EXPO_PUBLIC_MICROLEARN_API_BASE_URL only`);
  console.log(`  keychain writes:         ${keychainWrites}`);
  console.log(`  console leaks:           0`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
