import { loadConfig } from './config';
import { initDatabase } from './db';
import { logger } from './logger';
import { processDueReminders, runDueAutomationJobs } from './automation/workerService';

const INTERVAL_MS = 30_000;

function main(): void {
  const config = loadConfig();
  const db = initDatabase(config);
  const tick = () => {
    try {
      const jobs = runDueAutomationJobs(db);
      const reminders = processDueReminders(db);
      if (jobs.executed || jobs.failed || reminders.queued || reminders.unconfigured) {
        logger.info('Automation worker tick', { jobs, reminders });
      }
    } catch (error) {
      logger.error('Automation worker tick failed', error instanceof Error ? error.message : 'unknown error');
    }
  };
  tick();
  const timer = setInterval(tick, INTERVAL_MS);
  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}, stopping automation worker`);
    clearInterval(timer);
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  logger.info('Microlearn automation worker started', { intervalMs: INTERVAL_MS });
}

main();
