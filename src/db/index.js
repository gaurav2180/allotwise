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
  min_application_shares: 'INTEGER',
  min_application_lots: 'INTEGER',
  details_updated_at: 'TEXT',
  // The issue's page on the source, where its band and day-wise history live.
  source_path: 'TEXT',
  // Overall times subscribed, as the source reports it for every board.
  subscription: 'REAL',
  // The issue page's day-wise GMP table, as JSON, and when it was read.
  daywise_json: 'TEXT',
  daywise_at: 'TEXT',
  // The issue's registrar and its own allotment-status page, as published.
  registrar_name: 'TEXT',
  registrar_url: 'TEXT',
};

// The one source rows come from. See src/gmp/index.js.
const MARKET_SOURCE = 'investorgain';

function ensureMarketColumns(d) {
  const existing = new Set(d.prepare('PRAGMA table_info(market_ipos)').all().map((c) => c.name));
  for (const [name, type] of Object.entries(MARKET_EXTRA_COLUMNS)) {
    if (!existing.has(name)) d.exec(`ALTER TABLE market_ipos ADD COLUMN ${name} ${type}`);
  }
}

// Rows from a source that has been retired. They would otherwise sit in the
// list beside the live source's rows for the same issue, named differently.
// Nothing here is anyone's data: every row is rebuilt from the live source on
// the next sync.
function dropUnconfiguredSources(d) {
  d.prepare('DELETE FROM market_ipos WHERE source != ?').run(MARKET_SOURCE);
  d.prepare('DELETE FROM gmp_history WHERE source != ?').run(MARKET_SOURCE);
}

const capOf = (band) => {
  const nums = [...String(band ?? '').replace(/,/g, '').matchAll(/\d+(?:\.\d+)?/g)].map(Number).filter((n) => n > 0);
  return nums.length ? Math.max(...nums) : null;
};

// The live table states only the cap ("₹75"); the issue page states the band
// ("₹70 to ₹75"). They describe one price as long as the caps agree, so the
// fuller one is kept rather than overwritten every half hour.
function keepFullerBand(existing, incoming) {
  if (!existing || !incoming) return incoming ?? existing ?? null;
  return capOf(existing) === capOf(incoming) && existing.length > incoming.length ? existing : incoming;
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
    .prepare('SELECT id, gmp, price_band FROM market_ipos WHERE source = ? AND slug = ?')
    .get(rec.source, rec.slug);

  if (existing) {
    rec = { ...rec, priceBand: keepFullerBand(existing.price_band, rec.priceBand) };
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
    if (changed) recordGmpHistory(rec.gmpSource ?? rec.source, rec.slug, rec.gmp ?? null);
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
  recordGmpHistory(rec.gmpSource ?? rec.source, rec.slug, rec.gmp ?? null);
  return { action: 'inserted' };
}

/**
 * Drop the premium from rows this sync's calendar no longer carries.
 *
 * A row that has fallen off the calendar is never re-resolved, so it keeps
 * whatever premium it last had -- forever, and computed by whatever rules were
 * in force at the time. Four such rows survived a sourcing change with rounded
 * percentages that no longer matched their own band (₹210 on a ₹1,785 cap shown
 * as 12% rather than 11.76%), which reads as an arithmetic bug in the live list
 * rather than as the stale record it is.
 *
 * The facts stay: name, dates, band, issue size, listing price. Those were true
 * when published and remain true. Only the forecast is cleared, because a
 * forecast nobody is updating is not a forecast.
 *
 * Callers must pass the slugs from a SUCCESSFUL fetch. On a failed one the set
 * is empty and this would wipe every premium in the table.
 */
export function clearStaleGmp(liveSlugs) {
  if (!liveSlugs?.length) return 0;
  const placeholders = liveSlugs.map(() => '?').join(', ');
  return getDb()
    .prepare(
      `UPDATE market_ipos
          SET gmp = NULL, est_gain_pct = NULL, est_listing_price = NULL, gmp_source = NULL
        WHERE slug NOT IN (${placeholders})
          AND (gmp IS NOT NULL OR est_gain_pct IS NOT NULL OR est_listing_price IS NOT NULL)`
    )
    .run(...liveSlugs).changes;
}

/**
 * Delete rows a live row has replaced under a new slug.
 *
 * The source renames an issue now and then -- "Bonfigloli Transmissions" was
 * corrected to "Bonfiglioli Transmissions" -- and the new name slugs to a new
 * row while the old one lingers as a dateless duplicate. The issue page id at
 * the end of the source path does not change with the name, so a row that
 * shares it with a live row is the same issue. As a fallback for rows saved
 * before the path was recorded: a dateless, unquoted row whose name is a live
 * row's name give or take two letters.
 *
 * Like clearStaleGmp, callers must pass the records of a SUCCESSFUL fetch.
 */
function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export function dropSupersededMarketRows(liveRecords) {
  if (!liveRecords?.length) return 0;
  const d = getDb();
  const issueId = (p) => String(p ?? '').match(/\/(\d+)\/?$/)?.[1] ?? null;
  const live = new Set(liveRecords.map((r) => r.slug));
  const liveRows = d
    .prepare(`SELECT slug, name, source_path FROM market_ipos WHERE slug IN (${[...live].map(() => '?').join(', ')})`)
    .all(...live);
  const liveIds = new Set(liveRows.map((r) => issueId(r.source_path)).filter(Boolean));
  const liveNames = liveRows.map((r) => r.name.toLowerCase());

  const doomed = d
    .prepare('SELECT slug, name, source_path, open_date, gmp FROM market_ipos')
    .all()
    .filter((r) => !live.has(r.slug))
    .filter((r) => {
      const id = issueId(r.source_path);
      if (id) return liveIds.has(id);
      if (r.open_date !== null || r.gmp !== null) return false;
      const name = r.name.toLowerCase();
      return liveNames.some((n) => editDistance(n, name) <= 2);
    })
    .map((r) => r.slug);

  for (const slug of doomed) {
    d.prepare('DELETE FROM market_ipos WHERE slug = ?').run(slug);
    d.prepare('DELETE FROM gmp_history WHERE slug = ?').run(slug);
    d.prepare('DELETE FROM ipo_links WHERE market_slug = ?').run(slug);
  }
  return doomed.length;
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
  // Straight from the issue's own application table, not derived.
  minApplicationShares: r.min_application_shares ?? null,
  minApplicationLots: r.min_application_lots ?? null,
  listingExchanges: r.listing_exchanges ?? null,
  allotmentDate: r.allotment_date ?? null,
  refundDate: r.refund_date ?? null,
  listingDate: r.listing_date ?? null,
  logo: r.logo_url ?? null,
  listingPrice: r.listing_price ?? null,
  gmpSource: r.gmp_source ?? r.source,
  sourcePath: r.source_path ?? null,
  subscription: r.subscription ?? null,
  registrarName: r.registrar_name ?? null,
  registrarUrl: r.registrar_url ?? null,
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
  minApplicationShares: 'min_application_shares',
  minApplicationLots: 'min_application_lots',
  listingExchanges: 'listing_exchanges',
  allotmentDate: 'allotment_date',
  refundDate: 'refund_date',
  listingDate: 'listing_date',
  logo: 'logo_url',
  listingPrice: 'listing_price',
  sourcePath: 'source_path',
  subscription: 'subscription',
  priceBand: 'price_band',
  registrarName: 'registrar_name',
  registrarUrl: 'registrar_url',
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

export function getAlertState(key) {
  const row = getDb()
    .prepare(
      `SELECT value, CAST((strftime('%s','now') - strftime('%s', updated_at)) / 60 AS INTEGER) AS ageMinutes
         FROM alert_state WHERE key = ?`
    )
    .get(key);
  return row ? { value: row.value, ageMinutes: row.ageMinutes } : null;
}

export function setAlertState(key, value) {
  getDb()
    .prepare(
      `INSERT INTO alert_state (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .run(key, String(value));
}

/**
 * The latest run of every sync and self-test, with its age and the last time
 * it succeeded -- what lets /health say that a source has gone quiet instead
 * of leaving someone to notice a missing button.
 */
export function latestSyncRuns() {
  return getDb()
    .prepare(
      `SELECT s.registrar, s.ok, s.seen, s.error,
              CAST((strftime('%s','now') - strftime('%s', s.ran_at)) / 60 AS INTEGER) AS ageMinutes,
              (SELECT CAST((strftime('%s','now') - strftime('%s', MAX(g.ran_at))) / 60 AS INTEGER)
                 FROM sync_runs g WHERE g.registrar = s.registrar AND g.ok = 1) AS lastOkMinutes
         FROM sync_runs s
         JOIN (SELECT registrar, MAX(id) AS mid FROM sync_runs GROUP BY registrar) m ON s.id = m.mid`
    )
    .all();
}

/** Store an issue's day-wise GMP table, as read from its page. */
export function saveDaywise(slug, points) {
  return getDb()
    .prepare(`UPDATE market_ipos SET daywise_json = ?, daywise_at = datetime('now') WHERE slug = ?`)
    .run(JSON.stringify(points ?? []), slug).changes;
}

/** The stored day-wise table and its age in seconds, or null if never read. */
export function getDaywise(slug) {
  const row = getDb()
    .prepare(
      `SELECT daywise_json, CAST(strftime('%s','now') - strftime('%s', daywise_at) AS INTEGER) AS age
         FROM market_ipos WHERE slug = ? AND daywise_json IS NOT NULL
        ORDER BY last_seen_at DESC LIMIT 1`
    )
    .get(slug);
  if (!row) return null;
  try {
    return { points: JSON.parse(row.daywise_json), ageSeconds: row.age ?? Infinity };
  } catch {
    return null;
  }
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
