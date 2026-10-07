import { Router } from 'express';
import { listIpos, getDb } from '../db/index.js';
import { supportedRegistrars } from '../registrars/index.js';
import { cacheStats } from '../lib/cache.js';
import { rateLimitStats } from '../lib/rateLimit.js';
import { config } from '../config.js';
import { coverage, registrarHealth } from '../lib/coverage.js';

export const metaRouter = Router();

metaRouter.get('/health', (req, res) => {
  let dbOk = true;
  try {
    getDb().prepare('SELECT 1').get();
  } catch {
    dbOk = false;
  }
  // Sources going quiet is reported, not fatal: the status code stays tied to
  // the database alone, so a registrar outage cannot make the platform's health
  // check restart a perfectly good server.
  let registrars = null;
  let allotment = null;
  let problems = [];
  if (dbOk) {
    try {
      ({ registrars, problems } = registrarHealth());
      const { issues, ...summary } = coverage();
      allotment = summary;
    } catch {
      problems = ['could not compute registrar health'];
    }
  }

  res.status(dbOk ? 200 : 503).json({
    ok: dbOk,
    degraded: problems.length > 0,
    problems,
    registrars,
    allotment,
    uptimeSeconds: Math.round(process.uptime()),
    cache: cacheStats(),
    rateLimit: rateLimitStats(),
    // Whether the forwarded-address hardening is actually live. A variable set
    // in the dashboard and a variable present in the running process are not
    // the same thing, and the difference is invisible from outside -- the
    // limits simply stop working. Booleans and a hop count only: never the
    // secret, and never the address of whoever is asking.
    proxyTrust: {
      sharedSecret: Boolean(config.proxySecret),
      trustProxy: req.app.get('trust proxy'),
    },
  });
});

metaRouter.get('/ipos', (req, res) => {
  const registrar = typeof req.query.registrar === 'string' ? req.query.registrar : undefined;
  const ipos = listIpos({ registrar });
  res.json({
    count: ipos.length,
    registrars: supportedRegistrars,
    ipos: ipos.map((i) => ({
      slug: i.slug,
      name: i.name,
      registrar: i.registrar,
      allotmentStatus: i.allotment_status,
    })),
  });
});
