#!/usr/bin/env node
// Pulls GMP + calendar data from the configured GMP sources into market_ipos.
//
// Run on a schedule (every 30-60 min during market hours is plenty -- GMP does
// not move faster than that). Upserts by (source, slug) and records a GMP
// history point whenever a value changes.

import { fetchAll } from '../src/gmp/index.js';
import { upsertMarketIpo, updateMarketMeta, recordSyncRun } from '../src/db/index.js';
import { logger } from '../src/lib/logger.js';

async function main() {
  try {
    const { records, sources } = await fetchAll();

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
      if (rec.issueSize || rec.lotSize || rec.logo) {
        updateMarketMeta(rec.slug, {
          issueSize: rec.issueSize,
          lotSize: rec.lotSize,
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

    const failed = sources.filter((s) => !s.ok);
    logger.info('gmp sync complete', {
      seen: records.length,
      inserted,
      updated,
      details,
      sources: sources.map((s) => `${s.id}:${s.ok ? s.count : 'FAIL'}`).join(','),
    });
    // Non-zero exit only if every source failed -- partial success is success.
    if (failed.length === sources.length && sources.length > 0) process.exitCode = 1;
  } catch (err) {
    logger.error('gmp sync failed', { message: err.message });
    process.exitCode = 1;
  }
}

main();
