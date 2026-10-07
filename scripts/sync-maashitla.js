#!/usr/bin/env node
// Seeds the IPO -> company_slug mapping for Maashitla from its public company
// directory. Upserts and never deletes: the directory is a rolling window.

import { upsertIpo, recordSyncRun } from '../src/db/index.js';
import { slugify } from '../src/lib/validate.js';
import { logger } from '../src/lib/logger.js';
import { fetchCompanies } from '../src/registrars/maashitla.js';

async function main() {
  try {
    const companies = await fetchCompanies();
    if (companies.length === 0) throw new Error('company directory is empty');

    let inserted = 0;
    let updated = 0;
    for (const c of companies) {
      const { action } = upsertIpo({ slug: slugify(c.name), name: c.name, registrar: 'maashitla', registrarRef: c.id });
      if (action === 'inserted') inserted++;
      else if (action === 'updated') updated++;
    }
    recordSyncRun({ registrar: 'maashitla', source: 'company-directory', seen: companies.length, inserted, updated, ok: true });
    logger.info('maashitla sync complete', { seen: companies.length, inserted, updated });
  } catch (err) {
    recordSyncRun({ registrar: 'maashitla', source: 'company-directory', ok: false, error: err.message });
    logger.error('maashitla sync failed', { message: err.message });
    process.exitCode = 1;
  }
}

main();
