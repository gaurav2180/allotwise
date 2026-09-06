#!/usr/bin/env node
// Enriches market_ipos with full metadata + timeline.
//
//   NSE        -> nse_symbol, official open/close dates
//   IPO Ji     -> issue size, lot size, min investment, listing exchanges,
//                 and the allotment/listing dates
//   IPO Watch  -> the same, as a fallback, plus face value and issue type
//
// NSE is matched to existing market IPOs by fuzzy name. Detail-page fetches are
// bounded to upcoming/open IPOs -- those are the only ones anyone is waiting on,
// and it keeps the request rate low enough to stay a good citizen.

import { config } from '../src/config.js';
import { distinctMarketNames, listMarketIpos, updateMarketMeta, recordSyncRun } from '../src/db/index.js';
import { bestMatch } from '../src/lib/ipoMatch.js';
import * as nse from '../src/market/nse.js';
import * as ipoji from '../src/gmp/ipoji.js';
import { fetchDetails as fetchIpowatchDetails } from '../src/gmp/ipowatch.js';
import { logger } from '../src/lib/logger.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function syncNse() {
  const markets = distinctMarketNames();
  const meta = await nse.fetchMetadata();
  let matched = 0;
  for (const rec of meta) {
    const m = bestMatch(rec.name, markets);
    if (!m) continue;
    // Symbol only. NSE publishes the issue size as a share count, and a count is
    // not the figure investors compare issues by -- multiplying it out does not
    // reproduce the published rupee amount either, because anchor and
    // market-maker carve-outs sit outside it. The detail sync supplies the
    // amount as published.
    updateMarketMeta(m.slug, { nseSymbol: rec.symbol });
    matched++;
  }
  return { seen: meta.length, matched };
}

async function syncDetails() {
  // Only IPOs a user is actively watching need fresh details. One row per slug:
  // market_ipos holds a row per GMP source, so with more than one source
  // configured the same issue appears twice and would otherwise spend the fetch
  // budget pulling the same page again.
  const bySlug = new Map();
  for (const i of listMarketIpos()) {
    if (i.status !== 'upcoming' && i.status !== 'open') continue;
    if (!bySlug.has(i.slug)) bySlug.set(i.slug, i);
  }
  const targets = [...bySlug.values()].slice(0, config.gmp.detailFetchLimit);

  let ok = 0;
  let failed = 0;
  const bySource = { ipoji: 0, ipowatch: 0 };

  for (const ipo of targets) {
    // IPO Ji first: it publishes the issue size as the rupee amount rather than
    // a share count, and it has stayed reachable while IPO Watch has not. IPO
    // Watch still covers issues IPO Ji has not indexed, so it stays as a
    // fallback rather than being dropped.
    let details = null;
    let from = null;
    try {
      const slug = await ipoji.resolveSlug(ipo.name, bestMatch);
      if (slug) {
        details = await ipoji.fetchDetails(slug);
        from = 'ipoji';
      }
    } catch (err) {
      logger.warn('ipoji detail fetch failed', { slug: ipo.slug, message: err.message });
    }

    if (!details) {
      try {
        details = await fetchIpowatchDetails(`${ipo.slug}-ipo`);
        from = 'ipowatch';
      } catch (err) {
        logger.warn('ipowatch detail fetch failed', {
          slug: ipo.slug,
          message: err.message,
          cause: err.cause?.code ?? null,
        });
      }
    }

    if (details) {
      updateMarketMeta(ipo.slug, details);
      bySource[from]++;
      ok++;
    } else {
      failed++;
    }
    // Be gentle between page loads.
    await sleep(1200);
  }
  return { targets: targets.length, ok, failed, bySource };
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
      source: 'nse+ipoji+ipowatch',
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
      detailBySource: Object.entries(detailResult.bySource)
        .map(([k, v]) => `${k}:${v}`)
        .join(','),
    });
  } catch (err) {
    recordSyncRun({ registrar: 'meta', source: 'nse+ipoji+ipowatch', ok: false, error: err.message });
    logger.error('metadata sync failed', { message: err.message });
    process.exitCode = 1;
  }
}

main();
