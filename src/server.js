import { createApp } from './app.js';
import { config } from './config.js';
import { getDb } from './db/index.js';
import { startScheduler } from './scheduler.js';
import { logger } from './lib/logger.js';

getDb();

// Bind `::` explicitly rather than leaving the host to Node's default. Railway's
// private network is IPv6-only, so a service reachable at
// `<name>.railway.internal` must be listening on the IPv6 wildcard; `::` is
// dual-stack here (Node does not set IPV6_V6ONLY), so public IPv4 traffic still
// arrives. Relying on the default works only while IPv6 happens to be available
// at startup, which is exactly the thing that fails silently.
const server = createApp().listen(config.port, '::', () => {
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
