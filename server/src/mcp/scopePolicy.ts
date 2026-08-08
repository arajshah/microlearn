import type { McpAuthContext, McpScope } from '../auth/mcpAuth';
import type { AutomationCapability } from '../automation/types';
import { TOOL_CATALOG } from './toolSchemas';

export type McpTargetResourceType =
  | 'none'
  | 'repository'
  | 'git'
  | 'server'
  | 'roadmap'
  | 'unit'
  | 'lesson'
  | 'review'
  | 'achievement'
  | 'diagnostic'
  | 'automation_grant'
  | 'automation_schedule'
  | 'reminder'
  | 'curriculum_steward';

export interface McpToolPolicy {
  requiredScopes: McpScope[];
  capability?: AutomationCapability | 'automation.manage';
  targetResourceType: McpTargetResourceType;
  trustedAutomationAllowed: boolean;
  exceptionalConfirmationRequired: boolean;
  auditCategory: string;
  mutation: boolean;
}

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
  'get_trusted_automation_status',
  'list_automation_schedules',
  'list_automation_reminders',
  'get_curriculum_steward_state',
  'get_curriculum_steward_charter',
  'get_curriculum_strategy',
  'get_recent_curriculum_steward_runs',
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
  'enable_trusted_automation',
  'update_trusted_automation',
  'pause_trusted_automation',
  'revoke_trusted_automation',
  'delete_roadmap',
  'recalculate_achievements',
  'create_automation_schedule',
  'update_automation_schedule',
  'pause_automation_schedule',
  'resume_automation_schedule',
  'delete_automation_schedule',
  'create_automation_reminder',
  'update_automation_reminder',
  'pause_automation_reminder',
  'resume_automation_reminder',
  'delete_automation_reminder',
  'update_curriculum_steward_charter',
  'update_curriculum_strategy',
  'begin_curriculum_steward_run',
  'complete_curriculum_steward_run',
  'fail_curriculum_steward_run',
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
  'enable_trusted_automation',
  'update_trusted_automation',
  'revoke_trusted_automation',
  'delete_roadmap',
  'delete_automation_schedule',
  'delete_automation_reminder',
]);

const REPO_MUTATIONS = new Set([
  'create_file', 'apply_patch', 'move_file', 'delete_file', 'restore_file',
]);
const GIT_MUTATIONS = new Set([
  'create_branch', 'stage_files', 'create_commit', 'push_branch', 'restore_files',
]);

const MUTATION_DETAILS: Record<string, Omit<McpToolPolicy, 'requiredScopes' | 'mutation'>> = {};

function classify(
  names: readonly string[],
  details: Omit<McpToolPolicy, 'requiredScopes' | 'mutation'>,
): void {
  for (const name of names) MUTATION_DETAILS[name] = details;
}

classify([...REPO_MUTATIONS], {
  targetResourceType: 'repository', trustedAutomationAllowed: false,
  exceptionalConfirmationRequired: true, auditCategory: 'repository',
});
classify([...GIT_MUTATIONS], {
  targetResourceType: 'git', trustedAutomationAllowed: false,
  exceptionalConfirmationRequired: true, auditCategory: 'git',
});
classify(['create_roadmap', 'update_roadmap'], {
  capability: 'roadmap.write', targetResourceType: 'roadmap', trustedAutomationAllowed: true,
  exceptionalConfirmationRequired: false, auditCategory: 'curriculum',
});
classify(['publish_version', 'rollback_version'], {
  capability: 'roadmap.publish', targetResourceType: 'roadmap', trustedAutomationAllowed: true,
  exceptionalConfirmationRequired: false, auditCategory: 'publication',
});
classify(['delete_roadmap'], {
  capability: 'roadmap.delete', targetResourceType: 'roadmap', trustedAutomationAllowed: true,
  exceptionalConfirmationRequired: true, auditCategory: 'roadmap_deletion',
});
classify(['create_unit', 'update_unit', 'create_lesson_node', 'update_lesson_node', 'reorder_lesson_nodes'], {
  capability: 'lesson.write', targetResourceType: 'lesson', trustedAutomationAllowed: true,
  exceptionalConfirmationRequired: false, auditCategory: 'curriculum',
});
classify(['delete_unit', 'delete_lesson_node'], {
  capability: 'lesson.delete', targetResourceType: 'lesson', trustedAutomationAllowed: true,
  exceptionalConfirmationRequired: false, auditCategory: 'curriculum_deletion',
});
classify(['create_lesson_blueprint', 'update_lesson_blueprint', 'create_lesson', 'update_lesson', 'create_lesson_from_source'], {
  capability: 'lesson.generate', targetResourceType: 'lesson', trustedAutomationAllowed: true,
  exceptionalConfirmationRequired: false, auditCategory: 'lesson_generation',
});
classify(['create_roadmap_from_source'], {
  capability: 'roadmap.write', targetResourceType: 'roadmap', trustedAutomationAllowed: true,
  exceptionalConfirmationRequired: false, auditCategory: 'curriculum',
});
classify(['seed_retrieval_items', 'record_retrieval_attempt', 'create_remediation_lesson'], {
  capability: 'review.write', targetResourceType: 'review', trustedAutomationAllowed: true,
  exceptionalConfirmationRequired: false, auditCategory: 'review',
});
classify(['record_activity_event', 'recalculate_achievements'], {
  capability: 'achievement.recalculate', targetResourceType: 'achievement', trustedAutomationAllowed: true,
  exceptionalConfirmationRequired: false, auditCategory: 'achievement',
});
classify(['create_diagnostic_for_roadmap', 'build_learning_snapshot'], {
  capability: 'diagnostic.repair', targetResourceType: 'diagnostic', trustedAutomationAllowed: true,
  exceptionalConfirmationRequired: false, auditCategory: 'diagnostic',
});
classify(['enable_trusted_automation', 'update_trusted_automation', 'pause_trusted_automation', 'revoke_trusted_automation'], {
  capability: 'automation.manage', targetResourceType: 'automation_grant', trustedAutomationAllowed: false,
  exceptionalConfirmationRequired: true, auditCategory: 'automation_grant',
});
classify(['create_automation_schedule', 'update_automation_schedule', 'pause_automation_schedule', 'resume_automation_schedule', 'delete_automation_schedule'], {
  capability: 'schedule.write', targetResourceType: 'automation_schedule', trustedAutomationAllowed: true,
  exceptionalConfirmationRequired: false, auditCategory: 'automation_schedule',
});
classify(['create_automation_reminder', 'update_automation_reminder', 'pause_automation_reminder', 'resume_automation_reminder', 'delete_automation_reminder'], {
  capability: 'reminder.write', targetResourceType: 'reminder', trustedAutomationAllowed: true,
  exceptionalConfirmationRequired: false, auditCategory: 'reminder',
});
classify([
  'update_curriculum_steward_charter',
  'update_curriculum_strategy',
  'begin_curriculum_steward_run',
  'complete_curriculum_steward_run',
  'fail_curriculum_steward_run',
], {
  capability: 'roadmap.write', targetResourceType: 'curriculum_steward', trustedAutomationAllowed: true,
  exceptionalConfirmationRequired: false, auditCategory: 'curriculum_steward',
});
classify(['export_curriculum_backup', 'export_sqlite_backup'], {
  targetResourceType: 'server', trustedAutomationAllowed: false,
  exceptionalConfirmationRequired: true, auditCategory: 'backup',
});

export const MCP_TOOL_POLICIES: Readonly<Record<string, McpToolPolicy>> = Object.freeze(
  Object.fromEntries(TOOL_CATALOG.map(({ name }) => {
    if (READ_TOOL_NAMES.has(name)) {
      return [name, {
        requiredScopes: ['microlearn:read'], targetResourceType: 'none',
        trustedAutomationAllowed: false, exceptionalConfirmationRequired: false,
        auditCategory: 'read', mutation: false,
      } satisfies McpToolPolicy];
    }
    const details = MUTATION_DETAILS[name];
    if (!details) throw new Error(`MCP mutation is missing centralized policy details: ${name}`);
    return [name, {
      ...details,
      requiredScopes: DESTRUCTIVE_TOOL_NAMES.has(name)
        ? ['microlearn:write', 'microlearn:destructive']
        : ['microlearn:write'],
      mutation: true,
    } satisfies McpToolPolicy];
  })),
);

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
  return MCP_TOOL_POLICIES[toolName]?.requiredScopes ?? ['microlearn:write', 'microlearn:destructive'];
}

export function policyForTool(toolName: string): McpToolPolicy {
  const policy = MCP_TOOL_POLICIES[toolName];
  if (!policy) throw new Error(`MCP tool is missing an explicit authorization policy: ${toolName}`);
  return policy;
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
