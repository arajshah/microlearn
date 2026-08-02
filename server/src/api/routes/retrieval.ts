import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../../db';
import { parse } from '../http';
import {
  cleanupDemoRetrievalContent,
  createRetrievalSession,
  createReviewSetFromLesson,
  finishRetrievalSession,
  getRetrievalSummary,
  listDueReviewSets,
  listScheduledItems,
  listDueItems,
  recordRetrievalAttempt,
  seedRetrievalItems,
  softDeleteRetrievalItem,
  softDeleteReviewSet,
} from '../../retrieval/retrievalRepository';
import {
  handleRetrievalAttempt,
  handleRetrievalSessionComplete,
} from '../../gamification/gamificationService';

const dueQuerySchema = z.object({
  roadmapId: z.string().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

const scheduleQuerySchema = z.object({
  roadmapId: z.string().optional(),
  days: z.coerce.number().int().positive().max(45).optional(),
});

const seedSchema = z.object({
  lessonId: z.string().min(1),
  roadmapId: z.string().optional(),
  lessonNodeId: z.string().optional(),
  lesson: z.record(z.string(), z.unknown()).optional(),
  force: z.boolean().optional(),
});

const reviewSetCreateSchema = z.object({
  lessonId: z.string().min(1),
  lesson: z.record(z.string(), z.unknown()).optional(),
  roadmapId: z.string().optional(),
  lessonNodeId: z.string().optional(),
  force: z.boolean().optional(),
});

const reviewSetDueQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional(),
});

const sessionSchema = z.object({
  roadmapId: z.string().optional(),
  itemIds: z.array(z.string().min(1)).min(1),
});

const attemptSchema = z.object({
  sessionId: z.string().optional(),
  itemId: z.string().min(1),
  rating: z.enum(['forgot', 'partial', 'remembered', 'easy']),
  responseText: z.string().optional(),
  correct: z.boolean().optional(),
  durationMs: z.number().int().nonnegative().optional(),
});

const finishSchema = z.object({
  endedAt: z.string().optional(),
});

const summaryQuerySchema = z.object({
  roadmapId: z.string().optional(),
});

/** Retrieval routes mounted at /api/retrieval. */
export function createRetrievalRouter(db: Db): Router {
  const router = Router();

  router.get('/due', (req, res) => {
    const query = parse(dueQuerySchema, req.query);
    res.json({ items: listDueItems(db, query) });
  });

  router.get('/schedule', (req, res) => {
    const query = parse(scheduleQuerySchema, req.query);
    res.json({ items: listScheduledItems(db, query) });
  });

  router.get('/summary', (req, res) => {
    const query = parse(summaryQuerySchema, req.query);
    res.json({ summary: getRetrievalSummary(db, query.roadmapId) });
  });

  router.get('/review-sets/due', (req, res) => {
    const query = parse(reviewSetDueQuerySchema, req.query);
    res.json({ reviewSets: listDueReviewSets(db, query) });
  });

  router.post('/review-sets', (req, res) => {
    const input = parse(reviewSetCreateSchema, req.body);
    res.status(201).json(createReviewSetFromLesson(db, { ...input, actor: 'api' }));
  });

  router.post('/items/seed', (req, res) => {
    const input = parse(seedSchema, req.body);
    res.status(201).json({ result: seedRetrievalItems(db, { ...input, actor: 'api' }) });
  });

  router.post('/sessions', (req, res) => {
    const input = parse(sessionSchema, req.body);
    res.status(201).json(createRetrievalSession(db, input));
  });

  router.patch('/sessions/:sessionId/finish', (req, res) => {
    const input = parse(finishSchema, req.body ?? {});
    const session = finishRetrievalSession(db, req.params.sessionId, input.endedAt);
    try {
      handleRetrievalSessionComplete(db, req.params.sessionId);
    } catch {
      /* best-effort gamification */
    }
    res.json({ session });
  });

  router.post('/attempts', (req, res) => {
    const input = parse(attemptSchema, req.body);
    const result = recordRetrievalAttempt(db, { ...input, actor: 'api' });
    try {
      const unlocked = handleRetrievalAttempt(db, {
        sessionId: input.sessionId,
        rating: input.rating,
        durationMs: input.durationMs,
      });
      res.status(201).json({ ...result, unlocked });
    } catch {
      res.status(201).json(result);
    }
  });

  router.delete('/review-sets/:reviewSetId', (req, res) => {
    res.json(softDeleteReviewSet(db, req.params.reviewSetId, 'api'));
  });

  router.delete('/items/:itemId', (req, res) => {
    res.json(softDeleteRetrievalItem(db, req.params.itemId, 'api'));
  });

  router.post('/cleanup-demo', (_req, res) => {
    res.json(cleanupDemoRetrievalContent(db, 'api'));
  });

  return router;
}
