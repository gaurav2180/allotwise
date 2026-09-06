# Allotwise — allotment service

Backend for IPO allotment-status lookups. KFintech and Link Intime (MUFG Intime)
are queryable; Bigshare deep-links to the registrar. All route through one
`/allotment` endpoint (see *Registrars*).

## Quick start

```bash
npm install
cp .env.example .env          # set PAN_HASH_SECRET before anything real
npm run migrate
npm run sync                  # populates the IPO -> registrar-ref mapping (all registrars)
npm start
```

Per-registrar sync is also available: `npm run sync:kfintech`,
`npm run sync:linkintime`.

```bash
curl -X POST http://localhost:3000/allotment \
  -H 'content-type: application/json' \
  -d '{"ipo":"tempsens-instruments-india","pan":"ABCDE1234F"}'
```

## Endpoints

| Endpoint | Purpose |
| --- | --- |
| `POST /allotment` `{ipo, pan}` | Allotment status for one PAN in one IPO (with GMP). POST, not GET: a PAN in a query string is logged verbatim by proxies and hosts. |
| `GET /ipo/<slug>` | **Unified IPO view**: timeline, details, GMP, subscription, allotment link |
| `GET /calendar[?status=&board=]` | IPO calendar: dates + status (with GMP) |
| `GET /gmp[?board=&status=]` | Live grey-market premium list |
| `GET /gmp?ipo=<slug>` | One IPO's GMP across sources, with history |
| `GET /subscription?ipo=<slug>` | Live subscription (× subscribed) by category |
| `GET /ipos[?registrar=kfintech]` | Registrar-mapped IPOs and their slugs |
| `GET /health` | DB, cache, and rate-limiter state |

`GET /ipo/<slug>` is the one call a product IPO-detail page needs: it returns
the full timeline (open/close/allotment/refund/listing), details (price band,
face value, issue size/type, lot size, min investment, listing exchanges, NSE
symbol), GMP across sources, live subscription by category, and whether
allotment can be checked here.

`status` is `upcoming\|open\|closed\|listed`; `board` is `mainboard\|sme`.

Response:

```json
{
  "ipo": { "slug": "…", "name": "…", "registrar": "kfintech", "allotmentStatus": "open" },
  "pan": "ABCD****4F",
  "found": true,
  "summary": {
    "status": "not_allotted",
    "applicationCount": 1,
    "totalSharesApplied": 50,
    "totalSharesAllotted": 0
  },
  "applications": [
    {
      "applicationNumber": "…",
      "applicantName": "…",
      "dpClientId": "…",
      "sharesApplied": 50,
      "sharesAllotted": 0,
      "status": "not_allotted"
    }
  ],
  "meta": { "checkedAt": "…", "cached": false, "source": "kfintech" }
}
```

`summary.status` and per-application `status` are one of `allotted`,
`partially_allotted`, `not_allotted`. `found: false` means the PAN has no
application in that IPO — a 200, not an error.

Errors are `{ "error": { "code", "message" } }`. Codes: `PAN_REQUIRED`,
`PAN_INVALID`, `IPO_REQUIRED`, `IPO_INVALID`, `IPO_NOT_FOUND`, `RATE_LIMITED`,
`DISTINCT_PAN_LIMIT`, `UPSTREAM_RATE_LIMITED`, `UPSTREAM_TIMEOUT`,
`UPSTREAM_ERROR`, `REGISTRAR_UNSUPPORTED`.

## The IPO → client_id mapping

KFintech's status endpoint needs a per-IPO `client_id`. There is no API for the
list, but it is **not** hidden: their frontend bundle ships it as a plain JSON
array. `npm run sync:kfintech` resolves the current bundle from `index.html`
(the filename is content-hashed and changes whenever they add an IPO — it moved
twice during initial development, so never pin a hash), extracts the array, and
upserts it.

Two properties matter:

- **The published list is a rolling window** of recent IPOs; older ones drop
  out. The sync therefore **upserts and never deletes**, so the local table
  accumulates history the registrar no longer serves.
- **Identity is `(registrar, registrar_ref)`**, not the slug. Slug collisions
  get a numeric suffix rather than overwriting an existing IPO.

Run it on a schedule (hourly is plenty) and around any IPO open.

## Caching

In memory only, never on disk — results carry the applicant's name and demat
ID, so persisting them would undo the pass-through posture below. Keys are
`registrar : registrar_ref : HMAC(pan)`; including `registrar_ref` means a
corrected mapping can never serve a previous IPO's answer.

TTLs: `CACHE_TTL_FINALIZED` (7d) once an IPO is marked finalized — a finalized
allotment is immutable; `CACHE_TTL_PENDING` (2m) while still `open`;
`CACHE_TTL_NOT_FOUND` (5m), short because the registrar may not have published
yet. Mark an IPO finalized via `markFinalized(slug)` in `src/db/index.js` to
promote it to the long TTL.

## PAN handling (DPDP posture)

The PAN is request-scoped: validated, HMAC'd for keys, sent upstream, discarded.
It is never written to the database and never logged.

- No table stores PANs, lookups, or results — by design, see `schema.sql`.
- Cache and rate-limit keys use `HMAC-SHA256(pan, PAN_HASH_SECRET)`, truncated.
  Rotating the secret invalidates every derived key at once.
- Responses echo the PAN masked (`ABCD****4F`), never in full.
- `src/lib/logger.js` scrubs anything PAN-shaped from every log line regardless
  of who logged it, and drops fields named `pan`/`reqparam` outright. This is a
  control, not a convention — a future careless `logger.info(req.query)` still
  cannot leak. Covered by a test.

Set `PAN_HASH_SECRET` to a long random value in production; the service refuses
to boot without it when `NODE_ENV=production`.

## Rate limiting

Both queryable registrars return a person's **name** for any PAN submitted.
An open proxy in front of them is a PAN → name lookup oracle, so the limits are
about enumeration, not just load:

| Limiter | Default | Purpose |
| --- | --- | --- |
| Global per IP | 200 / 15m | Baseline abuse control |
| `/allotment` per IP | 20 / 15m | Volume |
| Per PAN (all callers) | 30 / 1h | Stops a distributed crawl concentrating on one person |
| **Distinct PANs per IP** | **10 / 1h** | **The anti-enumeration control** |

The last one is the one that matters. Volume limits alone do not prevent
walking the PAN space — what constrains that is how many *different* PANs one
caller may ask about. A genuine user checks a handful. IPv6 clients are keyed
on their `/64` so address rotation within an allocation cannot reset the budget.

Outbound, a semaphore (`KFINTECH_MAX_CONCURRENCY`, default 4) prevents a burst
of user requests fanning out into a burst against the registrar, with
exponential backoff on 429/5xx — mirroring what their own frontend does.

Behind a proxy, set `TRUST_PROXY_HOPS` to the number of trusted hops or every
caller shares one bucket.

## Registrars

`src/registrars/index.js` splits registrars two ways. Every `api` module exposes
the same pair — `queryByPan({ clientId, pan }) -> { found, records }` and
`normalizeRecords(records)` — so the route is registrar-agnostic and every
registrar returns the identical normalized shape.

| Registrar | Mode | Notes |
| --- | --- | --- |
| KFintech | `api` | `client_id` header + PAN in `reqparam`. Mapping scraped from the frontend bundle. |
| Link Intime (MUFG Intime) | `api` | ASP.NET page; captcha is dead code (client validation commented out) and the token that nominally gates the call is not verified server-side. Mapping comes from a live `GetDetails` endpoint. |
| Bigshare | `deeplink` | Captcha **is** enforced: `FetchIpodetails` verifies a human-solved answer against an HMAC in the token. No honest automated answer, so `/allotment` returns 200 with `supported: false` and a `deepLink`. Its IPO list is still seeded (from the server-rendered `ddlCompany` dropdown) so slugs resolve. |

For a deep-link registrar the route returns the registrar's own page rather than
a scraped result — the IPO name is in the payload so the UI can tell the user
which company to select. If Bigshare ever drops its captcha it moves to `api` by
adding `queryByPan`/`normalizeRecords` to its module — nothing in the route
changes.

These three cover the large majority of Indian mainboard and SME issues. Smaller
registrars (Cameo, Skyline, Maashitla, Purva) can be added the same way: an
`api` module if their data call is open, otherwise a `deeplink` entry plus a
seeding parser.

## GMP + calendar

The tracker side (`/calendar`, `/gmp`) is fed by `market_ipos`, populated by
`npm run sync:gmp` from GMP source adapters in `src/gmp/`. Each adapter exposes
`{ meta, fetchGmp }` and is isolated: a parse failure in one source is reported
per-source and never sinks the others (`fetchAll` uses `Promise.allSettled`).

**Sources.** Unlike the registrars, the major GMP sites offer no clean JSON API
— InvestorGain and IPO Ji (Chittorgarh) are Next.js SPAs that render GMP into
the DOM. **IPO Watch** is the exception and the current source: it
server-renders clean HTML tables that carry GMP *and* calendar fields
(dates, status, price band, est. listing + gain%) in one fetch, for both
mainboard and SME. Adding a second source is one registry entry plus an adapter.

**GMP is unofficial** grey-market data. Every record is stamped with `source`
and the site's own "last updated" text, and every response carries an
`attribution` array — surface it in the UI.

**Scraping posture.** `robots.txt` allows `/` and the content-signal permits
reference use, but the sites sit behind Cloudflare, which serves empty bodies to
non-browser user agents — so the fetcher presents a browser UA (configurable via
`GMP_USER_AGENT`). Good-citizen behaviour is kept where it matters: sync
infrequently (30–60 min; GMP does not move faster), cache, retry on Cloudflare's
intermittent empty responses, and attribute. Do **not** run the sync in a tight
loop — repeated rapid fetches are what trip the bot filter.

**Dates.** IPO Watch prints compact ranges like `28-1 Sept` (open 28th of the
previous month, close 1 Sept — the month label is the close date's). `parseDateRange`
in `src/lib/marketDates.js` resolves these to ISO dates, inferring the year.

**GMP history.** `gmp_history` gets an append-only row whenever a value changes,
so the product can chart an IPO's grey-market trend over its run.

## Metadata, timeline, and subscription

`npm run sync:meta` and `npm run sync:subscription` fill the rest of an IPO card:

- **NSE** (`src/market/nse.js`) — official JSON, the source for **subscription**
  (`ipo-active-category?symbol=`, QIB/NII/Retail/Total × subscribed) and core
  metadata (symbol, issue size, dates). NSE gates `/api` behind a session cookie,
  so the adapter primes a cookie jar from the homepage and reuses it. **Mainboard
  only** — SME issues are on NSE Emerge / BSE SME and are not wired yet.
- **IPO Watch detail pages** — the full timeline (allotment/refund/listing dates),
  lot size, min investment, face value, issue type, listing exchanges. Fetched
  only for `upcoming`/`open` IPOs, bounded by `GMP_DETAIL_FETCH_LIMIT`, with a
  delay between pages.

NSE records are matched to existing market IPOs with the same fuzzy matcher used
for registrar links. Subscription is stored as the latest snapshot per
`(slug, category)` and replaced wholesale each sync so a vanished category never
lingers. A partly-detailed upcoming IPO (source page still says "TBA") yields
partial fields rather than an error.

## Scheduler

`npm run scheduler` runs the syncs on intervals in a standalone process — the
recommended production setup. Each job runs its sync **script in a child
process**, so a crash never touches the web server and the DB is written by a
short-lived process. Jobs are overlap-guarded (a slow run skips its next tick).
Defaults: registrar+GMP+metadata+link chain hourly, GMP every 30 min,
subscription every 20 min (tune via `SCHEDULER_*`). Alternatively set
`SCHEDULER_ENABLED=true` to run it inside `npm start`.

This closes the loop your question raised: once scheduled, a newly-opened IPO
appears in `/calendar` and `/ipo/<slug>` on the next cycle — with dates,
details, GMP, and (mainboard) subscription — with no manual step.

## Canonical IPO identity (registrar ↔ GMP)

A registrar IPO ("ESDS Software Solution Limited - IPO") and a GMP IPO
("ESDS Software") are the same issue under different names, so a canonical link
joins them. `src/lib/ipoMatch.js` scores name pairs by token-set containment
(an abbreviated name still matches its fuller form) with guards against
one-shared-filler-word false positives ("Annu Projects" vs "Skyline Projects"
scores below the link threshold). `npm run link:ipos` runs after the syncs,
assigns pairs greedily by descending score into `ipo_links` (rebuilt wholesale
each run, both sides unique), and is the last step of `npm run sync`.

What the link buys, both directions:
- **`/allotment`** carries a `gmp` block for the queried IPO (value, trend, est.
  listing + gain%, price band, source, match score, disclaimer) — including on
  the Bigshare deep-link response. GMP is resolved fresh per request, never
  baked into the cached allotment payload.
- **`/calendar`** marks each IPO with `allotment: { available, ipo }` so the UI
  knows which issues can be checked and the exact slug to call.

GMP data is namespaced under `gmp` and carries its unofficial-data disclaimer;
keep it visually distinct from the official allotment result in any UI.

**Link Intime robustness note:** the token handshake (`generateToken` → AES with
a hardcoded key → echo) is reproduced faithfully even though the server does not
currently check it, so re-enabled *token* validation would keep working. If MUFG
additionally re-enables the *captcha*, this registrar should be moved to
`deeplink` — do not add a captcha solver.

## Upstream behaviour (observed)

**KFintech** — `GET .../query?type=pan`, `client_id` + `reqparam` headers:

| Condition | Response |
| --- | --- |
| PAN has an application | `200 {"data":[…]}` |
| PAN has none | `404 {"error":"Record Not Found"}` |
| Unknown `client_id` | `500 {"error":"Unexpected error"}` — usually a stale mapping row, not an outage |
| Throttled | `429` |

Bundle query types are `pan`, `dpclid`, `appno`; only `pan` is implemented. For
`dpclid`, NSDL IDs are prefixed `IN` and CDSL are sent raw.

**Link Intime / MUFG** — `POST IPO.aspx/SearchOnPan`, JSON body
`{clientid, PAN, IFSC, CHKVAL, token}`; response is an XML DataSet inside JSON `d`:

| Condition | Response |
| --- | --- |
| PAN has an application | `200` with `<NewDataSet><Table>…</Table></NewDataSet>` |
| PAN has none | `200` with `<NewDataSet />` |
| `token` field absent | `500` (the only thing that actually errors) |

`CHKVAL` selects mode (`1` = PAN); only PAN is implemented. Company mapping is
`POST IPO.aspx/GetDetails`.

**Bigshare** — not queried (captcha enforced). Its data call is
`POST Data.aspx/FetchIpodetails` with `CaptchaToken` + `CaptchaAnswer`; the
company list for seeding comes from the `<select id="ddlCompany">` on the status
page. Node's fetch validates its TLS chain fine even though some CLIs (curl)
reject it for a missing intermediate.

## Tests

```bash
npm test                                   # offline, no registrar contact
ALLOTWISE_LIVE=1 ALLOTWISE_TEST_PAN=<pan> npm test    # adds 2 live tests (bash)
```

PowerShell: `$env:ALLOTWISE_LIVE=1; $env:ALLOTWISE_TEST_PAN='<pan>'; npm test`

Live tests are opt-in so CI never depends on the registrar being up.

## Notes

- Uses the built-in `node:sqlite` (Node ≥ 22.5), so there is no native module to
  compile on Windows. It is still flagged experimental upstream; the scripts
  silence the warning. `better-sqlite3` is a drop-in swap if that matters.
- SQLite is fine at this scale. The only hot query is a slug lookup on a table
  of a few hundred rows.
