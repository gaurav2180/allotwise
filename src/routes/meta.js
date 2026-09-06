import { Router } from 'express';
import { listIpos, getDb } from '../db/index.js';
import { supportedRegistrars } from '../registrars/index.js';
import { cacheStats } from '../lib/cache.js';
import { rateLimitStats } from '../lib/rateLimit.js';

export const metaRouter = Router();

metaRouter.get('/health', (_req, res) => {
  let dbOk = true;
  try {
    getDb().prepare('SELECT 1').get();
  } catch {
    dbOk = false;
  }
  res.status(dbOk ? 200 : 503).json({
    ok: dbOk,
    uptimeSeconds: Math.round(process.uptime()),
    cache: cacheStats(),
    rateLimit: rateLimitStats(),
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
