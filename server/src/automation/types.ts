export const AUTOMATION_CAPABILITIES = [
  'roadmap.write',
  'roadmap.publish',
  'roadmap.delete',
  'lesson.write',
  'lesson.delete',
  'lesson.generate',
  'review.read',
  'review.write',
  'achievement.read',
  'achievement.recalculate',
  'achievement.manage',
  'achievement.definitions',
  'reminder.write',
  'schedule.write',
  'diagnostic.read',
  'diagnostic.repair',
] as const;

export type AutomationCapability = (typeof AUTOMATION_CAPABILITIES)[number];
export type AutomationGrantStatus = 'active' | 'paused' | 'revoked' | 'circuit-broken';
export type CircuitBreakerState = 'closed' | 'open';

export interface ExecutionWindow {
  days?: number[];
  start: string;
  end: string;
}

export interface TrustedAutomationGrant {
  id: string;
  userId: string;
  oauthClientId?: string;
  status: AutomationGrantStatus;
  capabilities: AutomationCapability[];
  roadmapIds?: string[];
  dailyOperationLimit?: number;
  dailyOperationCount: number;
  executionWindows?: ExecutionWindow[];
  timezone: string;
  expiresAt?: string;
  failureCount: number;
  circuitBreaker: {
    state: CircuitBreakerState;
    reason?: string;
  };
  allowWholeRoadmapDelete: boolean;
  allowBadgeDefinitionChanges: boolean;
  auditMetadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
}

export const AUTOMATION_JOB_TYPES = [
  'learning_snapshot',
  'achievement_recalculate',
  'review_lesson',
  'roadmap_health_check',
] as const;

export type AutomationJobType = (typeof AUTOMATION_JOB_TYPES)[number];
export type ScheduleType = 'once' | 'interval' | 'daily';

export interface AutomationScheduleSpec {
  type: ScheduleType;
  at?: string;
  intervalMinutes?: number;
  timeOfDay?: string;
}

export type ReminderChannel = 'in_app' | 'local' | 'push';
