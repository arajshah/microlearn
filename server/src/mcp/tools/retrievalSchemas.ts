import { z } from 'zod';

export const getDueRetrievalItemsInput = {
  roadmapId: z.string().optional(),
  limit: z.number().int().positive().max(200).optional(),
};

export const getRetrievalSummaryInput = {
  roadmapId: z.string().optional(),
};

export const inspectRetrievalScheduleInput = {
  itemId: z.string().min(1),
};

export const listRetrievalAttemptsInput = {
  itemId: z.string().optional(),
  roadmapId: z.string().optional(),
  limit: z.number().int().positive().max(200).optional(),
};

export const seedRetrievalItemsInput = {
  lessonId: z.string().min(1),
  roadmapId: z.string().optional(),
  lessonNodeId: z.string().optional(),
  force: z.boolean().optional(),
};

export const recordRetrievalAttemptInput = {
  itemId: z.string().min(1),
  rating: z.enum(['forgot', 'partial', 'remembered', 'easy']),
  responseText: z.string().optional(),
  correct: z.boolean().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  sessionId: z.string().optional(),
};
