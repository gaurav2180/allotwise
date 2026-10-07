import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { logger } from './lib/logger.js';

// Dependency-free periodic scheduler. Each job runs a sync script in its own
// child process so a crash in one never takes down the server, and the DB is
// touched by a short-lived writer rather than the long-lived web process.
//
// Jobs are staggered and guarded against overlap (a slow run skips its next
// tick rather than piling up). Intervals are configurable; the defaults suit a
// tracker where GMP/subscription move within the day and registrar mappings
// change slowly.

const here = dirname(fileURLToPath(import.meta.url));
const scriptsDir = resolve(here, '..', 'scripts');

const running = new Set();

function runScript(name, file) {
  if (running.has(name)) {
    logger.warn('scheduler skip: still running', { job: name });
    return;
  }
  running.add(name);
  const started = Date.now();
  const child = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', resolve(scriptsDir, file)], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  child.on('exit', (code) => {
    running.delete(name);
    logger.info('scheduler job done', { job: name, code, ms: Date.now() - started });
  });
  child.on('error', (err) => {
    running.delete(name);
    logger.error('scheduler job error', { job: name, message: err.message });
  });
}

// Registrar sync + GMP + metadata + linking, in order, as one chain so links
// are rebuilt only after their inputs are fresh. Sequential via a tiny runner.
function runChain(name, files) {
  if (running.has(name)) {
    logger.warn('scheduler skip: still running', { job: name });
    return;
  }
  running.add(name);
  const started = Date.now();
  let i = 0;
  const next = () => {
    if (i >= files.length) {
      running.delete(name);
      logger.info('scheduler chain done', { job: name, ms: Date.now() - started });
      return;
    }
    const file = files[i++];
    const child = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', resolve(scriptsDir, file)], {
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    child.on('exit', next);
    child.on('error', (err) => {
      logger.error('scheduler chain step error', { job: name, file, message: err.message });
      next();
    });
  };
  next();
}

export function startScheduler() {
  const { registrarsMs, gmpMetaMs, registrarListsMs, registrarCheckMs, runOnStart } = config.scheduler;

  const jobs = [
    {
      name: 'registrars',
      every: registrarsMs,
      // Registrar mappings + GMP + metadata + identity links.
      run: () =>
        runChain('registrars', [
          'sync-kfintech.js',
          'sync-linkintime.js',
          'sync-bigshare.js',
          'sync-maashitla.js',
          'sync-gmp.js',
          'sync-metadata.js',
          'link-ipos.js',
        ]),
    },
    // GMP alone, more often than the full chain, so premiums stay fresh.
    { name: 'gmp', every: gmpMetaMs, run: () => runScript('gmp', 'sync-gmp.js') },
    // The registrars' company lists on their own, much more often than hourly:
    // a registrar publishes an issue the moment its allotment is final, and
    // until the next sync after that the issue has no in-app check.
    {
      name: 'registrar-lists',
      every: registrarListsMs,
      run: () =>
        runChain('registrar-lists', [
          'sync-kfintech.js',
          'sync-linkintime.js',
          'sync-bigshare.js',
          'sync-maashitla.js',
          'link-ipos.js',
        ]),
    },
    // Self-test of every registrar and the coverage report, so a source that
    // breaks is found by the schedule rather than by a missing button.
    { name: 'registrar-check', every: registrarCheckMs, run: () => runScript('registrar-check', 'check-registrars.js') },
  ];

  const timers = [];
  jobs.forEach((job, idx) => {
    // Stagger initial kicks so they do not all fire at once.
    if (runOnStart) setTimeout(job.run, 4000 * (idx + 1));
    timers.push(setInterval(job.run, job.every));
  });

  logger.info('scheduler started', {
    registrarsMin: Math.round(registrarsMs / 60000),
    gmpMin: Math.round(gmpMetaMs / 60000),
    registrarListsMin: Math.round(registrarListsMs / 60000),
    registrarCheckMin: Math.round(registrarCheckMs / 60000),
    runOnStart,
  });

  return () => timers.forEach(clearInterval);
}
