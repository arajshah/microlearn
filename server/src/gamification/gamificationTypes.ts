export type AchievementCategory =
  | 'retrieval'
  | 'consistency'
  | 'roadmap'
  | 'mastery'
  | 'comeback'
  | 'creation';

export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'legendary';

export type ActivityEventType =
  | 'lesson_completed'
  | 'retrieval_completed'
  | 'roadmap_started'
  | 'roadmap_completed'
  | 'creation_completed';

export type StreakType = 'study' | 'retrieval';

export interface AchievementCriteria {
  metric: string;
  min?: number;
}

export interface AchievementDefinition {
  key: string;
  title: string;
  description: string;
  category: AchievementCategory;
  tier: AchievementTier;
  icon?: string;
  accent?: string;
  criteria: AchievementCriteria;
}

export interface AchievementRow {
  id: string;
  key: string;
  title: string;
  description: string;
  category: string;
  tier: string;
  icon: string | null;
  accent: string | null;
  criteria_json: string;
  created_at: string;
  updated_at: string;
}

export interface UserAchievementRow {
  id: string;
  achievement_id: string;
  unlocked_at: string;
  progress_value: number;
  metadata_json: string | null;
}

export interface DailyActivityRow {
  id: string;
  day: string;
  lessons_completed: number;
  retrieval_items_reviewed: number;
  retrieval_remembered: number;
  retrieval_partial: number;
  retrieval_forgot: number;
  xp_earned: number;
  active_minutes: number;
  roadmap_progress_events: number;
  created_at: string;
  updated_at: string;
}

export interface LearningStreakRow {
  id: string;
  streak_type: string;
  current_count: number;
  best_count: number;
  last_active_day: string | null;
  updated_at: string;
}
