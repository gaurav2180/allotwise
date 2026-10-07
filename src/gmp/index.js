import * as investorgain from './investorgain.js';
import { logger } from '../lib/logger.js';

// One market-data source, for every board and every field.
//
// There used to be a calendar source and a premium chain beside it, and the
// web app scraped two more sites on top. Every figure on a row could come from
// a different tracker, they disagreed, and the screen showed the disagreement:
// a premium from one site, a band from another, a chart from a third. Now the
// list, the premium, the band, the timeline and the day-wise history all come
// from InvestorGain, so nothing on a row can contradict anything else on it.

export const source = investorgain;

export function getSourceMeta(id) {
  return id === investorgain.meta.id ? investorgain.meta : undefined;
}

export const availableSources = [
  { id: investorgain.meta.id, label: investorgain.meta.label, attribution: investorgain.meta.attribution },
];

/**
 * Collapse rows sharing a slug into one. With a single source this only
 * matters for a database still holding rows written before the switch.
 */
export function mergeBySlug(rows) {
  const bySlug = new Map();
  for (const row of rows) {
    const prev = bySlug.get(row.slug);
    if (!prev || (row.source === investorgain.meta.id && prev.source !== investorgain.meta.id)) {
      bySlug.set(row.slug, row);
    }
  }
  return [...bySlug.values()];
}

/** Every current IPO with its premium, from the one source. Never throws. */
export async function fetchAll({ ref = new Date() } = {}) {
  const id = investorgain.meta.id;
  try {
    const records = await investorgain.fetchGmp({ ref });
    return { records, sources: [{ id, ok: true, count: records.length }] };
  } catch (err) {
    logger.error('market source failed', {
      source: id,
      message: err.message || err.name || 'unknown error',
      cause: err.cause?.code ?? err.cause?.message ?? null,
    });
    return { records: [], sources: [{ id, ok: false, error: err.message ?? 'unknown error' }] };
  }
}
