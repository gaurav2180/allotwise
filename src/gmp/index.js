import * as ipowatch from './ipowatch.js';
import * as ipoji from './ipoji.js';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { bestMatch } from '../lib/ipoMatch.js';

// GMP source registry. Adding a source is one entry here plus a module exposing
// { meta, fetchGmp }. The list of major GMP sites offers no clean JSON API, so
// every source is an isolated HTML adapter and a failure in one must not sink
// the others -- fetchAll collects per-source outcomes rather than throwing.

const SOURCES = { ipoji, ipowatch };

export function getSourceMeta(id) {
  return SOURCES[id]?.meta;
}

export const availableSources = Object.values(SOURCES).map((s) => ({
  id: s.meta.id,
  label: s.meta.label,
  attribution: s.meta.attribution,
}));

/** Highest number in a price band — the cap, which applications are priced at. */
function capPrice(band) {
  const nums = [...String(band ?? '').replace(/,/g, '').matchAll(/(\d+(?:\.\d+)?)/g)]
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n) && n > 0);
  return nums.length ? Math.max(...nums) : null;
}

/**
 * Decide every row's premium, from one prioritised chain, for every board.
 *
 * This replaces a split where the calendar source's own premium was taken as
 * authoritative and a second tracker only filled the gaps. That made the
 * *board* decide the source in practice -- IPO Ji quotes almost no SME, so SME
 * rows came from IPO Watch and mainboard rows from IPO Ji -- and two rows in
 * one list could not then be compared with each other.
 *
 * So the calendar's premium is cleared first and re-resolved like any other:
 * every row goes through the same chain in the same order whatever its board.
 * Measured live, IPO Watch quoted 15 of 15 SME issues against IPO Ji's 2, and
 * the two tied at 11 of 25 on mainboard, so IPO Watch leads and IPO Ji is the
 * second link rather than the default.
 *
 * Three rules hold regardless of which link answers:
 *
 *   - Values only. A source here never adds, renames or removes an IPO -- the
 *     calendar alone decides what exists -- so the chain cannot duplicate a row
 *     however long it gets.
 *   - Only the premium is taken. The percentage and the indicative listing
 *     price are recomputed from *our* price band, because the trackers disagree
 *     (Spectraa: ₹45 against ₹67) and pairing one's premium with another's
 *     arithmetic would print a number nobody published.
 *   - Each row records which tracker answered, so a mixed list is still honest
 *     row by row.
 *
 * `preloaded` lets the calendar source's already-fetched records serve as its
 * own link without a second request; `injected` is for tests.
 */
export async function resolveGmp(records, { preloaded = {}, injected } = {}) {
  // What the calendar carried, kept so its source can still act as a link.
  const carried = new Map();
  for (const r of records) {
    if (r.gmp !== null && r.gmp !== undefined) {
      carried.set(r.slug, { slug: r.slug, name: r.name, gmp: r.gmp });
    }
    r.gmp = null;
    r.estGainPct = null;
    r.estListingPrice = null;
    r.gmpSource = null;
  }
  const pools = { ...preloaded, [config.gmp.calendarSource]: [...carried.values()] };

  const chain = injected
    ? [{ id: injected.meta?.id ?? 'injected', source: injected }]
    : config.gmp.sources
        .filter((id) => SOURCES[id] || pools[id])
        .map((id) => ({ id, source: SOURCES[id] }));

  const byId = {};
  let resolved = 0;

  for (const { id, source } of chain) {
    // Only what is still unanswered: an earlier link always wins, and a link
    // is skipped entirely once nothing is left for it.
    const missing = records.filter((r) => r.gmp === null);
    if (!missing.length) break;

    let candidates = pools[id];
    if (!candidates) {
      try {
        candidates = await source.fetchGmp();
      } catch (err) {
        // A tracker being down costs its link, never the rows.
        logger.warn('gmp source unavailable', { source: id, message: err.message });
        continue;
      }
    }

    const pool = candidates
      .filter((c) => c.gmp !== null && c.gmp !== undefined)
      .map((c) => ({ slug: c.slug, name: c.name, gmp: c.gmp }));
    if (!pool.length) continue;

    let fromThis = 0;
    for (const row of missing) {
      const hit = bestMatch(row.name, pool);
      if (!hit) continue;
      const gmp = pool.find((c) => c.slug === hit.slug)?.gmp;
      if (gmp === undefined) continue;

      const cap = capPrice(row.priceBand);
      row.gmp = gmp;
      row.gmpSource = id;
      row.estGainPct = cap ? Number(((gmp / cap) * 100).toFixed(2)) : null;
      row.estListingPrice = cap ? Number((cap + gmp).toFixed(2)) : null;
      fromThis++;
    }
    if (fromThis) byId[id] = fromThis;
    resolved += fromThis;
  }

  return { resolved, byId, chain: chain.map((c) => c.id) };
}

// Rows now only ever come from the calendar source, so this is a safety net for
// a database still holding rows from a source that has since been retired.
function sourceRank(id) {
  return id === config.gmp.calendarSource ? 0 : 1;
}

// Fields that are one source's quote and only make sense together. Taking the
// premium from one tracker and the indicative price from another would produce
// a row that no source actually published -- and the two disagree often enough
// for that to be visible (Qualiance: IPO Watch ₹55, IPO Ji ₹40).
const QUOTE_FIELDS = ['gmp', 'gmpTrend', 'estListingPrice', 'estGainPct', 'source', 'sourceUpdatedAt'];

/**
 * Collapse the per-source rows `market_ipos` holds into one row per IPO.
 *
 * The table keys on (source, slug), so an IPO carried by two trackers is two
 * rows -- correct for storage, wrong for a list, where it would simply appear
 * twice. The winner is the highest-priority source that actually quotes a
 * premium, since a configured-but-silent source should not outrank one with an
 * answer. Its quote is taken whole; only the descriptive fields it happens to
 * be missing are filled in from the others.
 */
export function mergeBySlug(rows) {
  const bySlug = new Map();
  for (const row of rows) {
    const list = bySlug.get(row.slug);
    if (list) list.push(row);
    else bySlug.set(row.slug, [row]);
  }

  const out = [];
  for (const list of bySlug.values()) {
    const ordered = [...list].sort((a, b) => sourceRank(a.source) - sourceRank(b.source));
    const base = ordered.find((r) => r.gmp !== null && r.gmp !== undefined) ?? ordered[0];
    const merged = { ...base };
    for (const other of ordered) {
      if (other === base) continue;
      for (const [key, value] of Object.entries(other)) {
        if (QUOTE_FIELDS.includes(key)) continue;
        if (merged[key] === null || merged[key] === undefined) merged[key] = value;
      }
    }
    out.push(merged);
  }
  return out;
}

/**
 * The calendar: every IPO that exists, from exactly one source.
 *
 * Only `calendarSource` is fetched here. It used to iterate the GMP source list,
 * which meant adding a tracker for its premiums also added it as a row source --
 * and two row sources put the same issue in the list twice whenever they named
 * it differently. Premiums are a separate pass (`resolveGmp`); this decides what
 * exists, and nothing else can.
 *
 * The per-source outcome shape is kept so callers can still report a failure,
 * even though the list is now always one entry long.
 */
export async function fetchAll({ ref = new Date() } = {}) {
  const id = config.gmp.calendarSource;
  const source = SOURCES[id];
  if (!source) {
    logger.error('calendar source unknown', { source: id, known: Object.keys(SOURCES).join(',') });
    return { records: [], sources: [{ id, ok: false, error: `unknown source "${id}"` }] };
  }

  try {
    const records = await source.fetchGmp({ ref });
    return { records, sources: [{ id, ok: true, count: records.length }] };
  } catch (err) {
    logger.error('calendar source failed', {
      source: id,
      message: err.message || err.name || 'unknown error',
      cause: err.cause?.code ?? err.cause?.message ?? null,
    });
    return { records: [], sources: [{ id, ok: false, error: err.message ?? 'unknown error' }] };
  }
}
