import { Router } from 'express';
import {
  listMarketIpos,
  getMarketIpoBySlug,
  getGmpHistory,
  registrarSlugForMarket,
  getSubscription,
} from '../db/index.js';
import { availableSources } from '../gmp/index.js';
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

// IPO calendar: dates + status, GMP included for convenience.
marketRouter.get('/calendar', (req, res, next) => {
  try {
    const filters = parseFilters(req.query);
    const ipos = listMarketIpos(filters);
    res.json({
      count: ipos.length,
      filters,
      ipos: ipos.map((i) => {
        // Reverse link: can the user check allotment for this IPO here?
        const link = registrarSlugForMarket(i.slug);
        return {
          slug: i.slug,
          name: i.name,
          board: i.board,
          status: i.status,
          openDate: i.openDate,
          closeDate: i.closeDate,
          priceBand: i.priceBand,
          gmp: i.gmp,
          estListingPrice: i.estListingPrice,
          estGainPct: i.estGainPct,
          source: i.source,
          allotment: link ? { available: true, ipo: link.registrar_slug } : { available: false },
        };
      }),
      attribution,
    });
  } catch (err) {
    next(err);
  }
});

// GMP list, or a single IPO's GMP (with history) when ?ipo=<slug> is given.
marketRouter.get('/gmp', (req, res, next) => {
  try {
    if (req.query.ipo !== undefined) {
      const slug = parseSlug(req.query.ipo);
      const rows = getMarketIpoBySlug(slug);
      if (rows.length === 0) {
        return res.status(404).json({ error: { code: 'IPO_NOT_FOUND', message: `No GMP data for "${slug}".` } });
      }
      return res.json({
        slug,
        name: rows[0].name,
        // One entry per source, so cross-source GMP can be compared.
        gmp: rows.map((r) => ({
          value: r.gmp,
          trend: r.gmpTrend,
          estListingPrice: r.estListingPrice,
          estGainPct: r.estGainPct,
          source: r.source,
          sourceUpdatedAt: r.sourceUpdatedAt,
        })),
        history: getGmpHistory(slug, { limit: 60 }),
        attribution,
      });
    }

    const filters = parseFilters(req.query);
    const ipos = listMarketIpos(filters);
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

// Live subscription (bidding) figures for one IPO.
marketRouter.get('/subscription', (req, res, next) => {
  try {
    const slug = parseSlug(req.query.ipo ?? '');
    const rows = getSubscription(slug);
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ error: { code: 'SUBSCRIPTION_NOT_FOUND', message: `No subscription data for "${slug}".` } });
    }
    const total = rows.find((r) => r.category === 'Total');
    res.json({
      slug,
      overall: total ? total.timesSubscribed : null,
      categories: rows,
      source: 'NSE',
      note: 'Mainboard only; SME issues are not covered by this source.',
    });
  } catch (err) {
    next(err);
  }
});

// Unified IPO view: everything known about one IPO in a single call -- the
// natural backing for a product IPO-detail page.
marketRouter.get('/ipo/:slug', (req, res, next) => {
  try {
    const slug = parseSlug(req.params.slug);
    const rows = getMarketIpoBySlug(slug);
    if (rows.length === 0) throw notFound('IPO_NOT_FOUND', `No IPO known with slug "${slug}".`);
    const primary = rows[0];
    const subs = getSubscription(slug);
    const total = subs.find((s) => s.category === 'Total');
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
        faceValue: primary.faceValue,
        issueSize: primary.issueSize,
        issueType: primary.issueType,
        lotSize: primary.lotSize,
        minInvestment: primary.minInvestment,
        listingExchanges: primary.listingExchanges,
        nseSymbol: primary.nseSymbol,
      },
      gmp: rows.map((r) => ({
        value: r.gmp,
        trend: r.gmpTrend,
        estListingPrice: r.estListingPrice,
        estGainPct: r.estGainPct,
        source: r.source,
        sourceUpdatedAt: r.sourceUpdatedAt,
      })),
      subscription: subs.length
        ? { overall: total ? total.timesSubscribed : null, categories: subs, source: 'NSE' }
        : null,
      allotment: link ? { available: true, ipo: link.registrar_slug } : { available: false },
      attribution,
    });
  } catch (err) {
    next(err);
  }
});
