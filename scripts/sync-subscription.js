#!/usr/bin/env node
// Pulls live subscription (bidding) figures from NSE for every mainboard IPO
// that (a) has been matched to an NSE symbol and (b) is open or recently closed
// -- the only window where the numbers move. Run frequently during market hours.
//
// SME issues live on NSE Emerge / BSE SME and are not covered here.

import { listMarketIpos, upsertSubscription, clearSubscription, recordSyncRun } from '../src/db/index.js';
import * as nse from '../src/market/nse.js';
import { logger } from '../src/lib/logger.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  try {
    const targets = listMarketIpos().filter(
      (i) => i.nseSymbol && (i.status === 'open' || i.status === 'closed')
    );

    let ok = 0;
    let empty = 0;
    let failed = 0;
    for (const ipo of targets) {
      try {
        const { rows, updateTime } = await nse.fetchSubscription(ipo.nseSymbol);
        if (rows.length === 0) {
          empty++;
        } else {
          // Replace the IPO's rows so a category that disappears upstream does
          // not linger as a stale figure.
          clearSubscription(ipo.slug);
          for (const r of rows) {
            upsertSubscription({ slug: ipo.slug, ...r, source: 'nse', sourceUpdatedAt: updateTime });
          }
          ok++;
        }
      } catch (err) {
        failed++;
        logger.warn('subscription fetch failed', { slug: ipo.slug, symbol: ipo.nseSymbol, message: err.message });
      }
      await sleep(600);
    }

    recordSyncRun({ registrar: 'subscription', source: 'nse', seen: targets.length, updated: ok, ok: true });
    logger.info('subscription sync complete', { targets: targets.length, ok, empty, failed });
  } catch (err) {
    recordSyncRun({ registrar: 'subscription', source: 'nse', ok: false, error: err.message });
    logger.error('subscription sync failed', { message: err.message });
    process.exitCode = 1;
  }
}

main();
