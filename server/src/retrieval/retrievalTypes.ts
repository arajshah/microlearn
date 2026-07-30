export type RetrievalItemStatus = 'active' | 'suspended' | 'mastered' | 'deleted';
export type RetrievalRating = 'forgot' | 'partial' | 'remembered' | 'easy';

export interface RetrievalItemRow {
  id: string;
  review_set_id: string | null;
  roadmap_id: string | null;
  lesson_node_id: string | null;
  lesson_id: string | null;
  source_type: string;
  source_ref: string | null;
  item_type: string;
  prompt: string;
  answer: string | null;
  explanation: string | null;
  concept: string | null;
  difficulty: number | null;
  status: RetrievalItemStatus;
  due_at: string;
  last_reviewed_at: string | null;
  reps: number;
  lapses: number;
  ease: number;
  interval_days: number;
  choices_json: string | null;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewSetRow {
  id: string;
  lesson_id: string;
  roadmap_id: string | null;
  lesson_node_id: string | null;
  title: string;
  strategy: string;
  status: 'active' | 'deleted' | 'completed';
  due_at: string;
  created_at: string;
  updated_at: string;
  metadata_json: string | null;
}

export interface RetrievalSessionRow {
  id: string;
  roadmap_id: string | null;
  started_at: string;
  ended_at: string | null;
  total_items: number;
  remembered_count: number;
  partial_count: number;
  forgot_count: number;
  metadata_json: string | null;
}

export interface RetrievalAttemptRow {
  id: string;
  session_id: string | null;
  item_id: string;
  rating: RetrievalRating;
  response_text: string | null;
  correct: number | null;
  duration_ms: number | null;
  previous_due_at: string | null;
  next_due_at: string | null;
  created_at: string;
  metadata_json: string | null;
}

export interface ScheduleState {
  reps: number;
  lapses: number;
  ease: number;
  intervalDays: number;
  dueAt: string;
  lastReviewedAt: string | null;
  status: RetrievalItemStatus;
}
