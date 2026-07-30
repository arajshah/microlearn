import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../../db';
import { parse } from '../http';
import {
  getAchievements,
  getDailyActivity,
  getProfileSummary,
  recordActivityEvent,
} from '../../gamification/gamificationService';

const activityQuerySchema = z.object({
  days: z.coerce.number().int().positive().max(90).optional(),
});

const achievementsQuerySchema = z.object({
  category: z.string().optional(),
  unlockedOnly: z.coerce.boolean().optional(),
});

const activityEventSchema = z.object({
  eventType: z.enum([
    'lesson_completed',
    'retrieval_completed',
    'roadmap_started',
    'roadmap_completed',
    'creation_completed',
  ]),
  event: z.record(z.string(), z.unknown()).optional().default({}),
});

/** Profile summary at /api/profile/summary */
export function createProfileRouter(db: Db): Router {
  const router = Router();
  router.get('/summary', (_req, res) => {
    res.json({ summary: getProfileSummary(db) });
  });
  return router;
}

/** Achievements at /api/achievements */
export function createAchievementsRouter(db: Db): Router {
  const router = Router();
  router.get('/', (req, res) => {
    const query = parse(achievementsQuerySchema, req.query);
    res.json({ achievements: getAchievements(db, query) });
  });
  return router;
}

/** Daily activity at /api/activity */
export function createActivityRouter(db: Db): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const query = parse(activityQuerySchema, req.query);
    res.json({ activity: getDailyActivity(db, query.days ?? 14) });
  });

  router.post('/', (req, res) => {
    const input = parse(activityEventSchema, req.body);
    const eventJson = JSON.stringify(input.event);
    if (eventJson.length > 4000) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Event payload too large.' } });
      return;
    }
    const result = recordActivityEvent(db, input.eventType, input.event);
    res.status(201).json({ ok: true, unlocked: result.unlocked });
  });

  return router;
}
