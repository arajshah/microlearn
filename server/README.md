# Microlearn Local Control Server

A small local Node/TypeScript backend that runs **separately** from the Expo dev
server. It currently exposes a single `/health` endpoint backed by Express and a
local SQLite database. Later phases will add MCP tools, REST endpoints, and
controlled repository operations — none of that exists yet.

> This server is for **local development only**. Do not deploy it or expose it
> permanently.

## Prerequisites

- Node.js (same version used for the app)
- Dependencies installed at the repo root: `npm install`

## Running the server

From the repo root:

```bash
# Dev (runs TypeScript directly via tsx)
npm run server:dev
```

If `server:dev` fails in a restricted/sandboxed environment because of a `tsx`
IPC pipe issue (`EPERM ... .pipe`), use the compiled path instead:

```bash
npm run server:build
npm run server:start
```

The server listens on port `3000` by default. Override with
`MICROLEARN_SERVER_PORT`.

### Verify locally

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{
  "ok": true,
  "service": "microlearn-local-server",
  "env": "development",
  "port": 3000,
  "database": { "ok": true, "path": "server/data/microlearn.local.db" },
  "time": "2026-06-28T00:00:00.000Z"
}
```

## Exposing the server with a Cloudflare Quick Tunnel

A Cloudflare **Quick Tunnel** gives the local server a temporary public HTTPS URL
without a Cloudflare account, a domain, or a paid plan. This is useful for
reaching the local server from ChatGPT/Codex or a phone during development.

### 1. Install `cloudflared` (macOS)

```bash
brew install cloudflared
```

`cloudflared` is a standalone CLI. **Do not** add it as an npm dependency.

### 2. Start the local server

In one terminal:

```bash
npm run server:dev
# or: npm run server:build && npm run server:start
```

### 3. Start the tunnel

In a second terminal:

```bash
cloudflared tunnel --url http://localhost:3000
```

You can also use the npm helper script (equivalent):

```bash
npm run server:tunnel
```

`cloudflared` prints a generated URL that looks like:

```text
https://<random-words>.trycloudflare.com
```

### 4. Verify the public endpoint

```bash
curl https://<generated-trycloudflare-url>/health
```

The response must include:

```json
{ "ok": true, "service": "microlearn-local-server" }
```

It should match the localhost response.

## Known limitations

- **Quick Tunnel URLs are temporary.** A new URL is generated every time you run
  `cloudflared tunnel --url ...`, and it stops working when the tunnel process
  ends. Never commit a generated `trycloudflare.com` URL.
- Quick Tunnels are **development-only**. They are not stable or authenticated
  and should not be relied on for production traffic.
- **Future MCP transport:** when MCP is added in a later phase, use
  **Streamable HTTP**, not SSE. Quick Tunnels may not proxy long-lived SSE
  streams reliably, whereas Streamable HTTP works well over a Quick Tunnel.

## MCP endpoint (read-only repo inspection)

The server exposes a Model Context Protocol endpoint over **Streamable HTTP**
(not SSE) at:

```text
POST /mcp
```

It is **read-only**: it can inspect this repository but cannot edit files, run
arbitrary commands, or write to git. All tools are restricted to the Microlearn
repo root and skip heavy/generated folders and sensitive files.

### Tools

| Tool | Description |
|------|-------------|
| `server_status` | Service name, time, environment, database health, repo root, tool count, version. |
| `list_capabilities` | Lists all MCP tools and what each does. |
| `get_project_info` | Package name/version, package manager, scripts, dependency counts, Expo/RN indicators, server folder status, git branch. |
| `list_files` | Lists files under the repo (optional `directory`, `recursive`, `maxResults`). Returns relative paths. |
| `read_file` | Reads a repo text file (`path`, optional `maxBytes`). Blocks sensitive/binary files, enforces a size limit. |
| `search_code` | Searches repo text files (`query`, optional `directory`, `maxResults`, `caseSensitive`). |
| `git_status` | Branch, clean flag, changed/staged/untracked files. |
| `git_diff` | Working-tree or `staged` diff, size-limited. |
| `get_package_info` | Parsed `package.json`: name, scripts, deps, devDeps, key framework versions. |

### Safety restrictions

- Paths are resolved against the repo root; traversal and symlink escapes are
  rejected (`PATH_OUTSIDE_REPO`).
- Skipped directories: `node_modules`, `.git`, `.expo`, `dist`, `build`,
  `coverage`, `server/data`.
- Blocked files (never listed or read): `.env`, `.env.*`, `*.pem`, `*.key`,
  `*.crt`, `*.p12`, `*.sqlite`, `*.db`, `*.db-shm`, `*.db-wal`.
- Binary files are not read (`BINARY_FILE_UNSUPPORTED`); large files are
  truncated or rejected (`FILE_TOO_LARGE`).
- Only read-only git commands run (`status`, `diff`, `rev-parse`), each with a
  timeout. There is no arbitrary command execution and no write tools.

### Connecting from ChatGPT Developer Mode

1. Start the server: `npm run server:dev` (or build + start).
2. Start the tunnel: `cloudflared tunnel --url http://localhost:3000`
   (or `npm run server:tunnel`).
3. Copy the generated `https://<random>.trycloudflare.com` URL.
4. In ChatGPT (web), open **Settings**.
5. Enable **Developer Mode** if it is not already on.
6. Create a custom app / connector.
7. Set the MCP server URL to:

   ```text
   https://<generated-url>.trycloudflare.com/mcp
   ```

8. Let ChatGPT scan the available tools.
9. Test the connection by calling `server_status`.

> Quick Tunnel URLs are **temporary**. Each time you restart `cloudflared`, a new
> URL is generated and you must update the connector URL in ChatGPT.

### Quick local check

The endpoint speaks JSON-RPC 2.0 over HTTP. A minimal `tools/list` call:

```bash
curl -s http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Environment variables

See [`.env.example`](./.env.example). No secrets are required for this phase.

- `MICROLEARN_TUNNEL_URL` — optional; keep a tunnel URL handy locally
  (git-ignored). Do not commit it.
- `MICROLEARN_REPO_ROOT` — optional absolute repo root for the MCP tools.
  Defaults to `process.cwd()` (run the server from the repo root).
