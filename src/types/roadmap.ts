import { MasteryLevel } from '@/data/mastery';
import { RoadmapSourceContext } from '@/types/urlSource';

export type RoadmapDepth = 'quick' | 'standard' | 'deep';

export type RoadmapNodeStatus =
  | 'locked'
  | 'available'
  | 'active'
  | 'completed'
  | 'generating'
  | 'error';

export interface GeneratedRoadmap {
  id: string;
  title: string;
  topic: string;
  goal: string;
  description: string;
  masteryLevel: MasteryLevel;
  depth: RoadmapDepth;
  /** Target lesson count chosen at generation time. */
  targetLessonCount?: number;
  /** Target slides per lesson for lazy lesson generation. */
  slidesPerLesson?: number;
  preferences?: string;
  estimatedTotalMinutes: number;
  createdAt: string;
  units: RoadmapUnit[];
  /** When roadmap was generated from a URL source. */
  sourceUrl?: string;
  sourceExtractionId?: string;
  sourceContext?: RoadmapSourceContext;
}

export interface RoadmapUnit {
  id: string;
  title: string;
  description: string;
  order: number;
  lessons: RoadmapLessonNode[];
}

export interface RoadmapLessonNode {
  id: string;
  unitId: string;
  title: string;
  shortDescription: string;
  learningObjective: string;
  estimatedMinutes: number;
  difficulty: number;
  order: number;
  prerequisiteIds: string[];
  keyIdeas: string[];
  status: RoadmapNodeStatus;
  generatedLessonId?: string;
  blueprintId?: string;
  blueprintVersion?: number;
}

export interface GenerateRoadmapInput {
  topic: string;
  goal: string;
  masteryLevel: MasteryLevel;
  depth: RoadmapDepth;
  lessonCount: number;
  slidesPerLesson: number;
  preferences?: string;
  sourceUrl?: string;
  sourceExtractionId?: string;
  sourceContext?: RoadmapSourceContext;
}

export const LESSON_SLIDE_PRESETS: Record<RoadmapDepth, number> = {
  quick: 5,
  standard: 8,
  deep: 12,
};

export const ROADMAP_LESSON_PRESETS: Record<RoadmapDepth, number> = {
  quick: 6,
  standard: 10,
  deep: 16,
};

export const ROADMAP_SLIDES_PRESETS: Record<RoadmapDepth, number> = {
  quick: 6,
  standard: 8,
  deep: 10,
};

/** Context passed into lazy lesson generation for coherence. */
export interface RoadmapLessonContext {
  roadmapTitle: string;
  goal: string;
  unitTitle: string;
  unitDescription: string;
  lessonTitle: string;
  learningObjective: string;
  keyIdeas: string[];
  masteryLevel: MasteryLevel;
  previousLessons: { title: string; objective: string }[];
  nextLessons: { title: string; objective: string }[];
}

export const DEPTH_LABELS: Record<RoadmapDepth, string> = {
  quick: 'Quick',
  standard: 'Standard',
  deep: 'Deep',
};

export const DEPTH_HINTS: Record<RoadmapDepth, string> = {
  quick: '6 lessons · 6 slides each',
  standard: '10 lessons · 8 slides each',
  deep: '16 lessons · 10 slides each',
};
