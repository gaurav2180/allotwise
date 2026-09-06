#!/usr/bin/env node
// Builds the canonical identity links between registrar IPOs and market/GMP
// IPOs by fuzzy name matching. Run after the registrar and GMP syncs.
//
// Greedy best-first assignment: strongest matches claim their pair first, and
// each registrar/market IPO is used at most once, so a strong match cannot be
// stolen by a weaker overlapping one.

import { listIpos, distinctMarketNames, replaceIpoLinks, recordSyncRun } from '../src/db/index.js';
import { matchScore } from '../src/lib/ipoMatch.js';
import { logger } from '../src/lib/logger.js';

const THRESHOLD = 0.67;

function main() {
  try {
    const registrars = listIpos({ limit: 100000 });
    const markets = distinctMarketNames();

    // Score every plausible pair, then assign greedily by descending score.
    const pairs = [];
    for (const r of registrars) {
      for (const m of markets) {
        const score = matchScore(r.name, m.name);
        if (score >= THRESHOLD) pairs.push({ registrarSlug: r.slug, marketSlug: m.slug, score });
      }
    }
    pairs.sort((a, b) => b.score - a.score);

    const usedReg = new Set();
    const usedMkt = new Set();
    const links = [];
    for (const p of pairs) {
      if (usedReg.has(p.registrarSlug) || usedMkt.has(p.marketSlug)) continue;
      usedReg.add(p.registrarSlug);
      usedMkt.add(p.marketSlug);
      links.push({ ...p, score: Number(p.score.toFixed(3)) });
    }

    replaceIpoLinks(links);
    recordSyncRun({ registrar: 'links', source: 'fuzzy-name', seen: pairs.length, inserted: links.length, ok: true });
    logger.info('ipo linking complete', {
      registrars: registrars.length,
      markets: markets.length,
      candidatePairs: pairs.length,
      linked: links.length,
    });
  } catch (err) {
    recordSyncRun({ registrar: 'links', source: 'fuzzy-name', ok: false, error: err.message });
    logger.error('ipo linking failed', { message: err.message });
    process.exitCode = 1;
  }
}

main();
