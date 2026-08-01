import type { McpAuthContext, McpScope } from '../auth/mcpAuth';
import { TOOL_CATALOG } from './toolSchemas';

const READ_TOOL_NAMES: ReadonlySet<string> = new Set([
  'server_status',
  'list_capabilities',
  'get_project_info',
  'list_files',
  'read_file',
  'search_code',
  'git_status',
  'git_diff',
  'get_package_info',
  'run_typecheck',
  'run_tests',
  'run_allowed_command',
  'get_command_allowlist',
  'list_roadmaps',
  'get_roadmap',
  'validate_curriculum',
  'read_learning_outcomes',
  'list_audit_events',
  'get_audit_event',
  'list_backups',
  'get_progress_summary',
  'get_revision_targets',
  'suggest_lesson_revision',
  'control_system_status',
  'extract_document_source',
  'get_document_source',
  'list_document_sources',
  'get_due_retrieval_items',
  'get_retrieval_summary',
  'inspect_retrieval_schedule',
  'list_retrieval_attempts',
  'get_gamification_summary',
  'list_achievements',
  'inspect_daily_activity',
  'get_learning_state',
  'list_concept_mastery',
  'list_learning_events',
  'list_weaknesses',
  'recommend_next_learning_action',
  'list_remediation_queue',
]);

const WRITE_TOOL_NAMES: ReadonlySet<string> = new Set([
  'create_file',
  'apply_patch',
  'move_file',
  'delete_file',
  'restore_file',
  'create_branch',
  'stage_files',
  'create_commit',
  'push_branch',
  'restore_files',
  'create_roadmap',
  'update_roadmap',
  'create_unit',
  'update_unit',
  'delete_unit',
  'create_lesson_node',
  'update_lesson_node',
  'delete_lesson_node',
  'reorder_lesson_nodes',
  'create_lesson_blueprint',
  'update_lesson_blueprint',
  'create_lesson',
  'update_lesson',
  'publish_version',
  'rollback_version',
  'export_curriculum_backup',
  'export_sqlite_backup',
  'create_roadmap_from_source',
  'create_lesson_from_source',
  'seed_retrieval_items',
  'record_retrieval_attempt',
  'record_activity_event',
  'create_diagnostic_for_roadmap',
  'create_remediation_lesson',
  'build_learning_snapshot',
]);

// Existing confirmation-protected actions plus direct repository/git mutation.
const DESTRUCTIVE_TOOL_NAMES: ReadonlySet<string> = new Set([
  'create_file',
  'apply_patch',
  'move_file',
  'delete_file',
  'restore_file',
  'create_branch',
  'stage_files',
  'create_commit',
  'push_branch',
  'restore_files',
  'delete_unit',
  'delete_lesson_node',
  'publish_version',
  'rollback_version',
  'export_sqlite_backup',
  'create_roadmap_from_source',
  'create_lesson_from_source',
  'create_diagnostic_for_roadmap',
  'create_remediation_lesson',
]);

const catalogNames = new Set(TOOL_CATALOG.map((tool) => tool.name));
for (const toolName of [...READ_TOOL_NAMES, ...WRITE_TOOL_NAMES]) {
  if (!catalogNames.has(toolName)) throw new Error(`MCP scope policy references unknown tool: ${toolName}`);
}
for (const toolName of catalogNames) {
  if (!READ_TOOL_NAMES.has(toolName) && !WRITE_TOOL_NAMES.has(toolName)) {
    throw new Error(`MCP tool is missing an explicit scope policy: ${toolName}`);
  }
}
for (const toolName of DESTRUCTIVE_TOOL_NAMES) {
  if (!WRITE_TOOL_NAMES.has(toolName)) {
    throw new Error(`Destructive MCP tool is not classified as a write tool: ${toolName}`);
  }
}

export const MCP_TOOL_POLICY_COUNTS = Object.freeze({
  read: READ_TOOL_NAMES.size,
  write: WRITE_TOOL_NAMES.size,
  destructive: DESTRUCTIVE_TOOL_NAMES.size,
});

export function requiredScopesForTool(toolName: string): McpScope[] {
  if (DESTRUCTIVE_TOOL_NAMES.has(toolName)) {
    return ['microlearn:write', 'microlearn:destructive'];
  }
  if (WRITE_TOOL_NAMES.has(toolName)) return ['microlearn:write'];
  if (READ_TOOL_NAMES.has(toolName)) return ['microlearn:read'];
  return ['microlearn:write', 'microlearn:destructive'];
}

export function missingMcpScopes(
  auth: McpAuthContext,
  required: readonly McpScope[],
): McpScope[] {
  const granted = new Set(auth.scopes);
  return required.filter((scope) => !granted.has(scope));
}

interface JsonRpcRequest {
  id?: unknown;
  method?: unknown;
  params?: { name?: unknown };
}

export interface McpScopeRequirement {
  id: unknown;
  requiredScopes: McpScope[];
}

/** Determines the strongest scope set required by one MCP HTTP payload. */
export function requiredScopesForMcpRequest(body: unknown): McpScopeRequirement | null {
  const requests = (Array.isArray(body) ? body : [body]) as JsonRpcRequest[];
  const required = new Set<McpScope>();
  let requestId: unknown = null;

  for (const request of requests) {
    if (!request || typeof request !== 'object') continue;
    if (request.id !== undefined) requestId = request.id;
    if (request.method === 'tools/list') required.add('microlearn:read');
    if (request.method === 'tools/call') {
      const toolName = typeof request.params?.name === 'string' ? request.params.name : '';
      for (const scope of requiredScopesForTool(toolName)) required.add(scope);
    }
  }

  return required.size ? { id: requestId, requiredScopes: [...required] } : null;
}
