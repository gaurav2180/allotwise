#!/usr/bin/env node
// Fills market_ipos from the one market source's live table: which IPOs exist,
// their premium, price, lot, issue size, subscription, dates and debut price.
//
// Run every 30-60 min; GMP does not move faster than that. Upserts by
// (source, slug) and records a history point whenever the premium moves.

import { fetchAll } from '../src/gmp/index.js';
import { upsertMarketIpo, updateMarketMeta, recordSyncRun, clearStaleGmp } from '../src/db/index.js';
import { logger } from '../src/lib/logger.js';

async function main() {
  try {
    const { records, sources } = await fetchAll();

    let inserted = 0;
    let updated = 0;
    for (const rec of records) {
      const { action } = upsertMarketIpo(rec);
      if (action === 'inserted') inserted++;
      else if (action === 'updated') updated++;

      updateMarketMeta(rec.slug, {
        issueSize: rec.issueSize,
        lotSize: rec.lotSize,
        allotmentDate: rec.allotmentDate,
        listingDate: rec.listingDate,
        listingPrice: rec.listingPrice,
        listingExchanges: rec.listingExchanges,
        sourcePath: rec.sourcePath,
        subscription: rec.subscription,
      });
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

    // Rows that have dropped off the live table keep their facts but lose their
    // premium: nothing updates it any more. Guarded on a successful fetch -- an
    // empty list here would clear the table.
    const staleCleared = sources.every((s) => s.ok) ? clearStaleGmp(records.map((r) => r.slug)) : 0;

    logger.info('gmp sync complete', {
      seen: records.length,
      inserted,
      updated,
      quoted: records.filter((r) => r.gmp !== null).length,
      staleCleared,
      source: sources.map((s) => `${s.id}:${s.ok ? s.count : 'FAIL'}`).join(','),
    });
    if (sources.some((s) => !s.ok)) process.exitCode = 1;
  } catch (err) {
    logger.error('gmp sync failed', { message: err.message });
    process.exitCode = 1;
  }
}

main();
