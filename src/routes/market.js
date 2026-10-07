import { Router } from 'express';
import { listMarketIpos, getMarketIpoBySlug, registrarSlugForMarket, getDaywise, saveDaywise } from '../db/index.js';
import { availableSources, mergeBySlug, source } from '../gmp/index.js';
import { logger } from '../lib/logger.js';
import { parseSlug } from '../lib/validate.js';
import { badRequest, notFound } from '../lib/errors.js';

export const marketRouter = Router();

const STATUSES = new Set(['upcoming', 'open', 'closed', 'listed', 'unknown']);
const BOARDS = new Set(['mainboard', 'sme']);

const attribution = availableSources.map((s) => s.attribution);

function parseFilters(query) {
  const filters = {};
  if (query.status !== undefined) {
    const s = String(query.status).toLowerCase();
    if (!STATUSES.has(s)) throw badRequest('STATUS_INVALID', `status must be one of ${[...STATUSES].join(', ')}.`);
    filters.status = s;
  }
  if (query.board !== undefined) {
    const b = String(query.board).toLowerCase();
    if (!BOARDS.has(b)) throw badRequest('BOARD_INVALID', 'board must be mainboard or sme.');
    filters.board = b;
  }
  if (query.source !== undefined) filters.source = String(query.source).toLowerCase();
  return filters;
}

// IPO calendar: every current issue with its premium and published facts.
marketRouter.get('/calendar', (req, res, next) => {
  try {
    const filters = parseFilters(req.query);
    const rows = listMarketIpos(filters);
    const ipos = filters.source ? rows : mergeBySlug(rows);
    res.json({
      count: ipos.length,
      filters,
      ipos: ipos.map((i) => {
        const link = registrarSlugForMarket(i.slug);
        return {
          slug: i.slug,
          name: i.name,
          board: i.board,
          status: i.status,
          openDate: i.openDate,
          closeDate: i.closeDate,
          allotmentDate: i.allotmentDate,
          listingDate: i.listingDate,
          priceBand: i.priceBand,
          lotSize: i.lotSize,
          issueSize: i.issueSize,
          gmp: i.gmp,
          estListingPrice: i.estListingPrice,
          estGainPct: i.estGainPct,
          subscription: i.subscription,
          source: i.source,
          gmpSource: i.gmpSource,
          sourceUpdatedAt: i.sourceUpdatedAt,
          logo: i.logo,
          listingPrice: i.listingPrice,
          allotment: link ? { available: true, ipo: link.registrar_slug } : { available: false },
          // Where to check by hand when the in-app check is not available.
          registrar: i.registrarName || i.registrarUrl ? { name: i.registrarName, url: i.registrarUrl } : null,
        };
      }),
      attribution,
    });
  } catch (err) {
    next(err);
  }
});

const DAYWISE_FRESH_S = 15 * 60;
const refreshing = new Set();

async function refreshDaywise(row) {
  if (refreshing.has(row.slug)) return null;
  refreshing.add(row.slug);
  try {
    const { history } = await source.fetchIssue(row.sourcePath);
    saveDaywise(row.slug, history);
    return history;
  } catch (err) {
    logger.warn('daywise fetch failed', { slug: row.slug, message: err.message });
    return null;
  } finally {
    refreshing.delete(row.slug);
  }
}

/**
 * The source's own day-wise table for one issue — the same feed the headline
 * premium comes from. Served from the database, which the metadata sync fills
 * while it already has the page open, so the GMP page never waits on the
 * source. A copy older than 15 minutes is refreshed in the background; only an
 * issue never read before is fetched while the caller waits.
 */
async function daywise(row) {
  if (!row.sourcePath) return [];
  const stored = getDaywise(row.slug);
  if (stored) {
    if (stored.ageSeconds > DAYWISE_FRESH_S) refreshDaywise(row);
    return stored.points;
  }
  return (await refreshDaywise(row)) ?? [];
}

// GMP list, or a single IPO's GMP with its day-wise history when ?ipo=<slug>.
marketRouter.get('/gmp', async (req, res, next) => {
  try {
    if (req.query.ipo !== undefined) {
      const slug = parseSlug(req.query.ipo);
      const rows = getMarketIpoBySlug(slug);
      if (rows.length === 0) {
        return res.status(404).json({ error: { code: 'IPO_NOT_FOUND', message: `No GMP data for "${slug}".` } });
      }
      const [row] = mergeBySlug(rows);
      return res.json({
        slug,
        name: row.name,
        gmp: rows.map((r) => ({
          value: r.gmp,
          trend: r.gmpTrend,
          estListingPrice: r.estListingPrice,
          estGainPct: r.estGainPct,
          source: r.source,
          sourceUpdatedAt: r.sourceUpdatedAt,
        })),
        daywise: await daywise(row),
        source: row.source,
        attribution,
      });
    }

    const filters = parseFilters(req.query);
    const rows = listMarketIpos(filters);
    const ipos = filters.source ? rows : mergeBySlug(rows);
    res.json({
      count: ipos.length,
      filters,
      sources: availableSources,
      gmp: ipos.map((i) => ({
        slug: i.slug,
        name: i.name,
        board: i.board,
        status: i.status,
        gmp: i.gmp,
        trend: i.gmpTrend,
        priceBand: i.priceBand,
        estListingPrice: i.estListingPrice,
        estGainPct: i.estGainPct,
        source: i.source,
        sourceUpdatedAt: i.sourceUpdatedAt,
      })),
      attribution,
    });
  } catch (err) {
    next(err);
  }
});

// Everything known about one IPO in a single call.
marketRouter.get('/ipo/:slug', (req, res, next) => {
  try {
    const slug = parseSlug(req.params.slug);
    const rows = getMarketIpoBySlug(slug);
    if (rows.length === 0) throw notFound('IPO_NOT_FOUND', `No IPO known with slug "${slug}".`);
    const [primary] = mergeBySlug(rows);
    const link = registrarSlugForMarket(slug);

    res.json({
      slug,
      name: primary.name,
      board: primary.board,
      status: primary.status,
      timeline: {
        openDate: primary.openDate,
        closeDate: primary.closeDate,
        allotmentDate: primary.allotmentDate,
        refundDate: primary.refundDate,
        listingDate: primary.listingDate,
      },
      details: {
        priceBand: primary.priceBand,
        issueSize: primary.issueSize,
        lotSize: primary.lotSize,
        listingExchanges: primary.listingExchanges,
      },
      gmp: rows.map((r) => ({
        value: r.gmp,
        trend: r.gmpTrend,
        estListingPrice: r.estListingPrice,
        estGainPct: r.estGainPct,
        source: r.source,
        sourceUpdatedAt: r.sourceUpdatedAt,
      })),
      subscription: primary.subscription !== null ? { overall: primary.subscription, source: primary.source } : null,
      allotment: link ? { available: true, ipo: link.registrar_slug } : { available: false },
      attribution,
    });
  } catch (err) {
    next(err);
  }
});
