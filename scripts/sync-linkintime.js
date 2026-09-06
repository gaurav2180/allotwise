#!/usr/bin/env node
// Builds the IPO -> company_id mapping for Link Intime (MUFG Intime).
//
// Unlike KFintech, MUFG exposes the mapping directly: GetDetails returns the
// currently-listed IPOs as an XML DataSet. Same upsert-never-delete rule --
// the list is a rolling window of open/recent issues.

import { config } from '../src/config.js';
import { upsertIpo, recordSyncRun } from '../src/db/index.js';
import { slugify } from '../src/lib/validate.js';
import { logger } from '../src/lib/logger.js';

function parseCompanies(xml) {
  const out = [];
  const tableRe = /<Table>([\s\S]*?)<\/Table>/g;
  let m;
  while ((m = tableRe.exec(xml)) !== null) {
    const id = m[1].match(/<company_id>([\s\S]*?)<\/company_id>/)?.[1]?.trim();
    const name = m[1].match(/<companyname>([\s\S]*?)<\/companyname>/)?.[1]?.trim();
    if (id && name) out.push({ id, name });
  }
  return out;
}

async function main() {
  const url = `${config.linkintime.apiBase}/IPO.aspx/GetDetails`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: `${config.linkintime.apiBase}/public-issues.html`,
      },
      body: '{}',
    });
    if (!res.ok) throw new Error(`GetDetails failed: HTTP ${res.status}`);
    const body = await res.json();
    const companies = parseCompanies(body?.d ?? '');

    if (companies.length === 0) {
      throw new Error('no companies returned -- GetDetails shape may have changed');
    }

    let inserted = 0;
    let updated = 0;
    for (const c of companies) {
      // Names carry a trailing " - IPO" / " - SME IPO"; slugify already drops it.
      const { action } = upsertIpo({
        slug: slugify(c.name),
        name: c.name,
        registrar: 'linkintime',
        registrarRef: c.id,
      });
      if (action === 'inserted') inserted++;
      else if (action === 'updated') updated++;
    }

    recordSyncRun({ registrar: 'linkintime', source: url, seen: companies.length, inserted, updated, ok: true });
    logger.info('linkintime sync complete', { seen: companies.length, inserted, updated });
  } catch (err) {
    recordSyncRun({ registrar: 'linkintime', source: url, ok: false, error: err.message });
    logger.error('linkintime sync failed', { message: err.message });
    process.exitCode = 1;
  }
}

main();
