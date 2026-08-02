/** Server-safe generation types — no React Native or Expo dependencies. */

export interface LessonInteractionPlan {
  type:
    | 'multiple_choice'
    | 'true_false'
    | 'short_answer'
    | 'prediction'
    | 'ordering'
    | 'classification';
  purpose: string;
  conceptTested: string;
}

export interface MisconceptionCheck {
  misconception: string;
  diagnosticQuestion: string;
  correctionGoal: string;
}

export interface LessonBlueprint {
  id: string;
  roadmapId: string;
  roadmapNodeId: string;
  version: number;
  title: string;
  primaryObjective: string;
  prerequisiteRecall: string[];
  keyIdeas: string[];
  explanationPlan: string[];
  examplePlan: string[];
  interactionPlan: LessonInteractionPlan[];
  misconceptionChecks: MisconceptionCheck[];
  applicationPlan: string[];
  summaryPoints: string[];
  previousLessonConnection?: string;
  nextLessonConnection?: string;
  estimatedMinutes: number;
  createdAt: string;
  coreMentalModel?: string;
  formalDefinition?: string;
  notation?: { symbol: string; meaning: string }[];
  workedExamplePlan?: string;
  misconceptionTargets?: string[];
  visualModel?: string;
  practiceCheck?: string;
  nextBridge?: string;
  conceptTags?: string[];
  skillTags?: string[];
  prerequisiteConcepts?: string[];
  promptVersion?: string;
}

export interface LessonMistake {
  cardId: string;
  concept: string;
  userAnswer?: string;
  correctAnswer?: string;
  errorType: 'knowledge_gap' | 'misconception' | 'careless_error' | 'uncertain';
}

export interface LessonOutcomeSummary {
  objective: string;
  accuracy: number;
  continuitySummary: string;
  mistakes: LessonMistake[];
  observedMisconceptions: string[];
}

export interface SourceSection {
  heading: string;
  summary: string;
  keyPoints: string[];
}

export interface SourceContext {
  sourceTitle: string;
  sourceUrl?: string;
  sourceSummary: string;
  keyConcepts: string[];
  importantTerms: string[];
  sourceWarnings: string[];
  sourceSections: SourceSection[];
}

export interface UpcomingLessonContext {
  title: string;
  objective: string;
}

export interface PrerequisiteLessonContext {
  title: string;
  objective: string;
}

export interface LessonGenerationContext {
  roadmapId: string;
  roadmapTitle: string;
  roadmapGoal: string;
  unitTitle: string;
  unitDescription: string;
  currentLessonTitle: string;
  currentLearningObjective: string;
  currentKeyIdeas: string[];
  masteryLevel: number;
  depth?: string;
  learningPreferences?: string;
  previousLessonOutcomes: LessonOutcomeSummary[];
  knownMisconceptions: string[];
  upcomingLessons: UpcomingLessonContext[];
  prerequisiteLessons: PrerequisiteLessonContext[];
  sourceContext?: SourceContext;
  sourceExcerpt?: string;
  slidesPerLesson?: number;
}

export type LessonGenerationMode = 'light' | 'rich' | 'heavy' | 'expert';

export type CardRecord = Record<string, unknown> & { type: string; id?: string };

export interface GeneratedLessonDraft {
  title: string;
  subtitle: string;
  minutes: number;
  primaryObjective: string;
  conceptTags: string[];
  skillTags: string[];
  prerequisiteConcepts?: string[];
  cards: CardRecord[];
  generationMetadata?: Record<string, unknown>;
}

export interface LessonQualityReport {
  score: number;
  accepted: boolean;
  issues: string[];
  warnings: string[];
  dimensions: {
    objectiveCoverage: number;
    technicalDepth: number;
    activeRecall: number;
    applicationCoverage: number;
    misconceptionCoverage: number;
    cardVariety: number;
    sourceGrounding: number;
    structuralValidity: number;
  };
}

export interface HeavyLessonPlanSlide {
  index: number;
  id: string;
  requiredType: string;
  title: string;
  purpose: string;
  keyIdea: string;
  mustInclude?: string[];
  dependsOn?: string[];
}

export interface HeavyLessonPlan {
  title: string;
  subtitle: string;
  primaryObjective: string;
  coreMentalModel: string;
  slideCount: number;
  slides: HeavyLessonPlanSlide[];
  globalRequirements?: {
    notation?: unknown[];
    formulas?: string[];
    misconceptions?: string[];
    workedExampleTargets?: string[];
    visualModels?: string[];
  };
  planningFallbackUsed?: boolean;
}

export interface HeavyLessonChunk {
  index: number;
  slides: HeavyLessonPlanSlide[];
}
