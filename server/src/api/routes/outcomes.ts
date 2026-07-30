import { Router } from 'express';
import type { Db } from '../../db';
import { parse } from '../http';
import { createOutcome, listNodeOutcomes } from '../../outcomes/outcomeRepository';
import { handleLessonOutcome } from '../../gamification/gamificationService';
import { z } from 'zod';

const createOutcomeSchema = z.object({
  roadmapId: z.string().min(1),
  lessonNodeId: z.string().min(1),
  lessonId: z.string().min(1),
  outcome: z.record(z.string(), z.unknown()),
  completedAt: z.string().optional(),
});

/** Outcome routes mounted at /api/outcomes. */
export function createOutcomesRouter(db: Db): Router {
  const router = Router();

  router.post('/', (req, res) => {
    const input = parse(createOutcomeSchema, req.body);
    const outcome = createOutcome(db, input);
    try {
      const unlocked = handleLessonOutcome(db, {
        roadmapId: input.roadmapId,
        lessonNodeId: input.lessonNodeId,
        lessonId: input.lessonId,
        outcome: input.outcome,
      });
      res.status(201).json({ outcome, unlocked });
    } catch {
      res.status(201).json({ outcome });
    }
  });

  return router;
}

/** GET /api/lesson-nodes/:lessonNodeId/outcomes */
export function createLessonNodeOutcomesRouter(db: Db): Router {
  const router = Router();
  router.get('/:lessonNodeId/outcomes', (req, res) => {
    res.json({ outcomes: listNodeOutcomes(db, req.params.lessonNodeId) });
  });
  return router;
}
