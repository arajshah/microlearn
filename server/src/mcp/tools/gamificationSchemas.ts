import { z } from 'zod';

export const getGamificationSummaryInput = {};

export const listAchievementsInput = {
  category: z.string().optional(),
  unlockedOnly: z.boolean().optional(),
};

export const inspectDailyActivityInput = {
  days: z.number().int().positive().max(90).optional(),
};

export const recordActivityEventInput = {
  eventType: z.enum([
    'lesson_completed',
    'retrieval_completed',
    'roadmap_started',
    'roadmap_completed',
    'creation_completed',
  ]),
  event: z.record(z.string(), z.unknown()).optional().default({}),
};
