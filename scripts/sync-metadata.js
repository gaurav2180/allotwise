#!/usr/bin/env node
// Enriches market_ipos with full metadata + timeline.
//
//   NSE           -> nse_symbol, issue size, official open/close dates
//   IPO Watch     -> face value, issue type, lot size, min investment,
//                    listing exchanges, and the allotment/refund/listing dates
//
// NSE is matched to existing (IPO Watch-seeded) market IPOs by fuzzy name.
// Detail-page fetches are bounded to upcoming/open IPOs so we do not hammer
// IPO Watch or trip Cloudflare.

import { config } from '../src/config.js';
import { distinctMarketNames, listMarketIpos, updateMarketMeta, recordSyncRun } from '../src/db/index.js';
import { bestMatch } from '../src/lib/ipoMatch.js';
import * as nse from '../src/market/nse.js';
import { fetchDetails } from '../src/gmp/ipowatch.js';
import { logger } from '../src/lib/logger.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function syncNse() {
  const markets = distinctMarketNames();
  const meta = await nse.fetchMetadata();
  let matched = 0;
  for (const rec of meta) {
    const m = bestMatch(rec.name, markets);
    if (!m) continue;
    updateMarketMeta(m.slug, {
      nseSymbol: rec.symbol,
      issueSize: rec.issueSizeShares ? `${Number(rec.issueSizeShares).toLocaleString('en-IN')} shares` : undefined,
    });
    matched++;
  }
  return { seen: meta.length, matched };
}

async function syncDetails() {
  // Only IPOs a user is actively watching need fresh details.
  const targets = listMarketIpos()
    .filter((i) => i.status === 'upcoming' || i.status === 'open')
    .slice(0, config.gmp.detailFetchLimit);

  let ok = 0;
  let failed = 0;
  for (const ipo of targets) {
    try {
      const details = await fetchDetails(`${ipo.slug}-ipo`);
      updateMarketMeta(ipo.slug, details);
      ok++;
    } catch (err) {
      failed++;
      logger.warn('detail fetch failed', { slug: ipo.slug, message: err.message });
    }
    // Be gentle between page loads.
    await sleep(1200);
  }
  return { targets: targets.length, ok, failed };
}

async function main() {
  try {
    let nseResult = { seen: 0, matched: 0 };
    try {
      nseResult = await syncNse();
    } catch (err) {
      logger.warn('nse metadata sync failed', { message: err.message });
    }

    const detailResult = await syncDetails();

    recordSyncRun({
      registrar: 'meta',
      source: 'nse+ipowatch',
      seen: nseResult.seen,
      inserted: nseResult.matched,
      updated: detailResult.ok,
      ok: true,
    });
    logger.info('metadata sync complete', {
      nseSeen: nseResult.seen,
      nseMatched: nseResult.matched,
      detailTargets: detailResult.targets,
      detailOk: detailResult.ok,
      detailFailed: detailResult.failed,
    });
  } catch (err) {
    recordSyncRun({ registrar: 'meta', source: 'nse+ipowatch', ok: false, error: err.message });
    logger.error('metadata sync failed', { message: err.message });
    process.exitCode = 1;
  }
}

main();
