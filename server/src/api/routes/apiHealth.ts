import { Router } from 'express';
import type { ServerConfig } from '../../config';
import { checkDatabaseHealth, type Db } from '../../db';

/** GET /api/health — API and database health. */
export function createApiHealthRouter(config: ServerConfig, db: Db): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const dbOk = checkDatabaseHealth(db);
    res.status(dbOk ? 200 : 503).json({
      ok: dbOk,
      service: config.serviceName,
      api: 'v1',
      database: { ok: dbOk },
      time: new Date().toISOString(),
    });
  });

  return router;
}
