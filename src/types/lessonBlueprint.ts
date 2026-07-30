export const BLUEPRINT_VERSION = 1;
export const LESSON_PROMPT_VERSION = 1;

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
  /** Content Engine v2 pedagogy metadata (optional). */
  coreMentalModel?: string;
  formalDefinition?: string;
  notation?: { symbol: string; meaning: string }[];
  workedExamplePlan?: string;
  misconceptionTargets?: string[];
  visualModel?: string;
  practiceCheck?: string;
  prerequisiteRecallNote?: string;
  nextBridge?: string;
  conceptTags?: string[];
  skillTags?: string[];
  prerequisiteConcepts?: string[];
}
