#!/usr/bin/env node
// Builds the IPO -> client_id mapping from KFintech's published frontend bundle.
//
// The mapping is not exposed by any API, but it is not hidden either: the
// bundle ships it as a plain JSON array. The bundle filename is content-hashed
// and changes whenever they add an IPO, so resolve it from index.html rather
// than pinning a hash.
//
// The list is a rolling window of recent IPOs -- older ones drop out. This
// upserts and never deletes, so the local mapping accumulates history.

import { config } from '../src/config.js';
import { upsertIpo, recordSyncRun } from '../src/db/index.js';
import { slugify } from '../src/lib/validate.js';
import { logger } from '../src/lib/logger.js';

const NEEDLE = "JSON.parse('";

// KFintech's host answers a request without a browser User-Agent with its
// index.html for every path, so the bundle fetch came back as HTML and the
// sync found no IPOs at all — which left every KFintech issue uncheckable.
const HEADERS = { 'User-Agent': config.gmp.userAgent, Accept: '*/*' };

async function resolveBundleUrl() {
  const res = await fetch(config.kfintech.bundleIndex, { redirect: 'follow', headers: HEADERS });
  if (!res.ok) throw new Error(`index fetch failed: HTTP ${res.status}`);
  const html = await res.text();
  const m = html.match(/src="\.?\/?(static\/js\/main\.[a-f0-9]+\.js)"/i);
  if (!m) throw new Error('could not locate main bundle in index.html');
  return new URL(m[1], config.kfintech.bundleIndex).toString();
}

function extractClients(src) {
  const out = [];
  let idx = 0;
  while ((idx = src.indexOf(NEEDLE, idx)) !== -1) {
    const start = idx + NEEDLE.length;
    const end = src.indexOf("')", start);
    if (end === -1) break;
    const raw = src.slice(start, end);
    idx = end + 2;
    if (!raw.includes('clientId')) continue;
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) out.push(...arr);
    } catch {
      // Not the array we are after; keep scanning.
    }
  }
  return out.filter((x) => x && x.clientId && x.name);
}

async function main() {
  let bundleUrl = null;
  try {
    bundleUrl = await resolveBundleUrl();
    logger.info('resolved bundle', { bundleUrl });

    const res = await fetch(bundleUrl, { headers: HEADERS });
    if (!res.ok) throw new Error(`bundle fetch failed: HTTP ${res.status}`);
    const entries = extractClients(await res.text());

    if (entries.length === 0) {
      throw new Error('no clientId entries found -- bundle structure may have changed');
    }

    let inserted = 0;
    let updated = 0;
    for (const e of entries) {
      const name = String(e.name).trim();
      const { action } = upsertIpo({
        slug: slugify(name),
        name,
        registrar: 'kfintech',
        registrarRef: String(e.clientId).trim(),
      });
      if (action === 'inserted') inserted++;
      else if (action === 'updated') updated++;
    }

    recordSyncRun({ registrar: 'kfintech', source: bundleUrl, seen: entries.length, inserted, updated, ok: true });
    logger.info('kfintech sync complete', { seen: entries.length, inserted, updated });
  } catch (err) {
    recordSyncRun({ registrar: 'kfintech', source: bundleUrl, ok: false, error: err.message });
    logger.error('kfintech sync failed', { message: err.message });
    process.exitCode = 1;
  }
}

main();
