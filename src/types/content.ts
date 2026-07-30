export type SubjectId =
  | 'economics'
  | 'philosophy'
  | 'literature'
  | 'computer-science'
  | 'history'
  | 'psychology'
  | 'mathematics';

export type DifficultyTrack = 'beginner' | 'intermediate' | 'advanced';

export type CognitiveLevel = 'recall' | 'understand' | 'apply' | 'analyze' | 'synthesize';

export type EstimatedDifficulty = 1 | 2 | 3 | 4 | 5;

/**
 * Optional stable id plus adaptive-learning metadata for lesson cards.
 * All fields are optional so lessons generated before Adaptive Learning v1 stay valid.
 */
export interface CardIdentity {
  id?: string;
  conceptTags?: string[];
  skillTags?: string[];
  weaknessTags?: string[];
  cognitiveLevel?: CognitiveLevel;
  estimatedDifficulty?: EstimatedDifficulty;
}

export interface ConceptCard extends CardIdentity {
  type: 'concept';
  title: string;
  body: string;
  keyTerm?: string;
  keyTermDef?: string;
  emoji?: string;
}

export interface QuoteCard extends CardIdentity {
  type: 'quote';
  text: string;
  author: string;
}

export interface QuizCard extends CardIdentity {
  type: 'quiz';
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

export interface TrueFalseCard extends CardIdentity {
  type: 'truefalse';
  statement: string;
  answer: boolean;
  explanation: string;
}

/** Sentence with a blank (use "___") and multiple-choice fill-in. */
export interface FillBlankCard extends CardIdentity {
  type: 'fillblank';
  sentence: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

/** Match each left term to its right definition. */
export interface MatchingCard extends CardIdentity {
  type: 'matching';
  prompt: string;
  pairs: { left: string; right: string }[];
  explanation: string;
}

/** Put items in the correct order (items array is the correct order). */
export interface OrderingCard extends CardIdentity {
  type: 'ordering';
  prompt: string;
  items: string[];
  explanation: string;
}

/** Tap to flip — not graded, for memorization. */
export interface FlashcardCard extends CardIdentity {
  type: 'flashcard';
  front: string;
  back: string;
}

/** Code snippet card (read-only display, great for CS). */
export interface CodeCard extends CardIdentity {
  type: 'code';
  title: string;
  language: string;
  code: string;
  caption?: string;
}

/** Roadmap structured lesson cards — preserve educational sequence. */
export interface HookCard extends CardIdentity {
  type: 'hook';
  title: string;
  body: string;
}

export interface RecallCard extends CardIdentity {
  type: 'recall';
  prompt: string;
  body: string;
}

export interface ExplanationCard extends CardIdentity {
  type: 'explanation';
  title: string;
  body: string;
  keyTerm?: string;
  keyTermDef?: string;
}

export interface ExampleCard extends CardIdentity {
  type: 'example';
  title: string;
  body: string;
}

export interface MisconceptionCard extends CardIdentity {
  type: 'misconception';
  misconception: string;
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

export interface ApplicationCard extends CardIdentity {
  type: 'application';
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

export interface SummaryCard extends CardIdentity {
  type: 'summary';
  title?: string;
  points: string[];
}

export interface NextConnectionCard extends CardIdentity {
  type: 'next_connection';
  body: string;
  nextTitle?: string;
}

export interface PredictionCard extends CardIdentity {
  type: 'prediction';
  scenario: string;
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

/** Content Engine v2 — structured pedagogy cards. */
export interface FormulaNotation {
  symbol: string;
  meaning: string;
}

export interface FormulaCard extends CardIdentity {
  type: 'formula';
  title: string;
  formula: string;
  plainEnglish: string;
  notation?: FormulaNotation[];
  body?: string;
}

export interface DerivationStep {
  label?: string;
  expression?: string;
  explanation: string;
}

export interface DerivationCard extends CardIdentity {
  type: 'derivation';
  title: string;
  setup: string;
  steps: DerivationStep[];
  conclusion: string;
}

export interface WorkedExampleStep {
  label?: string;
  work?: string;
  explanation: string;
}

export interface WorkedExampleCard extends CardIdentity {
  type: 'worked_example';
  title: string;
  problem: string;
  steps: WorkedExampleStep[];
  answer: string;
  insight: string;
}

export interface MisconceptionCheckCard extends CardIdentity {
  type: 'misconception_check';
  misconception: string;
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

export interface CompareContrastPoint {
  left: string;
  right: string;
}

export interface CompareContrastCard extends CardIdentity {
  type: 'compare_contrast';
  title: string;
  leftLabel: string;
  rightLabel: string;
  points: CompareContrastPoint[];
  takeaway: string;
}

import type { LessonDiagram } from '@/types/diagram';

export interface VisualModelCard extends CardIdentity {
  type: 'visual_model';
  title: string;
  visualDescription: string;
  /** Structured diagram spec — preferred over prose visualDescription. */
  diagram?: LessonDiagram;
  body: string;
  takeaway: string;
}

export type LessonCard =
  | ConceptCard
  | QuoteCard
  | QuizCard
  | TrueFalseCard
  | FillBlankCard
  | MatchingCard
  | OrderingCard
  | FlashcardCard
  | CodeCard
  | HookCard
  | RecallCard
  | ExplanationCard
  | ExampleCard
  | MisconceptionCard
  | ApplicationCard
  | SummaryCard
  | NextConnectionCard
  | PredictionCard
  | FormulaCard
  | DerivationCard
  | WorkedExampleCard
  | MisconceptionCheckCard
  | CompareContrastCard
  | VisualModelCard;

/** Gradable cards that can feed SRS / scoring. */
export type GradedCard =
  | QuizCard
  | TrueFalseCard
  | FillBlankCard
  | MatchingCard
  | OrderingCard
  | MisconceptionCard
  | MisconceptionCheckCard
  | ApplicationCard
  | PredictionCard;

export interface CardRef {
  id: string;
  lessonId: string;
  lessonTitle: string;
  subjectId: SubjectId;
  cardIndex: number;
  card: LessonCard;
}

export interface Lesson {
  id: string;
  title: string;
  subtitle: string;
  minutes: number;
  cards: LessonCard[];
  /** Adaptive Learning v1 — optional lesson-level concept metadata. */
  conceptTags?: string[];
  skillTags?: string[];
  prerequisiteConcepts?: string[];
}

export interface LessonGenerationMetadata {
  mode?: 'light' | 'rich' | 'heavy' | 'expert';
  planningFallbackUsed?: boolean;
  chunkFallbackIndexes?: number[];
  warnings?: string[];
}

export interface Unit {
  id: string;
  title: string;
  description: string;
  lessons: Lesson[];
  /** Skill-tree track; defaults from unit order if omitted. */
  difficulty?: DifficultyTrack;
  /** Unit IDs that must be fully completed before this unit unlocks. */
  prerequisites?: string[];
}

export interface Subject {
  id: SubjectId;
  title: string;
  tagline: string;
  description: string;
  icon: string;
  gradient: [string, string];
  accent: string;
  units: Unit[];
}

export interface GeneratedLesson extends Lesson {
  subjectId: SubjectId;
  topic: string;
  createdAt: string;
  generated: true;
  roadmapId?: string;
  roadmapNodeId?: string;
  /** Primary learning objective for roadmap lessons. */
  primaryObjective?: string;
  blueprintId?: string;
  blueprintVersion?: number;
  promptVersion?: number;
  model?: string;
  sourceUrl?: string;
  sourceTitle?: string;
  generationMetadata?: LessonGenerationMetadata;
}

export interface AiConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}
