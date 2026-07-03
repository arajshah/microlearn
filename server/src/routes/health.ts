import { Router } from 'express';
import type { ServerConfig } from '../config';
import { checkDatabaseHealth, type Db } from '../db';

/** Builds the /health router. Reports server, config, and database status without exposing secrets. */
export function createHealthRouter(config: ServerConfig, db: Db): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    const dbOk = checkDatabaseHealth(db);

    res.status(dbOk ? 200 : 503).json({
      ok: dbOk,
      service: config.serviceName,
      env: config.nodeEnv,
      port: config.port,
      database: {
        ok: dbOk,
        path: config.dbPath,
      },
      time: new Date().toISOString(),
    });
  });

  return router;
}
