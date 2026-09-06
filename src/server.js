import { createApp } from './app.js';
import { config } from './config.js';
import { getDb } from './db/index.js';
import { startScheduler } from './scheduler.js';
import { logger } from './lib/logger.js';

getDb();

const server = createApp().listen(config.port, () => {
  logger.info('allotwise listening', { port: config.port, env: process.env.NODE_ENV ?? 'development' });
});

// Opt-in in-process scheduler. Off by default -- prefer `npm run scheduler` as a
// separate process in production.
const stopScheduler = config.scheduler.enabled ? startScheduler() : null;

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    logger.info('shutting down', { signal: sig });
    stopScheduler?.();
    server.close(() => process.exit(0));
  });
}
