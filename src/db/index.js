import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const here = dirname(fileURLToPath(import.meta.url));

let db;

// Columns added to market_ipos after its first release. CREATE TABLE covers
// fresh databases; this brings existing ones up to date without a migration
// framework. SQLite has no ADD COLUMN IF NOT EXISTS, so diff against pragma.
const MARKET_EXTRA_COLUMNS = {
  nse_symbol: 'TEXT',
  face_value: 'TEXT',
  issue_size: 'TEXT',
  issue_type: 'TEXT',
  lot_size: 'INTEGER',
  min_investment: 'INTEGER',
  listing_exchanges: 'TEXT',
  allotment_date: 'TEXT',
  refund_date: 'TEXT',
  listing_date: 'TEXT',
  logo_url: 'TEXT',
  listing_price: 'REAL',
  gmp_source: 'TEXT',
  details_updated_at: 'TEXT',
};

function ensureMarketColumns(d) {
  const existing = new Set(d.prepare('PRAGMA table_info(market_ipos)').all().map((c) => c.name));
  for (const [name, type] of Object.entries(MARKET_EXTRA_COLUMNS)) {
    if (!existing.has(name)) d.exec(`ALTER TABLE market_ipos ADD COLUMN ${name} ${type}`);
  }
}

// Rows from a source that is no longer configured. Dropping a source from
// GMP_SOURCES stops new rows arriving but leaves the old ones sitting in the
// table, and they keep showing up in the list -- which is exactly the duplicate
// the single-source decision was meant to end, surviving the decision. Nothing
// here is anyone's data: every row is rebuilt from the live source on the next
// sync, so removing a stale one costs a few minutes of staleness at worst.
function dropUnconfiguredSources(d) {
  const wanted = config.gmp.sources;
  if (!wanted.length) return; // Misconfiguration; emptying the table is worse.
  const placeholders = wanted.map(() => '?').join(', ');
  d.prepare(`DELETE FROM market_ipos WHERE source NOT IN (${placeholders})`).run(...wanted);
}

// Issue size must be the rupee amount a source published, never a share count.
// Rows synced before that rule carry NSE's count ("2,24,63,137 shares"), and
// nothing overwrites them -- updateMarketMeta skips nulls, so a row IPO Ji has
// not reached keeps the wrong value indefinitely. Clearing it makes the row show
// a dash until a real amount arrives, which is the honest state. Idempotent: a
// value with no rupee or crore/lakh marker is by definition not an amount.
function clearShareCountIssueSizes(d) {
  d.exec(`
    UPDATE market_ipos SET issue_size = NULL
     WHERE issue_size IS NOT NULL
       AND issue_size NOT LIKE '%₹%'
       AND lower(issue_size) NOT LIKE '%cr%'
       AND lower(issue_size) NOT LIKE '%lakh%'
       AND lower(issue_size) NOT LIKE '%crore%'`);
}

export function getDb() {
  if (db) return db;
  const path = resolve(config.dbPath);
  mkdirSync(dirname(path), { recursive: true });
  db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(readFileSync(resolve(here, 'schema.sql'), 'utf8'));
  ensureMarketColumns(db);
  clearShareCountIssueSizes(db);
  dropUnconfiguredSources(db);
  return db;
}

export function findIpoBySlug(slug) {
  return getDb()
    .prepare(
      `SELECT slug, name, registrar, registrar_ref, allotment_status, active
         FROM ipos WHERE slug = ?`
    )
    .get(slug);
}

export function listIpos({ registrar, limit = 200 } = {}) {
  const sql = registrar
    ? `SELECT slug, name, registrar, allotment_status, last_seen_at FROM ipos
         WHERE active = 1 AND registrar = ? ORDER BY last_seen_at DESC, name LIMIT ?`
    : `SELECT slug, name, registrar, allotment_status, last_seen_at FROM ipos
         WHERE active = 1 ORDER BY last_seen_at DESC, name LIMIT ?`;
  const stmt = getDb().prepare(sql);
  return registrar ? stmt.all(registrar, limit) : stmt.all(limit);
}

// Upsert keyed on (registrar, registrar_ref) -- that pair is the stable
// identity. The registrar's published list is a rolling window of recent
// IPOs, so rows that fall out of it are left in place rather than deleted.
export function upsertIpo({ slug, name, registrar, registrarRef }) {
  const d = getDb();
  const existing = d
    .prepare('SELECT id, slug, name FROM ipos WHERE registrar = ? AND registrar_ref = ?')
    .get(registrar, registrarRef);

  if (existing) {
    d.prepare(
      `UPDATE ipos SET name = ?, last_seen_at = datetime('now'), active = 1 WHERE id = ?`
    ).run(name, existing.id);
    return { action: existing.name === name ? 'unchanged' : 'updated', slug: existing.slug };
  }

  // Resolve slug collisions across different registrar refs.
  let candidate = slug;
  let n = 2;
  while (d.prepare('SELECT 1 FROM ipos WHERE slug = ?').get(candidate)) {
    candidate = `${slug}-${n++}`;
  }

  d.prepare(
    `INSERT INTO ipos (slug, name, registrar, registrar_ref) VALUES (?, ?, ?, ?)`
  ).run(candidate, name, registrar, registrarRef);
  return { action: 'inserted', slug: candidate };
}

export function recordSyncRun(row) {
  getDb()
    .prepare(
      `INSERT INTO sync_runs (registrar, source, seen, inserted, updated, ok, error)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      row.registrar,
      row.source ?? null,
      row.seen ?? 0,
      row.inserted ?? 0,
      row.updated ?? 0,
      row.ok ? 1 : 0,
      row.error ?? null
    );
}

export function markFinalized(slug, finalized = true) {
  return getDb()
    .prepare(
      `UPDATE ipos SET allotment_status = ?, finalized_at = CASE WHEN ? = 'finalized'
         THEN datetime('now') ELSE NULL END WHERE slug = ?`
    )
    .run(finalized ? 'finalized' : 'open', finalized ? 'finalized' : 'open', slug);
}

// --- Market / GMP / calendar ------------------------------------------------

// Upsert one market IPO snapshot keyed on (source, slug). Records a GMP history
// row only when the value actually changes, so the history stays meaningful.
export function upsertMarketIpo(rec) {
  const d = getDb();
  const existing = d
    .prepare('SELECT id, gmp FROM market_ipos WHERE source = ? AND slug = ?')
    .get(rec.source, rec.slug);

  if (existing) {
    d.prepare(
      `UPDATE market_ipos SET
         name = ?, board = ?, gmp = ?, gmp_trend = ?, price_band = ?,
         est_listing_price = ?, est_gain_pct = ?, open_date = ?, close_date = ?,
         status = ?, source_updated_at = ?, gmp_source = ?, last_seen_at = datetime('now')
       WHERE id = ?`
    ).run(
      rec.name, rec.board, rec.gmp ?? null, rec.gmpTrend ?? null, rec.priceBand ?? null,
      rec.estListingPrice ?? null, rec.estGainPct ?? null, rec.openDate ?? null, rec.closeDate ?? null,
      rec.status, rec.sourceUpdatedAt ?? null, rec.gmpSource ?? rec.source, existing.id
    );
    const changed = (existing.gmp ?? null) !== (rec.gmp ?? null);
    if (changed) recordGmpHistory(rec.source, rec.slug, rec.gmp ?? null);
    return { action: changed ? 'updated' : 'unchanged' };
  }

  d.prepare(
    `INSERT INTO market_ipos
       (source, slug, name, board, gmp, gmp_trend, price_band, est_listing_price,
        est_gain_pct, open_date, close_date, status, source_updated_at, gmp_source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    rec.source, rec.slug, rec.name, rec.board, rec.gmp ?? null, rec.gmpTrend ?? null,
    rec.priceBand ?? null, rec.estListingPrice ?? null, rec.estGainPct ?? null,
    rec.openDate ?? null, rec.closeDate ?? null, rec.status, rec.sourceUpdatedAt ?? null,
    rec.gmpSource ?? rec.source
  );
  recordGmpHistory(rec.source, rec.slug, rec.gmp ?? null);
  return { action: 'inserted' };
}

export function recordGmpHistory(source, slug, gmp) {
  getDb()
    .prepare('INSERT INTO gmp_history (source, slug, gmp) VALUES (?, ?, ?)')
    .run(source, slug, gmp ?? null);
}

const marketRowToApi = (r) => ({
  slug: r.slug,
  name: r.name,
  board: r.board,
  gmp: r.gmp,
  gmpTrend: r.gmp_trend,
  priceBand: r.price_band,
  estListingPrice: r.est_listing_price,
  estGainPct: r.est_gain_pct,
  openDate: r.open_date,
  closeDate: r.close_date,
  status: r.status,
  source: r.source,
  sourceUpdatedAt: r.source_updated_at,
  // Extended metadata / timeline (nullable until the detail sync fills them).
  nseSymbol: r.nse_symbol ?? null,
  faceValue: r.face_value ?? null,
  issueSize: r.issue_size ?? null,
  issueType: r.issue_type ?? null,
  lotSize: r.lot_size ?? null,
  minInvestment: r.min_investment ?? null,
  listingExchanges: r.listing_exchanges ?? null,
  allotmentDate: r.allotment_date ?? null,
  refundDate: r.refund_date ?? null,
  listingDate: r.listing_date ?? null,
  logo: r.logo_url ?? null,
  listingPrice: r.listing_price ?? null,
  // Which tracker THIS row's premium came from. Usually the row's own source;
  // different when the fallback supplied a premium the primary did not quote.
  gmpSource: r.gmp_source ?? r.source,
});

// Patch metadata/detail fields on the primary market row for a slug. Only the
// keys present in `fields` are written, so NSE and IPO Watch detail can each
// fill the parts they know without clobbering the other.
const META_COLUMNS = {
  nseSymbol: 'nse_symbol',
  faceValue: 'face_value',
  issueSize: 'issue_size',
  issueType: 'issue_type',
  lotSize: 'lot_size',
  minInvestment: 'min_investment',
  listingExchanges: 'listing_exchanges',
  allotmentDate: 'allotment_date',
  refundDate: 'refund_date',
  listingDate: 'listing_date',
  logo: 'logo_url',
  listingPrice: 'listing_price',
};

export function updateMarketMeta(slug, fields) {
  const sets = [];
  const args = [];
  for (const [key, col] of Object.entries(META_COLUMNS)) {
    if (fields[key] !== undefined && fields[key] !== null) {
      sets.push(`${col} = ?`);
      args.push(fields[key]);
    }
  }
  if (sets.length === 0) return 0;
  sets.push(`details_updated_at = datetime('now')`);
  args.push(slug);
  // Apply to every source row for this slug so the merged view is consistent.
  return getDb().prepare(`UPDATE market_ipos SET ${sets.join(', ')} WHERE slug = ?`).run(...args).changes;
}

export function upsertSubscription(rec) {
  return getDb()
    .prepare(
      `INSERT INTO subscriptions (slug, category, shares_offered, shares_bid, times_subscribed, source, source_updated_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT (slug, category) DO UPDATE SET
         shares_offered = excluded.shares_offered,
         shares_bid = excluded.shares_bid,
         times_subscribed = excluded.times_subscribed,
         source = excluded.source,
         source_updated_at = excluded.source_updated_at,
         last_seen_at = datetime('now')`
    )
    .run(
      rec.slug, rec.category, rec.sharesOffered ?? null, rec.sharesBid ?? null,
      rec.timesSubscribed ?? null, rec.source, rec.sourceUpdatedAt ?? null
    );
}

export function clearSubscription(slug) {
  return getDb().prepare('DELETE FROM subscriptions WHERE slug = ?').run(slug).changes;
}

export function getSubscription(slug) {
  return getDb()
    .prepare(
      `SELECT category, shares_offered AS sharesOffered, shares_bid AS sharesBid,
              times_subscribed AS timesSubscribed, source, source_updated_at AS sourceUpdatedAt
         FROM subscriptions WHERE slug = ? ORDER BY id`
    )
    .all(slug);
}

export function listMarketIpos({ status, board, source } = {}) {
  const where = [];
  const args = [];
  if (status) { where.push('status = ?'); args.push(status); }
  if (board) { where.push('board = ?'); args.push(board); }
  if (source) { where.push('source = ?'); args.push(source); }
  const sql =
    `SELECT * FROM market_ipos ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY (open_date IS NULL), open_date DESC, name`;
  return getDb().prepare(sql).all(...args).map(marketRowToApi);
}

export function getMarketIpoBySlug(slug) {
  return getDb()
    .prepare('SELECT * FROM market_ipos WHERE slug = ? ORDER BY last_seen_at DESC')
    .all(slug)
    .map(marketRowToApi);
}

export function getGmpHistory(slug, { source, limit = 100 } = {}) {
  const sql = source
    ? `SELECT gmp, captured_at FROM gmp_history WHERE slug = ? AND source = ?
         ORDER BY captured_at DESC LIMIT ?`
    : `SELECT gmp, source, captured_at FROM gmp_history WHERE slug = ?
         ORDER BY captured_at DESC LIMIT ?`;
  const stmt = getDb().prepare(sql);
  return source ? stmt.all(slug, source, limit) : stmt.all(slug, limit);
}

// --- Canonical IPO identity linking ----------------------------------------

// Distinct market IPOs (one per slug, newest snapshot) as { slug, name } for
// the matcher to compare registrar IPOs against.
export function distinctMarketNames() {
  return getDb()
    .prepare('SELECT slug, name FROM market_ipos GROUP BY slug')
    .all();
}

// Replace all links atomically. `links` is [{ registrarSlug, marketSlug, score }].
// Rebuilding wholesale keeps the table free of links invalidated by name drift.
export function replaceIpoLinks(links) {
  const d = getDb();
  const tx = d.prepare('BEGIN');
  try {
    tx.run();
    d.prepare('DELETE FROM ipo_links').run();
    const ins = d.prepare(
      'INSERT OR IGNORE INTO ipo_links (registrar_slug, market_slug, score) VALUES (?, ?, ?)'
    );
    for (const l of links) ins.run(l.registrarSlug, l.marketSlug, l.score);
    d.prepare('COMMIT').run();
  } catch (err) {
    d.prepare('ROLLBACK').run();
    throw err;
  }
  return links.length;
}

export function marketSlugForRegistrar(registrarSlug) {
  return getDb()
    .prepare('SELECT market_slug, score FROM ipo_links WHERE registrar_slug = ?')
    .get(registrarSlug);
}

export function registrarSlugForMarket(marketSlug) {
  return getDb()
    .prepare('SELECT registrar_slug, score FROM ipo_links WHERE market_slug = ?')
    .get(marketSlug);
}

// Latest GMP snapshot (any source, most recently seen) for a market slug.
export function latestGmpForMarket(marketSlug) {
  const row = getDb()
    .prepare(
      `SELECT * FROM market_ipos WHERE slug = ? ORDER BY last_seen_at DESC LIMIT 1`
    )
    .get(marketSlug);
  return row ? marketRowToApi(row) : null;
}
