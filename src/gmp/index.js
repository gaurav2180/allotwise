import * as ipowatch from './ipowatch.js';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

// GMP source registry. Adding a source is one entry here plus a module exposing
// { meta, fetchGmp }. The list of major GMP sites offers no clean JSON API, so
// every source is an isolated HTML adapter and a failure in one must not sink
// the others -- fetchAll collects per-source outcomes rather than throwing.

const SOURCES = { ipowatch };

export function getSourceMeta(id) {
  return SOURCES[id]?.meta;
}

export const availableSources = Object.values(SOURCES).map((s) => ({
  id: s.meta.id,
  label: s.meta.label,
  attribution: s.meta.attribution,
}));

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
      logger.error('gmp source failed', { source: id, message: r.reason?.message });
      sources.push({ id, ok: false, error: r.reason?.message ?? 'unknown error' });
    }
  }
  return { records, sources };
}
