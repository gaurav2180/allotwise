#!/usr/bin/env node
// Fills market_ipos, in two passes with different jobs.
//
//   fetchAll    the calendar: which IPOs exist and every published fact about
//               them. Exactly one source, because a second one renames issues
//               and the list doubles.
//   resolveGmp  the premium, from a prioritised chain, the same chain for every
//               board. Values only, onto rows the calendar has already created.
//
// Run every 30-60 min during market hours; GMP does not move faster than that.
// Upserts by (source, slug) and records a history point whenever a value moves.

import { fetchAll, resolveGmp } from '../src/gmp/index.js';
import { upsertMarketIpo, updateMarketMeta, recordSyncRun, clearStaleGmp } from '../src/db/index.js';
import { logger } from '../src/lib/logger.js';

async function main() {
  try {
    const { records, sources } = await fetchAll();

    // Every row's premium, re-resolved from the chain -- including rows the
    // calendar quoted itself, so the board never decides the tracker.
    const gmp = await resolveGmp(records);

    let inserted = 0;
    let updated = 0;
    let details = 0;
    for (const rec of records) {
      const { action } = upsertMarketIpo(rec);
      if (action === 'inserted') inserted++;
      else if (action === 'updated') updated++;

      // IPO Ji's calendar cards already state the issue size and lot size, so
      // take them here rather than making the metadata sync fetch a detail page
      // per issue for facts we have just been handed. That sync still runs --
      // it covers the allotment and listing dates, which the cards omit -- but
      // only for the issues anyone is waiting on.
      if (rec.issueSize || rec.lotSize || rec.logo || rec.listingPrice) {
        updateMarketMeta(rec.slug, {
          issueSize: rec.issueSize,
          lotSize: rec.lotSize,
          // What the share opened at. Known only after listing, and the figure
          // that supersedes every forecast once it is.
          listingPrice: rec.listingPrice,
          // The card names the company's logo outright. The frontend previously
          // had to guess it, fuzzy-matching image filenames against company
          // names, which left about one issue in five on a monogram tile.
          logo: rec.logo,
        });
        details++;
      }
    }

    for (const s of sources) {
      recordSyncRun({
        registrar: `gmp:${s.id}`,
        source: s.id,
        seen: s.count ?? 0,
        inserted: s.ok ? undefined : 0,
        ok: s.ok,
        error: s.error ?? null,
      });
    }

    // Rows that have fallen off the calendar keep their facts but lose their
    // premium: nothing re-resolves them, so it would sit there indefinitely.
    // Guarded on a successful fetch -- an empty list here would clear the table.
    const staleCleared = sources.every((s) => s.ok) ? clearStaleGmp(records.map((r) => r.slug)) : 0;

    const failed = sources.filter((s) => !s.ok);
    logger.info('gmp sync complete', {
      seen: records.length,
      inserted,
      updated,
      details,
      gmpResolved: gmp.resolved,
      gmpBy: Object.entries(gmp.byId).map(([k, v]) => `${k}:${v}`).join(',') || 'none',
      staleCleared,
      calendar: sources.map((s) => `${s.id}:${s.ok ? s.count : 'FAIL'}`).join(','),
    });
    // Non-zero exit only if every source failed -- partial success is success.
    if (failed.length === sources.length && sources.length > 0) process.exitCode = 1;
  } catch (err) {
    logger.error('gmp sync failed', { message: err.message });
    process.exitCode = 1;
  }
}

main();
