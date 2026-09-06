#!/usr/bin/env node
// Seeds the IPO -> company_id mapping for Bigshare.
//
// Bigshare's data call (FetchIpodetails) verifies a human-solved captcha, so we
// never query it server-side -- these rows exist only so that /allotment can
// resolve the slug and hand back a deep link to Bigshare's own status page.
//
// The company list is server-rendered into the <select id="ddlCompany"> on the
// public status page, so no captcha is involved in reading it.

import { config } from '../src/config.js';
import { upsertIpo, recordSyncRun } from '../src/db/index.js';
import { slugify } from '../src/lib/validate.js';
import { logger } from '../src/lib/logger.js';
import { parseCompanies } from '../src/registrars/bigshare.js';

async function main() {
  const url = config.bigshare.statusPage;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`status page fetch failed: HTTP ${res.status}`);
    const companies = parseCompanies(await res.text());

    if (companies.length === 0) {
      throw new Error('no companies found -- ddlCompany markup may have changed');
    }

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
    logger.info('bigshare sync complete', { seen: companies.length, inserted, updated });
  } catch (err) {
    recordSyncRun({ registrar: 'bigshare', source: url, ok: false, error: err.message });
    logger.error('bigshare sync failed', { message: err.message });
    process.exitCode = 1;
  }
}

main();
