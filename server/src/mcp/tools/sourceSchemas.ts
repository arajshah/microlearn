import { z } from 'zod';

export const extractDocumentSourceInput = {
  url: z.string().min(1).describe('Public http(s) URL to a PDF, text, markdown, or HTML document.'),
  force: z.boolean().optional().describe('Re-extract even if a ready source already exists. Default false.'),
};

export const getDocumentSourceInput = {
  sourceId: z.string().min(1).describe('Source document id.'),
  includeText: z.boolean().optional().describe('Include full extracted text. Default false.'),
};

export const listDocumentSourcesInput = {
  status: z.enum(['pending', 'extracting', 'ready', 'failed']).optional().describe('Filter by status.'),
  limit: z.number().int().positive().max(200).optional().describe('Maximum results. Default 50.'),
};

export const createRoadmapFromSourceInput = {
  sourceId: z.string().min(1).describe('Ready source document id.'),
  title: z.string().optional().describe('Optional roadmap title override.'),
  goal: z.string().min(1).describe('Learning goal for the roadmap.'),
  masteryLevel: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]).describe('Mastery level 1-5.'),
  depth: z.enum(['quick', 'standard', 'deep']).describe('Roadmap depth.'),
  confirm: z.string().optional().describe('Must be "create Microlearn roadmap from source" when write tools are enabled.'),
};

export const createLessonFromSourceInput = {
  sourceId: z.string().min(1).describe('Ready source document id.'),
  title: z.string().optional().describe('Optional lesson title override.'),
  goal: z.string().optional().describe('Optional learning goal.'),
  masteryLevel: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]).describe('Mastery level 1-5.'),
  depth: z.enum(['quick', 'standard', 'deep']).describe('Lesson depth.'),
  confirm: z.string().optional().describe('Must be "create Microlearn lesson from source" when write tools are enabled.'),
};
