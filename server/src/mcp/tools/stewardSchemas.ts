import { z } from 'zod';

const conciseText = z.string().trim().min(1).max(500);
const strategyList = z.array(conciseText).max(50);
const privateReasoningFields = {
  reasoning: z.never().optional(),
  chainOfThought: z.never().optional(),
  hiddenReasoning: z.never().optional(),
  privateReasoning: z.never().optional(),
};

export const getCurriculumStewardStateInput = {
  roadmapLimit: z.number().int().min(1).max(50).optional(),
  lessonLimit: z.number().int().min(1).max(50).optional(),
  runLimit: z.number().int().min(1).max(25).optional(),
};

export const updateCurriculumStewardCharterInput = {
  content: z.string().trim().min(100).max(50_000),
  expectedVersion: z.number().int().positive().optional(),
  ...privateReasoningFields,
};

export const updateCurriculumStrategyInput = {
  summary: z.string().trim().min(1).max(4_000),
  currentPhase: z.string().trim().min(1).max(1_000),
  priorities: strategyList,
  deprioritizedAreas: strategyList,
  activeHypotheses: strategyList,
  nearTermObjectives: strategyList,
  upcomingPlan: strategyList,
  concerns: strategyList,
  lastReviewedAt: z.string().datetime({ offset: true }).optional(),
  expectedVersion: z.number().int().positive().optional(),
  ...privateReasoningFields,
};

export const getRecentCurriculumStewardRunsInput = {
  limit: z.number().int().min(1).max(50).optional(),
};

export const beginCurriculumStewardRunInput = {
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
  ...privateReasoningFields,
};

export const stewardActionSchema = z.object({
  type: z.string().trim().min(1).max(80),
  entityType: z.string().trim().min(1).max(80).optional(),
  entityId: z.string().trim().min(1).max(200).optional(),
  summary: z.string().trim().min(1).max(500),
  ...privateReasoningFields,
});

export const completeCurriculumStewardRunInput = {
  runId: z.string().trim().min(1).max(200),
  status: z.enum(['completed', 'no_change']),
  summary: z.string().trim().min(1).max(2_000),
  actions: z.array(stewardActionSchema).max(100).optional(),
  resultingStrategyVersion: z.number().int().positive().optional(),
  ...privateReasoningFields,
};

export const failCurriculumStewardRunInput = {
  runId: z.string().trim().min(1).max(200),
  errorCode: z.string().trim().min(1).max(100).regex(/^[A-Z0-9_:-]+$/),
  errorMessage: z.string().trim().min(1).max(1_000),
  summary: z.string().trim().min(1).max(2_000).optional(),
  ...privateReasoningFields,
};
