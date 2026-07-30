import { z } from 'zod';

/** Roadmap lifecycle states persisted server-side. */
export const ROADMAP_STATUSES = ['draft', 'published', 'archived', 'deleted'] as const;
export type RoadmapStatus = (typeof ROADMAP_STATUSES)[number];

export const DELETE_ROADMAP_CONFIRM = 'delete Microlearn roadmap';

const lessonNodeSchema = z.object({
  id: z.string().min(1).optional(),
  unitId: z.string().min(1).optional(),
  title: z.string().min(1),
  shortDescription: z.string().optional(),
  learningObjective: z.string().optional(),
  estimatedMinutes: z.number().int().nonnegative().optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  order: z.number().int().nonnegative().optional(),
  prerequisiteIds: z.array(z.string()).optional(),
  keyIdeas: z.array(z.string()).optional(),
  status: z.string().optional(),
  generatedLessonId: z.string().optional(),
});

const unitSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  order: z.number().int().nonnegative().optional(),
  lessons: z.array(lessonNodeSchema).default([]),
});

export const roadmapCreateSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(1),
  topic: z.string().min(1),
  goal: z.string().min(1),
  description: z.string().optional(),
  masteryLevel: z.number().int().min(1).max(5).optional(),
  depth: z.enum(['quick', 'standard', 'deep']).optional(),
  status: z.enum(ROADMAP_STATUSES).optional(),
  estimatedTotalMinutes: z.number().int().nonnegative().optional(),
  units: z.array(unitSchema).default([]),
});

export const roadmapPatchSchema = z
  .object({
    title: z.string().min(1).optional(),
    topic: z.string().min(1).optional(),
    goal: z.string().min(1).optional(),
    description: z.string().optional(),
    masteryLevel: z.number().int().min(1).max(5).optional(),
    depth: z.enum(['quick', 'standard', 'deep']).optional(),
    status: z.enum(ROADMAP_STATUSES).optional(),
    estimatedTotalMinutes: z.number().int().nonnegative().optional(),
    publishedAt: z.string().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required.' });

export const roadmapListQuerySchema = z.object({
  status: z.enum(ROADMAP_STATUSES).optional(),
});

export const lessonUpsertSchema = z
  .object({
    id: z.string().min(1).optional(),
    subjectId: z.string().min(1).optional(),
    topic: z.string().optional(),
    title: z.string().optional(),
    roadmapId: z.string().min(1).optional(),
    lessonNodeId: z.string().min(1).optional(),
    blueprintId: z.string().min(1).optional(),
    lessonJson: z.record(z.string(), z.unknown()),
    model: z.string().optional(),
    promptVersion: z.string().optional(),
    sourceUrl: z.string().optional(),
    sourceTitle: z.string().optional(),
    version: z.number().int().positive().optional(),
  })
  .refine(
    (v) => {
      const linked = Boolean(v.roadmapId || v.lessonNodeId);
      if (!linked) return Boolean(v.subjectId);
      return Boolean(v.roadmapId && v.lessonNodeId);
    },
    { message: 'Standalone lessons require subjectId; roadmap lessons require roadmapId and lessonNodeId.' },
  );

export const lessonPatchSchema = z
  .object({
    lessonJson: z.record(z.string(), z.unknown()).optional(),
    topic: z.string().optional(),
    title: z.string().optional(),
    subjectId: z.string().min(1).optional(),
    model: z.string().optional(),
    promptVersion: z.string().optional(),
    status: z.enum(['active', 'archived', 'deleted']).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required.' });

export const deleteRoadmapSchema = z.object({
  confirm: z.literal(DELETE_ROADMAP_CONFIRM),
});

export const roadmapNodePatchSchema = z
  .object({
    status: z.string().optional(),
    generatedLessonId: z.string().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required.' });

export type RoadmapCreateInput = z.infer<typeof roadmapCreateSchema>;
export type RoadmapPatchInput = z.infer<typeof roadmapPatchSchema>;
export type RoadmapNodePatchInput = z.infer<typeof roadmapNodePatchSchema>;
export type LessonUpsertInput = z.infer<typeof lessonUpsertSchema>;
export type LessonPatchInput = z.infer<typeof lessonPatchSchema>;
