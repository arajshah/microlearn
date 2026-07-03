import { LessonOutcome } from '@/types/lessonOutcome';
import { RoadmapSourceContext } from '@/types/urlSource';

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
  learningPreferences?: string;
  previousLessonOutcomes: LessonOutcome[];
  knownMisconceptions: string[];
  upcomingLessons: UpcomingLessonContext[];
  prerequisiteLessons: PrerequisiteLessonContext[];
  sourceContext?: RoadmapSourceContext;
  /** Relevant excerpt from URL source for this lesson node. */
  sourceExcerpt?: string;
}
