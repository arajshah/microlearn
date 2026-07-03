import express, { type NextFunction, type Request, type Response } from 'express';
import { loadConfig } from './config';
import { initDatabase } from './db';
import { logger } from './logger';
import { createHealthRouter } from './routes/health';
import { createMcpRouter } from './mcp/mcpServer';

function main(): void {
  const config = loadConfig();
  const db = initDatabase(config);

  const app = express();
  app.use(express.json({ limit: '4mb' }));

  app.use(createHealthRouter(config, db));
  app.use(createMcpRouter(config, db));

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ ok: false, error: 'Not found' });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : 'Internal server error';
    logger.error('Unhandled request error', message);
    res.status(500).json({ ok: false, error: 'Internal server error' });
  });

  const server = app.listen(config.port, () => {
    logger.info('Microlearn local server started', {
      service: config.serviceName,
      env: config.nodeEnv,
      port: config.port,
      health: `http://localhost:${config.port}/health`,
      mcp: `http://localhost:${config.port}/mcp`,
    });
  });

  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}, shutting down`);
    server.close(() => {
      try {
        db.close();
      } catch (err) {
        logger.error('Error closing database', err);
      }
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
