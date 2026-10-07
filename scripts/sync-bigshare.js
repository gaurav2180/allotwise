#!/usr/bin/env node
// Seeds the IPO -> company_id mapping for Bigshare from its status page.
//
// The company list is server-rendered into <select id="ddlCompany">. Bigshare
// serves that page from several hosts and they lag one another, so the list is
// read from the first host that answers -- the same order /allotment queries
// them in, which keeps a company's id paired with a host that knows it.

import { config } from '../src/config.js';
import { upsertIpo, recordSyncRun } from '../src/db/index.js';
import { slugify } from '../src/lib/validate.js';
import { logger } from '../src/lib/logger.js';
import { parseCompanies } from '../src/registrars/bigshare.js';

async function readCompanies(url) {
  const res = await fetch(url, { headers: { 'User-Agent': config.gmp.userAgent } });
  if (!res.ok) throw new Error(`status page fetch failed: HTTP ${res.status}`);
  const companies = parseCompanies(await res.text());
  if (companies.length === 0) throw new Error('no companies found -- ddlCompany markup may have changed');
  return companies;
}

async function main() {
  let url;
  try {
    let companies;
    let lastErr;
    for (url of config.bigshare.statusPages) {
      try {
        companies = await readCompanies(url);
        break;
      } catch (err) {
        lastErr = err;
        logger.warn('bigshare host failed', { host: new URL(url).host, message: err.message });
      }
    }
    if (!companies) throw lastErr;

    let inserted = 0;
    let updated = 0;
    for (const c of companies) {
      const { action } = upsertIpo({
        slug: slugify(c.name),
        name: c.name,
        registrar: 'bigshare',
        registrarRef: c.id,
      });
      if (action === 'inserted') inserted++;
      else if (action === 'updated') updated++;
    }

    recordSyncRun({ registrar: 'bigshare', source: url, seen: companies.length, inserted, updated, ok: true });
    logger.info('bigshare sync complete', { host: new URL(url).host, seen: companies.length, inserted, updated });
  } catch (err) {
    recordSyncRun({ registrar: 'bigshare', source: url, ok: false, error: err.message });
    logger.error('bigshare sync failed', { message: err.message });
    process.exitCode = 1;
  }
}

main();
