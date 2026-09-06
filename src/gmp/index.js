import * as ipowatch from './ipowatch.js';
import * as ipoji from './ipoji.js';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

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

/** Position in the configured priority order; unconfigured sources sort last. */
function sourceRank(id) {
  const i = config.gmp.sources.indexOf(id);
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
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
 * Fetch every configured source. Returns { records, sources } where sources
 * reports per-source ok/error/count so the caller can surface partial results.
 */
export async function fetchAll({ ref = new Date() } = {}) {
  const wanted = config.gmp.sources.filter((id) => SOURCES[id]);
  const results = await Promise.allSettled(
    wanted.map((id) => SOURCES[id].fetchGmp({ ref }).then((records) => ({ id, records })))
  );

  const records = [];
  const sources = [];
  for (const [i, r] of results.entries()) {
    const id = wanted[i];
    if (r.status === 'fulfilled') {
      records.push(...r.value.records);
      sources.push({ id, ok: true, count: r.value.records.length });
    } else {
      // undici puts the transport failure on `cause` and leaves the outer
      // message generic, so logging only `message` produced entries that said a
      // source had failed without saying how -- a timeout and a 403 read the
      // same, which is the difference between "be patient" and "stop asking".
      logger.error('gmp source failed', {
        source: id,
        message: r.reason?.message || r.reason?.name || 'unknown error',
        cause: r.reason?.cause?.code ?? r.reason?.cause?.message ?? null,
      });
      sources.push({ id, ok: false, error: r.reason?.message ?? 'unknown error' });
    }
  }
  return { records, sources };
}
