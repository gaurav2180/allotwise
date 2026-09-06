import express, { Router } from 'express';
import { parsePan, parseSlug } from '../lib/validate.js';
import { maskPan } from '../lib/logger.js';
import { panHash } from '../lib/panHash.js';
import { findIpoBySlug, marketSlugForRegistrar, latestGmpForMarket } from '../db/index.js';
import { getRegistrar } from '../registrars/index.js';
import { cacheGet, cacheSet } from '../lib/cache.js';
import { config } from '../config.js';
import { AppError, notFound } from '../lib/errors.js';
import { allotmentIpLimiter, panLimiter, distinctPanGuard } from '../lib/rateLimit.js';
import { logger } from '../lib/logger.js';

export const allotmentRouter = Router();

// A PAN is identity data, so it travels in the request body, never the URL.
// Query strings are logged verbatim by proxies, load balancers and hosting
// platforms — none of which this application controls — so a GET would leak
// every PAN it ever checked into somebody else's log retention. 1kb is far
// more than {ipo, pan} needs and bounds an unauthenticated body.
const readBody = express.json({ limit: '1kb' });

// Parse and validate first so the PAN hash exists before the PAN-aware
// limiters run. req.pan lives only for this request and is never persisted.
function parseParams(req, _res, next) {
  try {
    const body = req.body ?? {};
    req.ipoSlug = parseSlug(body.ipo);
    req.pan = parsePan(body.pan);
    req.panHash = panHash(req.pan);
    next();
  } catch (err) {
    next(err);
  }
}

// Resolve the linked GMP snapshot for a registrar IPO, if one was matched. GMP
// is unofficial grey-market data, so it is clearly namespaced and attributed.
function gmpForRegistrar(registrarSlug) {
  const link = marketSlugForRegistrar(registrarSlug);
  if (!link) return null;
  const m = latestGmpForMarket(link.market_slug);
  if (!m) return null;
  return {
    value: m.gmp,
    trend: m.gmpTrend,
    estListingPrice: m.estListingPrice,
    estGainPct: m.estGainPct,
    board: m.board,
    priceBand: m.priceBand,
    source: m.source,
    sourceUpdatedAt: m.sourceUpdatedAt,
    matchedSlug: link.market_slug,
    matchScore: link.score,
    disclaimer: 'Grey market premium is unofficial and indicative only.',
  };
}

function summarize(applications) {
  const totalApplied = applications.reduce((s, a) => s + a.sharesApplied, 0);
  const totalAllotted = applications.reduce((s, a) => s + a.sharesAllotted, 0);
  let status = 'not_allotted';
  if (totalAllotted > 0) status = totalAllotted < totalApplied ? 'partially_allotted' : 'allotted';
  return {
    status,
    applicationCount: applications.length,
    totalSharesApplied: totalApplied,
    totalSharesAllotted: totalAllotted,
  };
}

// Was a GET until the PAN was moved into the body. Answer explicitly rather
// than 404, so a stale caller is told what changed — and deliberately without
// reading req.query, which is the leak this replaced.
allotmentRouter.get('/allotment', (_req, res) => {
  res.set('Allow', 'POST').status(405).json({
    error: {
      code: 'METHOD_NOT_ALLOWED',
      message: 'Use POST with a JSON body: { "ipo": "...", "pan": "..." }. A PAN must not travel in a URL.',
    },
  });
});

allotmentRouter.post(
  '/allotment',
  allotmentIpLimiter,
  readBody,
  parseParams,
  panLimiter,
  distinctPanGuard,
  async (req, res, next) => {
    try {
      const ipo = findIpoBySlug(req.ipoSlug);
      if (!ipo) {
        throw notFound('IPO_NOT_FOUND', `No IPO known with slug "${req.ipoSlug}".`);
      }

      const registrar = getRegistrar(ipo.registrar);

      // Registrars with a server-enforced captcha cannot be queried directly.
      // Hand the caller a deep link instead of pretending we can answer.
      if (registrar.kind === 'deeplink') {
        return res.status(200).json({
          ipo: { slug: ipo.slug, name: ipo.name, registrar: ipo.registrar },
          supported: false,
          reason: 'REGISTRAR_REQUIRES_MANUAL_CHECK',
          deepLink: { label: registrar.label, url: registrar.url },
          gmp: gmpForRegistrar(ipo.slug),
          meta: { checkedAt: new Date().toISOString(), cached: false },
        });
      }

      // registrar_ref is part of the key so a corrected mapping can never
      // serve a previous IPO's cached answer.
      const cacheKey = `alt:v1:${ipo.registrar}:${ipo.registrar_ref}:${req.panHash}`;
      const cached = cacheGet(cacheKey);
      if (cached) {
        // GMP is resolved fresh on every response -- it is deliberately not part
        // of the cached allotment payload, which may live for days.
        return res.status(200).json({
          ...cached,
          gmp: gmpForRegistrar(ipo.slug),
          meta: { ...cached.meta, cached: true },
        });
      }

      const { found, records } = await registrar.client.queryByPan({
        clientId: ipo.registrar_ref,
        pan: req.pan,
      });

      const applications = registrar.client.normalizeRecords(records);
      const payload = {
        ipo: {
          slug: ipo.slug,
          name: ipo.name,
          registrar: ipo.registrar,
          allotmentStatus: ipo.allotment_status,
        },
        pan: maskPan(req.pan),
        found,
        summary: found ? summarize(applications) : null,
        applications,
        meta: {
          checkedAt: new Date().toISOString(),
          cached: false,
          source: ipo.registrar,
        },
      };

      // Finalized allotments are immutable, so they cache hard. Anything else
      // gets a short TTL because the registrar may still be publishing.
      let ttl;
      if (!found) ttl = config.cache.ttlNotFound;
      else if (ipo.allotment_status === 'finalized') ttl = config.cache.ttlFinalized;
      else ttl = config.cache.ttlPending;
      cacheSet(cacheKey, payload, ttl);

      logger.info('allotment lookup', {
        ipo: ipo.slug,
        registrar: ipo.registrar,
        found,
        ttl,
        // panHash is a keyed digest, safe to log; the PAN itself is not.
        panRef: req.panHash.slice(0, 8),
      });

      // Attach GMP after caching so the cached copy stays GMP-free and fresh
      // GMP is served on every hit.
      return res.status(200).json({ ...payload, gmp: gmpForRegistrar(ipo.slug) });
    } catch (err) {
      return next(err instanceof AppError ? err : err);
    }
  }
);
