import { Router, type NextFunction, type Request, type Response } from 'express';
import type { ServerConfig } from '../config';
import type { Db } from '../db';
import { requireBearerToken } from '../auth/bearerAuth';
import { sendError } from './http';
import { createApiHealthRouter } from './routes/apiHealth';
import { createRoadmapsRouter } from './routes/roadmaps';
import { createLessonsRouter } from './routes/lessons';
import { createOutcomesRouter, createLessonNodeOutcomesRouter } from './routes/outcomes';
import { createSourcesRouter } from './routes/sources';
import { createRetrievalRouter } from './routes/retrieval';
import {
  createAchievementsRouter,
  createActivityRouter,
  createProfileRouter,
} from './routes/gamification';
import {
  createDiagnosticsRouter,
  createLearningRouter,
  createRemediationRouter,
} from './routes/adaptive';

/** Assembles the /api router with health, roadmaps, lessons, outcomes, plus JSON error handling. */
export function createApiRouter(config: ServerConfig, db: Db): Router {
  const router = Router();

  if (config.requireAuth) {
    router.use(requireBearerToken(config.apiBearerToken));
  }

  router.use('/health', createApiHealthRouter(config, db));
  router.use('/roadmaps', createRoadmapsRouter(db));
  router.use('/lessons', createLessonsRouter(db));
  router.use('/outcomes', createOutcomesRouter(db));
  router.use('/lesson-nodes', createLessonNodeOutcomesRouter(db));
  router.use('/sources', createSourcesRouter(db));
  router.use('/retrieval', createRetrievalRouter(db));
  router.use('/profile', createProfileRouter(db));
  router.use('/achievements', createAchievementsRouter(db));
  router.use('/activity', createActivityRouter(db));
  router.use('/learning', createLearningRouter(db));
  router.use('/diagnostics', createDiagnosticsRouter(db));
  router.use('/remediation', createRemediationRouter(db));

  router.use((_req: Request, res: Response) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown API route.' } });
  });

  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    sendError(res, err);
  });

  return router;
}
