export interface LessonMistake {
  cardId: string;
  concept: string;
  userAnswer?: string;
  correctAnswer?: string;
  errorType: 'knowledge_gap' | 'misconception' | 'careless_error' | 'uncertain';
}

export interface LessonOutcome {
  id: string;
  roadmapId: string;
  roadmapNodeId: string;
  lessonId: string;
  objective: string;
  conceptsCovered: string[];
  completedAt: string;
  totalQuestions: number;
  correctAnswers: number;
  accuracy: number;
  mistakes: LessonMistake[];
  observedMisconceptions: string[];
  unresolvedQuestions: string[];
  masteryEstimate: number;
  continuitySummary: string;
}
