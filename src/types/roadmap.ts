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
  preferences?: string;
  sourceUrl?: string;
  sourceExtractionId?: string;
  sourceContext?: RoadmapSourceContext;
}

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
  quick: '8–12 lessons · foundations fast',
  standard: '16–25 lessons · balanced path',
  deep: '28–45 lessons · comprehensive mastery',
};
