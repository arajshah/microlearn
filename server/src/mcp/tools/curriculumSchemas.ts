import { z } from 'zod';

const depth = z.enum(['quick', 'standard', 'deep']);
const nodeStatus = z.enum(['locked', 'available', 'active', 'completed', 'generating', 'error']);

export const listRoadmapsInput = {
  status: z.enum(['draft', 'published', 'archived', 'deleted', 'all']).optional().describe('Filter by status. Default excludes deleted.'),
  includeCounts: z.boolean().optional().describe('Include unit and lesson counts. Default false.'),
};

export const getRoadmapInput = {
  roadmapId: z.string().min(1),
  includeBlueprints: z.boolean().optional(),
  includeLessons: z.boolean().optional(),
  includeOutcomes: z.boolean().optional(),
  includeVersions: z.boolean().optional(),
};

const createLessonShape = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(1),
  shortDescription: z.string(),
  learningObjective: z.string().min(1),
  estimatedMinutes: z.number().int().positive(),
  difficulty: z.number().int().min(1).max(5),
  order: z.number().int().nonnegative(),
  prerequisiteIds: z.array(z.string()).optional(),
  keyIdeas: z.array(z.string()).min(1),
});

const createUnitShape = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(1),
  description: z.string(),
  order: z.number().int().nonnegative(),
  lessons: z.array(createLessonShape).default([]),
});

export const createRoadmapInput = {
  title: z.string().min(1),
  topic: z.string().min(1),
  goal: z.string().min(1),
  description: z.string(),
  masteryLevel: z.number().int().min(1).max(5),
  depth,
  estimatedTotalMinutes: z.number().int().nonnegative().optional(),
  units: z.array(createUnitShape).min(1),
  changeSummary: z.string().optional(),
};

export const updateRoadmapInput = {
  roadmapId: z.string().min(1),
  patch: z
    .object({
      title: z.string().min(1).optional(),
      topic: z.string().min(1).optional(),
      goal: z.string().min(1).optional(),
      description: z.string().optional(),
      masteryLevel: z.number().int().min(1).max(5).optional(),
      depth: depth.optional(),
      estimatedTotalMinutes: z.number().int().nonnegative().optional(),
      status: z.enum(['draft', 'published', 'archived']).optional(),
    })
    .refine((v) => Object.keys(v).length > 0, { message: 'patch must have at least one field.' }),
  changeSummary: z.string().min(1),
};

export const createUnitInput = {
  roadmapId: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  order: z.number().int().nonnegative().optional(),
  changeSummary: z.string().min(1),
};

export const updateUnitInput = {
  roadmapId: z.string().min(1),
  unitId: z.string().min(1),
  patch: z
    .object({
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      order: z.number().int().nonnegative().optional(),
    })
    .refine((v) => Object.keys(v).length > 0, { message: 'patch must have at least one field.' }),
  changeSummary: z.string().min(1),
};

export const deleteUnitInput = {
  roadmapId: z.string().min(1),
  unitId: z.string().min(1),
  confirm: z.string().describe('Must be exactly "delete Microlearn unit".'),
  changeSummary: z.string().min(1),
};

export const createLessonNodeInput = {
  roadmapId: z.string().min(1),
  unitId: z.string().min(1),
  title: z.string().min(1),
  shortDescription: z.string(),
  learningObjective: z.string().min(1),
  estimatedMinutes: z.number().int().positive(),
  difficulty: z.number().int().min(1).max(5),
  order: z.number().int().nonnegative().optional(),
  prerequisiteIds: z.array(z.string()).optional(),
  keyIdeas: z.array(z.string()).min(1),
  changeSummary: z.string().min(1),
};

export const updateLessonNodeInput = {
  roadmapId: z.string().min(1),
  lessonNodeId: z.string().min(1),
  patch: z
    .object({
      unitId: z.string().min(1).optional(),
      title: z.string().min(1).optional(),
      shortDescription: z.string().optional(),
      learningObjective: z.string().min(1).optional(),
      estimatedMinutes: z.number().int().positive().optional(),
      difficulty: z.number().int().min(1).max(5).optional(),
      order: z.number().int().nonnegative().optional(),
      prerequisiteIds: z.array(z.string()).optional(),
      keyIdeas: z.array(z.string()).min(1).optional(),
      status: nodeStatus.optional(),
      generatedLessonId: z.string().nullable().optional(),
    })
    .refine((v) => Object.keys(v).length > 0, { message: 'patch must have at least one field.' }),
  changeSummary: z.string().min(1),
};

export const deleteLessonNodeInput = {
  roadmapId: z.string().min(1),
  lessonNodeId: z.string().min(1),
  confirm: z.string().describe('Must be exactly "delete Microlearn lesson node".'),
  changeSummary: z.string().min(1),
};

export const reorderLessonNodesInput = {
  roadmapId: z.string().min(1),
  unitId: z.string().min(1).optional(),
  orderedLessonNodeIds: z.array(z.string().min(1)).min(1),
  changeSummary: z.string().min(1),
};

export const createLessonBlueprintInput = {
  roadmapId: z.string().min(1),
  lessonNodeId: z.string().min(1),
  blueprint: z.record(z.string(), z.unknown()),
  changeSummary: z.string().min(1),
};

export const updateLessonBlueprintInput = {
  blueprintId: z.string().min(1),
  blueprint: z.record(z.string(), z.unknown()),
  changeSummary: z.string().min(1),
};

export const createLessonInput = {
  roadmapId: z.string().min(1),
  lessonNodeId: z.string().min(1),
  blueprintId: z.string().min(1).optional(),
  lesson: z.record(z.string(), z.unknown()),
  model: z.string().optional(),
  promptVersion: z.string().optional(),
  changeSummary: z.string().min(1),
};

export const updateLessonInput = {
  lessonId: z.string().min(1),
  lesson: z.record(z.string(), z.unknown()),
  model: z.string().optional(),
  promptVersion: z.string().optional(),
  changeSummary: z.string().min(1),
};

export const validateCurriculumInput = {
  roadmapId: z.string().min(1),
};

export const publishVersionInput = {
  roadmapId: z.string().min(1),
  confirm: z.string().describe('Must be exactly "publish Microlearn roadmap".'),
  changeSummary: z.string().min(1),
};

export const rollbackVersionInput = {
  roadmapId: z.string().min(1),
  versionId: z.string().min(1),
  confirm: z.string().describe('Must be exactly "rollback Microlearn roadmap".'),
  changeSummary: z.string().min(1),
};

export const readLearningOutcomesInput = {
  roadmapId: z.string().min(1).optional(),
  lessonNodeId: z.string().min(1).optional(),
  limit: z.number().int().positive().max(200).optional(),
};
