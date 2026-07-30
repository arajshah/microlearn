import type {
  AchievementRow,
  DailyActivityRow,
  LearningStreakRow,
  UserAchievementRow,
} from './gamificationTypes';

export interface SerializedAchievement {
  id: string;
  key: string;
  title: string;
  description: string;
  category: string;
  tier: string;
  icon?: string;
  accent?: string;
  unlocked: boolean;
  unlockedAt?: string;
  progressValue?: number;
}

export interface SerializedDailyActivity {
  day: string;
  lessonsCompleted: number;
  retrievalItemsReviewed: number;
  retrievalRemembered: number;
  retrievalPartial: number;
  retrievalForgot: number;
  xpEarned: number;
  activeMinutes: number;
  roadmapProgressEvents: number;
}

export interface SerializedStreak {
  current: number;
  best: number;
  lastActiveDay?: string;
}

export interface SerializedProfileSummary {
  xp: number;
  streaks: {
    study: SerializedStreak;
    retrieval: SerializedStreak;
  };
  achievements: {
    unlockedCount: number;
    totalCount: number;
    recent: SerializedAchievement[];
  };
  retrieval: {
    reviewedCount: number;
    masteredCount: number;
    dueCount: number;
    rememberedRate?: number;
  };
  roadmaps: {
    activeCount: number;
    completedCount: number;
  };
  activity: {
    today: SerializedDailyActivity;
    last7Days: SerializedDailyActivity[];
  };
}

function parseCriteria(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function serializeAchievement(
  row: AchievementRow,
  userRow?: UserAchievementRow,
): SerializedAchievement {
  return {
    id: row.id,
    key: row.key,
    title: row.title,
    description: row.description,
    category: row.category,
    tier: row.tier,
    icon: row.icon ?? undefined,
    accent: row.accent ?? undefined,
    unlocked: Boolean(userRow),
    unlockedAt: userRow?.unlocked_at,
    progressValue: userRow?.progress_value,
  };
}

export function serializeDailyActivity(row: DailyActivityRow): SerializedDailyActivity {
  return {
    day: row.day,
    lessonsCompleted: row.lessons_completed,
    retrievalItemsReviewed: row.retrieval_items_reviewed,
    retrievalRemembered: row.retrieval_remembered,
    retrievalPartial: row.retrieval_partial,
    retrievalForgot: row.retrieval_forgot,
    xpEarned: row.xp_earned,
    activeMinutes: row.active_minutes,
    roadmapProgressEvents: row.roadmap_progress_events,
  };
}

export function emptyDailyActivity(day: string): SerializedDailyActivity {
  return {
    day,
    lessonsCompleted: 0,
    retrievalItemsReviewed: 0,
    retrievalRemembered: 0,
    retrievalPartial: 0,
    retrievalForgot: 0,
    xpEarned: 0,
    activeMinutes: 0,
    roadmapProgressEvents: 0,
  };
}

export function serializeStreak(row: LearningStreakRow | undefined): SerializedStreak {
  if (!row) return { current: 0, best: 0 };
  return {
    current: row.current_count,
    best: row.best_count,
    lastActiveDay: row.last_active_day ?? undefined,
  };
}

export { parseCriteria };
