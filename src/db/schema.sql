-- IPO -> registrar reference mapping.
-- registrar_ref holds KFintech's client_id (opaque string, not numeric-safe).
CREATE TABLE IF NOT EXISTS ipos (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  slug                   TEXT NOT NULL UNIQUE,
  name                   TEXT NOT NULL,
  registrar              TEXT NOT NULL,
  registrar_ref          TEXT NOT NULL,
  -- 'open' while allotment may still change, 'finalized' once basis of
  -- allotment is published. Drives how long a result may be cached.
  allotment_status       TEXT NOT NULL DEFAULT 'open'
                           CHECK (allotment_status IN ('open', 'finalized')),
  finalized_at           TEXT,
  active                 INTEGER NOT NULL DEFAULT 1,
  first_seen_at          TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at           TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (registrar, registrar_ref)
);

CREATE INDEX IF NOT EXISTS idx_ipos_registrar ON ipos (registrar, active);

-- Audit of sync runs against the registrar's published mapping.
CREATE TABLE IF NOT EXISTS sync_runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  registrar     TEXT NOT NULL,
  source        TEXT,
  seen          INTEGER NOT NULL DEFAULT 0,
  inserted      INTEGER NOT NULL DEFAULT 0,
  updated       INTEGER NOT NULL DEFAULT 0,
  ok            INTEGER NOT NULL DEFAULT 1,
  error         TEXT,
  ran_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- NOTE: there is deliberately no table for lookups, PANs, or results.

-- Market/tracker view of an IPO: calendar + latest GMP snapshot.
-- Keyed on (source, slug) so multiple GMP sources can carry the same IPO and be
-- compared. Unlike the registrar `ipos` table this is public, non-PII data.
CREATE TABLE IF NOT EXISTS market_ipos (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  source              TEXT NOT NULL,
  slug                TEXT NOT NULL,
  name                TEXT NOT NULL,
  board               TEXT NOT NULL DEFAULT 'mainboard'
                        CHECK (board IN ('mainboard', 'sme')),
  gmp                 INTEGER,
  gmp_trend           TEXT,
  price_band          TEXT,
  est_listing_price   INTEGER,
  est_gain_pct        REAL,
  open_date           TEXT,
  close_date          TEXT,
  status              TEXT NOT NULL DEFAULT 'unknown'
                        CHECK (status IN ('upcoming', 'open', 'closed', 'listed', 'unknown')),
  source_updated_at   TEXT,
  -- Extended metadata + timeline, filled by the metadata sync (NSE + IPO Watch
  -- detail pages). All nullable: a freshly-seen IPO has GMP/calendar fields
  -- before its detail page is fetched. For existing databases these are added
  -- idempotently at boot (see ensureMarketColumns).
  nse_symbol          TEXT,
  face_value          TEXT,
  issue_size          TEXT,
  issue_type          TEXT,
  lot_size            INTEGER,
  min_investment      INTEGER,
  listing_exchanges   TEXT,
  allotment_date      TEXT,
  refund_date         TEXT,
  listing_date        TEXT,
  details_updated_at  TEXT,
  first_seen_at       TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (source, slug)
);

CREATE INDEX IF NOT EXISTS idx_market_status ON market_ipos (status, board);
CREATE INDEX IF NOT EXISTS idx_market_slug ON market_ipos (slug);

-- Live subscription (bidding) figures, latest snapshot per (slug, category).
-- Sourced from NSE. Category is QIB / NII / Retail / Total etc.
CREATE TABLE IF NOT EXISTS subscriptions (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  slug               TEXT NOT NULL,
  category           TEXT NOT NULL,
  shares_offered     REAL,
  shares_bid         REAL,
  times_subscribed   REAL,
  source             TEXT NOT NULL,
  source_updated_at  TEXT,
  last_seen_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (slug, category)
);

CREATE INDEX IF NOT EXISTS idx_subs_slug ON subscriptions (slug);

-- Append-only GMP history: one row per (source, slug) each time the GMP value
-- changes, so the product can chart the grey-market trend over an IPO's run.
CREATE TABLE IF NOT EXISTS gmp_history (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  source        TEXT NOT NULL,
  slug          TEXT NOT NULL,
  gmp           INTEGER,
  captured_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_gmp_history ON gmp_history (source, slug, captured_at);

-- Canonical identity link between a registrar IPO (ipos.slug) and a market/GMP
-- IPO (market_ipos.slug), computed by fuzzy name matching. One registrar IPO
-- maps to at most one market IPO and vice versa, so both columns are unique.
-- Rebuilt wholesale each link run, so no stale link survives a name change.
CREATE TABLE IF NOT EXISTS ipo_links (
  registrar_slug   TEXT NOT NULL UNIQUE,
  market_slug      TEXT NOT NULL UNIQUE,
  score            REAL NOT NULL,
  linked_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
