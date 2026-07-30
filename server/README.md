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

## Write tools, git tools, and feature flags (Phase 4/5)

Write-capable MCP tools are **disabled by default**. Enable them explicitly for a
session:

```bash
MICROLEARN_ENABLE_WRITE_TOOLS=true npm run server:start
# to also allow git push (still requires a confirmation field):
MICROLEARN_ENABLE_WRITE_TOOLS=true MICROLEARN_ENABLE_GIT_PUSH=true npm run server:start
```

- `MICROLEARN_ENABLE_WRITE_TOOLS` (default `false`) — gates all write tools.
  Read-only tools always work. When off, write tools return
  `WRITE_TOOLS_DISABLED`.
- `MICROLEARN_ENABLE_GIT_PUSH` (default `false`) — gates `push_branch`. When off,
  it returns `GIT_PUSH_DISABLED`.

### Write tools (require write flag)

| Tool | Notes |
|------|-------|
| `create_file` | New text file; rejects sensitive/binary/outside paths; `overwrite` optional. |
| `apply_patch` | `git apply` a unified diff; `checkOnly` validates only. |
| `move_file` | Rename/move within repo; won't overwrite unless asked. |
| `delete_file` | File only; `confirm: "delete Microlearn file"`. |
| `restore_file` | `git restore` one file; `confirm: "restore Microlearn file"`. |
| `create_branch` | Creates a branch, optional checkout. |
| `stage_files` | Stages only safe paths. |
| `create_commit` | Commits staged changes; never pushes. |
| `push_branch` | `confirm: "push Microlearn branch"`; needs git-push flag; no force push. |
| `restore_files` | `git restore`; `confirm: "restore Microlearn files"`. |

### Command tools (read-only checks, no shell)

`run_typecheck` (`app`/`server`/`both`), `run_tests` (reports `NO_TEST_SCRIPT`
if none), `run_allowed_command` (strict allowlist), `get_command_allowlist`.
All run via `execFile` — never a shell — and there is no arbitrary command
execution.

### Git safety

No force push, no `reset --hard`, no `clean`, no rebase, no tag/branch deletion,
no remote modification, no automatic commits or pushes.

## REST API (`/api`)

JSON-only local API backed by SQLite (schema applied via `schema_migrations`).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | API + database health. |
| GET | `/api/roadmaps` | List roadmaps (optional `?status=`). |
| POST | `/api/roadmaps` | Create roadmap with nested units + lesson nodes (transactional). |
| GET | `/api/roadmaps/:id` | One roadmap, nested. |
| PATCH | `/api/roadmaps/:id` | Update metadata/status (whitelisted columns). |
| DELETE | `/api/roadmaps/:id` | Soft-delete; body `{ "confirm": "delete Microlearn roadmap" }`. |
| GET | `/api/roadmaps/:id/lessons` | Generated lessons for a roadmap. |
| GET | `/api/roadmaps/:id/outcomes` | Lesson outcomes for a roadmap. |
| POST | `/api/outcomes` | Store a lesson outcome (+ progress event). |
| GET | `/api/lesson-nodes/:id/outcomes` | Outcomes for one lesson node. |
| POST | `/api/lessons` | Create/update a generated lesson (transactional). |
| GET | `/api/lessons/:lessonId` | One generated lesson. |

Multi-table writes are transactional and record a `content_versions` snapshot.
Errors are clear `400`/`404`/`500` JSON with no stack traces.

## App integration (optional)

Set `EXPO_PUBLIC_MICROLEARN_API_BASE_URL` for the Expo app to additionally fetch
read-only **published** roadmaps from this server. When unset, the app behaves exactly as
before (AsyncStorage only). Server fetch failures fall back gracefully to local
data; existing app-generated roadmaps are never removed.

When the server has auth enabled, also set `EXPO_PUBLIC_MICROLEARN_API_TOKEN` so
app requests include `Authorization: Bearer …`. This is **local/tunnel dev only**
— Expo public env vars are visible in the client bundle, not production security.

Completed lessons optionally POST outcomes to `/api/outcomes` without blocking local
completion if the server is unreachable.

## Phase 7: audit, auth, backups, progress, control status

### Start here: `control_system_status`

Call this MCP tool first before major work. It reports health, migrations, row
counts, feature flags (never token values), git state, recent audit events, and
backup count.

### Audit log

Every successful MCP write/publish action records an `audit_events` row (actor
`mcp` by default). API outcome writes record actor `api`. Inspect via
`list_audit_events` and `get_audit_event`.

### Optional auth (local dev)

```bash
MICROLEARN_REQUIRE_AUTH=true \
MICROLEARN_MCP_BEARER_TOKEN=your-mcp-token \
MICROLEARN_API_BEARER_TOKEN=your-api-token \
npm run server:start
```

- `/health` stays public.
- `/api/*` (including `/api/health`) requires the API bearer token.
- `/mcp` requires the MCP bearer token.
- Startup fails if auth is required but tokens are missing.

### Backups

Write tools can export backups under `server/backups/` (gitignored):

- `export_curriculum_backup` — JSON export of curriculum + audit summary.
- `export_sqlite_backup` — SQLite file copy (confirm: `backup Microlearn database`).
- `list_backups` — list backup files.

Destructive backup restore is **not** implemented (deferred).

### Progress MCP tools (read-only)

- `get_progress_summary` — completed counts, average accuracy, weak concepts from stored outcomes only.
- `get_revision_targets` — nodes that may need revision (low accuracy, mistakes, unresolved questions).
- `suggest_lesson_revision` — structured context + recommendations; does not mutate content.

### Document source extraction (Phase 4)

Local-server extraction for **public http(s) document links** — not native upload.

**Supported sources (priority):**

- arXiv PDF links (`/abs/` normalized to `/pdf/`)
- Public PDF URLs
- Public `.txt` and markdown files
- Simple public HTML/article pages (script/style stripped)

**Limits:** 15 MB max download, 20 s timeout, 300k chars stored text, 300 char title max.

**REST**

```bash
POST /api/sources/extract   # { "url": "...", "force"?: boolean }
GET  /api/sources           # ?status=&limit=
GET  /api/sources/:id       # ?includeText=true
```

**MCP tools**

- `extract_document_source` (read)
- `get_document_source` (read)
- `list_document_sources` (read)
- `create_roadmap_from_source` (write — requires `MICROLEARN_ENABLE_WRITE_TOOLS=true` + confirmation)
- `create_lesson_from_source` (write — requires write tools + confirmation)

Write tools create **draft** roadmaps/lessons from extracted text heuristics — they do not auto-publish and do not call external AI from the server.

**App integration:** set `EXPO_PUBLIC_MICROLEARN_API_BASE_URL` so Create → Document Link uses `POST /api/sources/extract`. Without the server, the app falls back to in-app URL import (Gemini) or URL-as-context helper text.

Upload/file picker is **deferred** (Phase 4 placeholder only in the app).

## Retrieval engine (Phase 5)

Spaced-repetition retrieval for generated lessons, with local app fallback.

**Purpose:** After completing server-backed lessons, seed recall items and schedule reviews using a simple SM-2-style scheduler. The Retrieve tab merges server due items with the existing local `ReviewContext` queue.

**Scheduler (ratings):**

| Rating | Effect |
|--------|--------|
| `forgot` | reps=0, lapses+1, ease−0.2 (min 1.3), interval 0–1 days |
| `partial` | reps+1, ease−0.05, interval ≥1 day |
| `remembered` | reps+1, ease+0.05, intervals 1 → 3 → interval×ease |
| `easy` | reps+1, ease+0.1, intervals 3 → 7 → interval×ease |

Mastered when `interval_days >= 21` and `reps >= 4`. Due when `due_at <= now`.

**REST**

```bash
GET  /api/retrieval/due              # ?roadmapId=&limit=
GET  /api/retrieval/summary          # ?roadmapId=
POST /api/retrieval/items/seed       # { lessonId, roadmapId?, lessonNodeId?, force? }
POST /api/retrieval/sessions         # { itemIds[], roadmapId? }
PATCH /api/retrieval/sessions/:id/finish
POST /api/retrieval/attempts         # { itemId, rating, sessionId?, ... }
```

**MCP tools**

Read: `get_due_retrieval_items`, `get_retrieval_summary`, `inspect_retrieval_schedule`, `list_retrieval_attempts`

Write (requires `MICROLEARN_ENABLE_WRITE_TOOLS=true`): `seed_retrieval_items`, `record_retrieval_attempt`

Write tools are audited; long response text is truncated in audit metadata.

**App integration:** When `EXPO_PUBLIC_MICROLEARN_API_BASE_URL` is set, the Retrieve tab fetches server due counts and summary without blocking UI. Start opens `/retrieve-session` for server items or `/review` for local-only due items. Lesson completion best-effort calls `POST /api/retrieval/items/seed` when a generated lesson id exists on the server.

**Local fallback:** If the server is unset or unreachable, only local SRS via `ReviewContext` and `/review` is used — unchanged from earlier phases.

**Limitations:** Server seed requires the lesson in `generated_lessons`. Local-only AI lessons are not mirrored automatically. Gamification is single-user (local server); no leaderboards or shops.

## Gamification (Phase 6)

Rewards real learning behaviors: retrieval, consistency, completion, mastery, comeback, and roadmap progress. No fake coins, shops, or leaderboards.

**Tables:** `achievements`, `user_achievements`, `daily_activity`, `learning_streaks` (migration `0005_gamification`).

**REST**

```bash
GET  /api/profile/summary
GET  /api/achievements          # ?category=&unlockedOnly=
GET  /api/activity              # ?days=14
POST /api/activity              # { eventType, event }
```

**MCP tools**

Read: `get_gamification_summary`, `list_achievements`, `inspect_daily_activity`

Write: `record_activity_event` (requires `MICROLEARN_ENABLE_WRITE_TOOLS=true`)

**Achievement categories:** retrieval, consistency, roadmap, mastery, comeback, creation (16 seeded definitions).

**Integration:** Outcomes and retrieval attempts update daily activity and streaks automatically. App Profile merges server summary with local `ProgressContext` fallback.

## Environment variables

See [`.env.example`](./.env.example). No secrets are required.

- `MICROLEARN_TUNNEL_URL` — optional; keep a tunnel URL handy locally
  (git-ignored). Do not commit it.
- `MICROLEARN_REPO_ROOT` — optional absolute repo root for the MCP tools.
  Defaults to `process.cwd()` (run the server from the repo root).
- `MICROLEARN_ENABLE_WRITE_TOOLS` / `MICROLEARN_ENABLE_GIT_PUSH` — see above.
- `MICROLEARN_REQUIRE_AUTH` / `MICROLEARN_MCP_BEARER_TOKEN` / `MICROLEARN_API_BEARER_TOKEN` — optional local auth (Phase 7).
