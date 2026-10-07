#!/usr/bin/env node
// Reads each issue's own page on the market source for what the live table
// does not print -- the full price band, the exchanges, the logo -- and its
// day-wise GMP table, stored so the GMP page never waits on the source.
//
// Visited: every issue not yet listed (its history is still growing), plus any
// listed one still missing a fact. Open issues first, with a pause between
// pages to stay a light visitor.

import { config } from '../src/config.js';
import { listMarketIpos, updateMarketMeta, saveDaywise, recordSyncRun } from '../src/db/index.js';
import { mergeBySlug, source } from '../src/gmp/index.js';
import { logger } from '../src/lib/logger.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RANK = { open: 0, upcoming: 1, closed: 2, listed: 3 };

const hasRange = (band) => /\d\s*(?:to|-|–)\s*₹?\s*\d/.test(String(band ?? ''));
const capOf = (s) => Math.max(...[...String(s).replace(/,/g, '').matchAll(/\d+(?:\.\d+)?/g)].map(Number));

async function main() {
  const targets = mergeBySlug(listMarketIpos())
    .filter((i) => i.sourcePath)
    .filter((i) => i.status !== 'listed' || !i.logo || !i.listingExchanges || !i.registrarUrl)
    .sort((a, b) => (RANK[a.status] ?? 4) - (RANK[b.status] ?? 4))
    .slice(0, config.gmp.detailFetchLimit);

  let ok = 0;
  let failed = 0;
  for (const ipo of targets) {
    try {
      const page = await source.fetchIssue(ipo.sourcePath);
      updateMarketMeta(ipo.slug, {
        logo: page.logo,
        listingExchanges: ipo.listingExchanges ?? page.listingExchanges,
        registrarName: page.registrarName,
        registrarUrl: page.registrarUrl,
      });
      // A page band is kept only when its cap agrees with the live table's price.
      if (page.priceBand && hasRange(page.priceBand) && (!ipo.priceBand || capOf(ipo.priceBand) === capOf(page.priceBand))) {
        updateMarketMeta(ipo.slug, { priceBand: page.priceBand });
      }
      saveDaywise(ipo.slug, page.history);
      ok++;
    } catch (err) {
      failed++;
      logger.warn('issue page fetch failed', { slug: ipo.slug, message: err.message });
    }
    await sleep(1200);
  }

  recordSyncRun({ registrar: 'meta', source: source.meta.id, seen: targets.length, updated: ok, ok: failed === 0 || ok > 0 });
  logger.info('metadata sync complete', { targets: targets.length, ok, failed });
}

main().catch((err) => {
  recordSyncRun({ registrar: 'meta', source: source.meta.id, ok: false, error: err.message });
  logger.error('metadata sync failed', { message: err.message });
  process.exitCode = 1;
});
