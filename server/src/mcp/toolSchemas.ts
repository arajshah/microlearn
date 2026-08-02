import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ToolError } from './repoSafety';
import { ApiError } from '../api/apiError';

/** Concise catalog of the tools this MCP server exposes (read-only). */
export const TOOL_CATALOG: ReadonlyArray<{ name: string; description: string }> = [
  { name: 'server_status', description: 'Server service name, time, environment, database health, repo root, and tool count.' },
  { name: 'list_capabilities', description: 'Lists the available MCP tools and what each one does.' },
  { name: 'get_project_info', description: 'High-level project info: package name/version, package manager, scripts, dependency summary, Expo/RN indicators, server folder status, git branch.' },
  { name: 'list_files', description: 'Lists files under the repo root (optionally recursive), skipping heavy/generated/sensitive paths. Returns relative paths.' },
  { name: 'read_file', description: 'Reads a text file inside the repo, with a size limit. Blocks sensitive and binary files.' },
  { name: 'search_code', description: 'Searches text files in the repo for a query string. Returns relative path, line number, and the matching line.' },
  { name: 'git_status', description: 'Read-only git status: current branch, clean flag, changed/staged/untracked files.' },
  { name: 'git_diff', description: 'Read-only git diff (optionally staged), size-limited.' },
  { name: 'get_package_info', description: 'Parsed package.json: name, scripts, dependencies, devDependencies, and key framework versions.' },
  // Write tools (Part A) — require MICROLEARN_ENABLE_WRITE_TOOLS=true.
  { name: 'create_file', description: 'Create a text file in the repo (write tool). Rejects sensitive/binary/outside paths.' },
  { name: 'apply_patch', description: 'Apply a unified diff via git apply (write tool). Supports checkOnly validation.' },
  { name: 'move_file', description: 'Move/rename a file within the repo (write tool).' },
  { name: 'delete_file', description: 'Delete a repo file (write tool). Requires confirmation string.' },
  { name: 'restore_file', description: 'Restore one file from git (write tool). Requires confirmation string.' },
  { name: 'run_typecheck', description: 'Run app/server/both typecheck and return exit code, output, duration.' },
  { name: 'run_tests', description: 'Run the safest available test script, or report NO_TEST_SCRIPT.' },
  { name: 'run_allowed_command', description: 'Run an allowlisted command via execFile (no shell).' },
  { name: 'get_command_allowlist', description: 'Return the allowed command list for run_allowed_command.' },
  // Git write tools (Part B) — require MICROLEARN_ENABLE_WRITE_TOOLS=true (push also requires MICROLEARN_ENABLE_GIT_PUSH=true).
  { name: 'create_branch', description: 'Create a git branch (write tool), optional checkout.' },
  { name: 'stage_files', description: 'Stage specified safe paths (write tool).' },
  { name: 'create_commit', description: 'Commit staged changes with a message (write tool). Never pushes.' },
  { name: 'push_branch', description: 'Push current branch (write tool). Disabled unless git push flag + confirmation.' },
  { name: 'restore_files', description: 'Restore specified files from git (write tool). Requires confirmation string.' },
  // Curriculum read tools (Phase 6) — always available.
  { name: 'list_roadmaps', description: 'List roadmap summaries (excludes deleted by default; optional counts).' },
  { name: 'get_roadmap', description: 'Get a roadmap with nested units/nodes; optional blueprints/lessons/outcomes/versions.' },
  { name: 'validate_curriculum', description: 'Validate roadmap structure/prerequisites; returns errors, warnings, stats.' },
  { name: 'read_learning_outcomes', description: 'Return stored lesson outcomes (default limit 20).' },
  // Curriculum mutation tools (Phase 6) — require MICROLEARN_ENABLE_WRITE_TOOLS=true.
  { name: 'create_roadmap', description: 'Create a validated, versioned draft roadmap with units and nodes.' },
  { name: 'update_roadmap', description: 'Update roadmap metadata/status (publish validates first).' },
  { name: 'create_unit', description: 'Add a unit to a draft/archived roadmap.' },
  { name: 'update_unit', description: 'Update unit fields; re-normalizes ordering.' },
  { name: 'delete_unit', description: 'Delete an empty unit (confirmation required).' },
  { name: 'create_lesson_node', description: 'Add a lesson node; validates prerequisites and initial status.' },
  { name: 'update_lesson_node', description: 'Update a lesson node; rejects cycles/forward prerequisites.' },
  { name: 'delete_lesson_node', description: 'Delete a lesson node with no dependents (confirmation required).' },
  { name: 'reorder_lesson_nodes', description: 'Reorder lesson nodes; validates prerequisites.' },
  { name: 'create_lesson_blueprint', description: 'Store a versioned lesson blueprint for a node.' },
  { name: 'update_lesson_blueprint', description: 'Store a new blueprint version (non-destructive).' },
  { name: 'create_lesson', description: 'Store a generated lesson version and link it to the node.' },
  { name: 'update_lesson', description: 'Store a new generated lesson version and re-link the node.' },
  { name: 'publish_version', description: 'Validate then publish a roadmap (confirmation required).' },
  { name: 'rollback_version', description: 'Restore a roadmap from a roadmap-level snapshot (confirmation required).' },
  // Phase 7: audit, backup, progress, control
  { name: 'list_audit_events', description: 'List MCP write/publish audit events (default limit 50).' },
  { name: 'get_audit_event', description: 'Return one audit event with before/after snapshots and metadata.' },
  { name: 'export_curriculum_backup', description: 'Export curriculum tables to timestamped JSON under server/backups/.' },
  { name: 'export_sqlite_backup', description: 'Copy SQLite database to server/backups/ (confirmation required).' },
  { name: 'list_backups', description: 'List backup files under server/backups/.' },
  { name: 'get_progress_summary', description: 'Summarize stored lesson outcomes (no fabricated analytics).' },
  { name: 'get_revision_targets', description: 'Identify lesson nodes needing revision from stored outcomes.' },
  { name: 'suggest_lesson_revision', description: 'Read-only structured revision suggestions from lesson context and outcomes.' },
  { name: 'control_system_status', description: 'Full control-system status report (health, counts, flags, audit, backups). No secrets.' },
  // Phase 4: document source extraction
  { name: 'extract_document_source', description: 'Fetch and extract text from a public document URL (PDF, text, markdown, HTML).' },
  { name: 'get_document_source', description: 'Return one source document with optional full extracted text.' },
  { name: 'list_document_sources', description: 'List recent extracted source documents.' },
  { name: 'create_roadmap_from_source', description: 'Create a validated draft roadmap from a ready source document (write tool).' },
  { name: 'create_lesson_from_source', description: 'Create a backend-generated lesson from a ready source document (write tool).' },
  // Phase 5: retrieval engine
  { name: 'get_due_retrieval_items', description: 'List active retrieval items that are due now.' },
  { name: 'get_retrieval_summary', description: 'Summarize retrieval counts, weak concepts, and recent attempts.' },
  { name: 'inspect_retrieval_schedule', description: 'Return one retrieval item schedule and recent attempts.' },
  { name: 'list_retrieval_attempts', description: 'List recent retrieval attempts, optionally filtered.' },
  { name: 'seed_retrieval_items', description: 'Create retrieval items from a generated lesson (write tool).' },
  { name: 'record_retrieval_attempt', description: 'Record a retrieval rating and update item schedule (write tool).' },
  // Phase 6: gamification
  { name: 'get_gamification_summary', description: 'Profile summary: XP, streaks, achievements, retrieval, activity.' },
  { name: 'list_achievements', description: 'List achievements with unlocked status.' },
  { name: 'inspect_daily_activity', description: 'Return recent daily activity rows.' },
  { name: 'record_activity_event', description: 'Record a learning activity event (write tool).' },
  // Adaptive Learning v1: concept mastery, telemetry, weaknesses, diagnostics, remediation.
  { name: 'get_learning_state', description: 'Compact learning state: mastery, recent activity, weaknesses, due reviews, remediation, next action.' },
  { name: 'list_concept_mastery', description: 'Concept mastery scores sorted by weakest/strongest/recent/due.' },
  { name: 'list_learning_events', description: 'Filtered granular learning event log (newest first).' },
  { name: 'list_weaknesses', description: 'Weakness observations with severity and evidence event ids.' },
  { name: 'recommend_next_learning_action', description: 'Ranked next learning action with reason and evidence.' },
  { name: 'create_diagnostic_for_roadmap', description: 'Create a diagnostic session from roadmap nodes (confirmation required).' },
  { name: 'create_remediation_lesson', description: 'Queue a remediation item for a weak concept (confirmation required).' },
  { name: 'build_learning_snapshot', description: 'Build and store a compact learning snapshot (current_state/daily/roadmap).' },
  { name: 'list_remediation_queue', description: 'List remediation queue items ordered by severity.' },
  // Trusted Automation: application-data authority only. Never covers repository, Git, shell, or infrastructure operations.
  { name: 'enable_trusted_automation', description: 'Create a persistent Trusted Automation grant after structured confirmation.' },
  { name: 'get_trusted_automation_status', description: 'Return the current client-bound Trusted Automation grant and circuit-breaker status.' },
  { name: 'update_trusted_automation', description: 'Update grant limits, windows, roadmap restrictions, or capabilities.' },
  { name: 'pause_trusted_automation', description: 'Pause the current Trusted Automation grant.' },
  { name: 'revoke_trusted_automation', description: 'Permanently revoke the current Trusted Automation grant.' },
  { name: 'delete_roadmap', description: 'Transactionally soft-delete a roadmap and pause dependent automation.' },
  { name: 'recalculate_achievements', description: 'Recalculate earned achievement records from stored application evidence.' },
  { name: 'list_automation_schedules', description: 'List persistent automation schedules for the authenticated user.' },
  { name: 'create_automation_schedule', description: 'Create an idempotent persistent Microlearn automation schedule.' },
  { name: 'update_automation_schedule', description: 'Update an existing automation schedule.' },
  { name: 'pause_automation_schedule', description: 'Pause an automation schedule.' },
  { name: 'resume_automation_schedule', description: 'Resume an automation schedule and calculate its next run.' },
  { name: 'delete_automation_schedule', description: 'Delete an automation schedule after structured confirmation.' },
  { name: 'list_automation_reminders', description: 'List persistent in-app, local, or push reminder records.' },
  { name: 'create_automation_reminder', description: 'Create a persistent Microlearn reminder.' },
  { name: 'update_automation_reminder', description: 'Update a persistent Microlearn reminder.' },
  { name: 'pause_automation_reminder', description: 'Pause a reminder.' },
  { name: 'resume_automation_reminder', description: 'Resume a reminder.' },
  { name: 'delete_automation_reminder', description: 'Delete a reminder after structured confirmation.' },
];

export const TOOL_COUNT = TOOL_CATALOG.length;

// ---- Input schemas (zod raw shapes) ----

export const listFilesInput = {
  directory: z.string().optional().describe('Repo-relative directory to list. Defaults to repo root.'),
  recursive: z.boolean().optional().describe('Recurse into subdirectories. Default false.'),
  maxResults: z.number().int().positive().max(2000).optional().describe('Maximum entries to return. Default 500.'),
};

export const readFileInput = {
  path: z.string().describe('Repo-relative path to a text file.'),
  maxBytes: z.number().int().positive().max(1_000_000).optional().describe('Maximum bytes to read. Default 200000.'),
};

export const searchCodeInput = {
  query: z.string().min(1).describe('Text to search for.'),
  directory: z.string().optional().describe('Repo-relative directory to search under. Defaults to repo root.'),
  maxResults: z.number().int().positive().max(500).optional().describe('Maximum matches to return. Default 100.'),
  caseSensitive: z.boolean().optional().describe('Case-sensitive match. Default false.'),
};

export const gitDiffInput = {
  staged: z.boolean().optional().describe('Return the staged diff instead of the working-tree diff.'),
  maxBytes: z.number().int().positive().max(2_000_000).optional().describe('Maximum diff bytes to return. Default 200000.'),
};

// ---- Write tool input schemas (Part A) ----

export const createFileInput = {
  path: z.string().min(1).describe('Repo-relative path of the new file.'),
  content: z.string().describe('Text content to write.'),
  overwrite: z.boolean().optional().describe('Overwrite if the file already exists. Default false.'),
};

export const applyPatchInput = {
  patch: z.string().min(1).describe('A unified diff (git apply compatible).'),
  checkOnly: z.boolean().optional().describe('Only validate the patch (git apply --check). Default false.'),
};

export const moveFileInput = {
  from: z.string().min(1).describe('Repo-relative source path.'),
  to: z.string().min(1).describe('Repo-relative destination path.'),
  overwrite: z.boolean().optional().describe('Overwrite destination if it exists. Default false.'),
};

export const deleteFileInput = {
  path: z.string().min(1).describe('Repo-relative file path to delete.'),
  confirm: z.string().describe('Must be exactly "delete Microlearn file".'),
};

export const restoreFileInput = {
  path: z.string().min(1).describe('Repo-relative file path to restore from git.'),
  confirm: z.string().describe('Must be exactly "restore Microlearn file".'),
};

export const runTypecheckInput = {
  target: z.enum(['app', 'server', 'both']).optional().describe('Which typecheck to run. Default both.'),
};

export const runTestsInput = {
  target: z.enum(['app', 'server', 'all']).optional().describe('Which tests to run. Default all.'),
};

export const runAllowedCommandInput = {
  command: z.string().min(1).describe('Command binary, e.g. "npm", "npx", or "git".'),
  args: z.array(z.string()).optional().describe('Command arguments; must match an allowlisted invocation.'),
};

// ---- Git write tool input schemas (Part B) ----

export const createBranchInput = {
  name: z.string().min(1).describe('New branch name.'),
  checkout: z.boolean().optional().describe('Checkout the branch after creating it. Default false.'),
};

export const stageFilesInput = {
  paths: z.array(z.string().min(1)).min(1).describe('Repo-relative paths to stage.'),
};

export const createCommitInput = {
  message: z.string().min(1).describe('Commit message (non-empty, meaningful).'),
};

export const pushBranchInput = {
  remote: z.string().optional().describe('Remote name. Default "origin".'),
  branch: z.string().optional().describe('Branch to push. Default current branch.'),
  confirm: z.string().describe('Must be exactly "push Microlearn branch".'),
};

export const restoreFilesInput = {
  paths: z.array(z.string().min(1)).min(1).describe('Repo-relative paths to restore from git.'),
  confirm: z.string().describe('Must be exactly "restore Microlearn files".'),
};

// ---- Result helpers ----

/** Wraps successful structured data as a text CallToolResult (JSON). */
export function toolOk(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

/** Wraps an error as a structured, non-throwing CallToolResult. */
export function toolFail(code: string, message: string): CallToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify({ error: { code, message } }, null, 2) }],
  };
}

/** Runs a tool handler and converts thrown errors into structured tool errors. */
export async function runTool(handler: () => Promise<unknown> | unknown): Promise<CallToolResult> {
  try {
    return toolOk(await handler());
  } catch (err) {
    if (err instanceof ToolError) return toolFail(err.code, err.message);
    if (err instanceof ApiError) return toolFail(err.code ?? 'INVALID_INPUT', err.message);
    const message = err instanceof Error ? err.message : 'Unexpected tool error.';
    return toolFail('INVALID_INPUT', message);
  }
}
