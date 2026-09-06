#!/usr/bin/env node
// Standalone scheduler process: runs the sync jobs on their intervals without
// the web server. Preferred over the in-server scheduler at scale.
//
//   npm run scheduler
//
// Runs until interrupted.

import { startScheduler } from '../src/scheduler.js';
import { getDb } from '../src/db/index.js';
import { logger } from '../src/lib/logger.js';

getDb(); // ensure schema/migrations are applied before jobs run
const stop = startScheduler();

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    logger.info('scheduler shutting down', { signal: sig });
    stop();
    process.exit(0);
  });
}
