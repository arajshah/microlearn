export type LearningEventType =
  | 'lesson_started'
  | 'card_viewed'
  | 'card_answered'
  | 'card_revealed'
  | 'lesson_completed'
  | 'review_attempted'
  | 'diagnostic_started'
  | 'diagnostic_answered'
  | 'diagnostic_completed'
  | 'remediation_recommended'
  | 'remediation_generated'
  | 'confidence_reported';

export const LEARNING_EVENT_TYPES: readonly LearningEventType[] = [
  'lesson_started',
  'card_viewed',
  'card_answered',
  'card_revealed',
  'lesson_completed',
  'review_attempted',
  'diagnostic_started',
  'diagnostic_answered',
  'diagnostic_completed',
  'remediation_recommended',
  'remediation_generated',
  'confidence_reported',
];

export type MasteryTrend = 'improving' | 'declining' | 'stable' | 'unknown';

export type WeaknessStatus = 'active' | 'resolved' | 'ignored';

export type RemediationStatus = 'open' | 'generated' | 'dismissed' | 'resolved';

export type SnapshotType = 'daily' | 'weekly' | 'roadmap' | 'current_state';

export interface LearningEventInput {
  eventType: LearningEventType;
  timestamp?: string;
  roadmapId?: string;
  lessonNodeId?: string;
  lessonId?: string;
  cardId?: string;
  conceptSlug?: string;
  /** Convenience: fans out into one event per concept when conceptSlug is absent. */
  conceptTags?: string[];
  skillTag?: string;
  weaknessTags?: string[];
  cardType?: string;
  correct?: boolean;
  selectedAnswer?: unknown;
  expectedAnswer?: unknown;
  responseTimeMs?: number;
  confidence?: number;
  difficultyRating?: number;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface LearningEventRow {
  id: string;
  event_type: string;
  timestamp: string;
  roadmap_id: string | null;
  lesson_node_id: string | null;
  lesson_id: string | null;
  card_id: string | null;
  concept_slug: string | null;
  skill_tag: string | null;
  correct: number | null;
  selected_answer_json: string | null;
  expected_answer_json: string | null;
  response_time_ms: number | null;
  confidence: number | null;
  difficulty_rating: number | null;
  source: string | null;
  metadata_json: string | null;
}

export interface LearningEvent {
  id: string;
  eventType: string;
  timestamp: string;
  roadmapId?: string;
  lessonNodeId?: string;
  lessonId?: string;
  cardId?: string;
  conceptSlug?: string;
  skillTag?: string;
  correct?: boolean;
  responseTimeMs?: number;
  confidence?: number;
  difficultyRating?: number;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface ConceptMasteryRow {
  concept_slug: string;
  name: string | null;
  subject_id: string | null;
  topic: string | null;
  mastery_score: number;
  confidence_score: number;
  exposure_count: number;
  correct_count: number;
  incorrect_count: number;
  streak_correct: number;
  last_seen_at: string | null;
  next_review_at: string | null;
  trend: string | null;
  evidence_json: string | null;
  updated_at: string;
}

export interface ConceptMastery {
  conceptSlug: string;
  name?: string;
  subjectId?: string;
  topic?: string;
  masteryScore: number;
  confidenceScore: number;
  exposureCount: number;
  correctCount: number;
  incorrectCount: number;
  streakCorrect: number;
  lastSeenAt?: string;
  nextReviewAt?: string;
  trend: MasteryTrend;
  updatedAt: string;
}

export interface WeaknessRow {
  id: string;
  concept_slug: string;
  weakness_tag: string;
  severity: number;
  status: string;
  evidence_event_ids_json: string | null;
  evidence_summary: string | null;
  recommended_action: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface Weakness {
  id: string;
  conceptSlug: string;
  weaknessTag: string;
  severity: number;
  status: WeaknessStatus;
  evidenceEventIds: string[];
  evidenceSummary?: string;
  recommendedAction?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

export interface RemediationRow {
  id: string;
  concept_slug: string;
  roadmap_id: string | null;
  lesson_node_id: string | null;
  severity: number;
  reason: string;
  status: string;
  suggested_lesson_title: string | null;
  generated_lesson_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RemediationItem {
  id: string;
  conceptSlug: string;
  roadmapId?: string;
  lessonNodeId?: string;
  severity: number;
  reason: string;
  status: RemediationStatus;
  suggestedLessonTitle?: string;
  generatedLessonId?: string;
  createdAt: string;
  updatedAt: string;
}

export type NextActionKind =
  | 'continue_lesson'
  | 'review_due_concepts'
  | 'generate_remediation'
  | 'run_diagnostic'
  | 'start_new_roadmap';

export interface NextAction {
  action: NextActionKind;
  reason: string;
  evidence: Record<string, unknown>;
  roadmapId?: string;
  lessonNodeId?: string;
  conceptSlug?: string;
}
