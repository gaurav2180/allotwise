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
| `GET /gmp?ipo=<slug>` | One IPO's GMP with its day-wise history |
| `GET /ipos[?registrar=kfintech]` | Registrar-mapped IPOs and their slugs |
| `GET /health` | DB, cache, and rate-limiter state |

`GET /ipo/<slug>` returns the timeline (open/close/allotment/listing), details
(price band, issue size, lot size, exchanges), GMP, overall subscription, and
whether allotment can be checked here.

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

**All of that keys on the caller's address, so the address has to be real.**
`X-Forwarded-For` is a claim by whoever connected, and trusting it by hop count
(`TRUST_PROXY_HOPS`) is sound only while every request arrives through our own
proxy. Set `PROXY_SHARED_SECRET` to the same value on the backend and the
frontend and the header is honoured only from a caller presenting it
(`src/lib/clientIp.js`); everything else is keyed on the socket address, which
cannot be forged. Without it, anything that can reach the backend directly walks
past every per-IP budget — including the distinct-PAN guard — by changing one
header per request.

`TRUST_PROXY_HOPS` remains the fallback when no shared secret is configured, and
is ignored when one is.

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

## Market data: one source

Everything on the IPO screen except allotment comes from **InvestorGain**
(investorgain.com), adapter `src/gmp/investorgain.js`. It is the feed IPOwiz
uses: its day-wise table for Nityas Gems (₹9, ₹5, ₹5, ₹3, ₹3; est. listing ₹78;
est. profit ₹600) is IPOwiz's screen number for number, and its live premiums
matched IPOwiz where IPO Ji and IPO Watch each disagreed.

| page | what it supplies | written by |
| --- | --- | --- |
| live table `/report/live-ipo-gmp/331/` | which IPOs exist, board, status, GMP, price, lot, issue size, subscription, open/close/allotment/listing dates, debut price | `npm run sync:gmp` |
| issue page `/gmp/<slug>/<id>/` | full price band, exchanges, logo | `npm run sync:meta` |
| issue page, day-wise table | GMP history (served live by `/gmp?ipo=`, cached 15 min) | on request |

One source means nothing on a row can contradict anything else on it. Earlier
versions mixed a calendar source, a premium chain and three web-side scrapers,
and the screen showed their disagreements. The source is fixed in code; rows
from any other `source` are deleted at startup.

**Est. profit** is lot size × GMP, the same definition InvestorGain and IPOwiz
print. Percentage and expected listing are computed against the cap price.

**Parsing notes.** Cells are read by `data-label`/`data-title`, never by index.
Dates print without a year (`30-Sep`); `dayMonth` takes the year nearest the
reading. The debut price (`L@455.00`) is Cloudflare address-obfuscated and is
decoded from `data-cfemail`. `--` means not quoted yet (null), not zero.

**GMP is unofficial** — not published by SEBI or the exchanges. Every response
carries an `attribution` array; surface it.

**Scraping posture.** The site sits behind Cloudflare, which serves empty bodies
to non-browser user agents, so the fetcher presents a browser UA
(`GMP_USER_AGENT`). Sync infrequently (30–60 min), retry, and attribute.

## Scheduler

`npm run scheduler` runs the syncs on intervals in a standalone process — the
recommended production setup. Each job runs its sync **script in a child
process**, so a crash never touches the web server and the DB is written by a
short-lived process. Jobs are overlap-guarded (a slow run skips its next tick).
Defaults: registrar+GMP+metadata+link chain hourly, GMP every 30 min (tune via
`SCHEDULER_*`). Alternatively set
`SCHEDULER_ENABLED=true` to run it inside `npm start`.

This closes the loop your question raised: once scheduled, a newly-opened IPO
appears in `/calendar` and `/ipo/<slug>` on the next cycle — with dates,
details, GMP and subscription — with no manual step.

## Monitoring and alerts

Sources break without announcing it (KFintech began rejecting requests without
a browser User-Agent and nothing failed loudly), so the scheduler checks them:

- **Every 15 min** — each registrar's company list and the IPO↔registrar links
  are refreshed, so a newly published issue is checkable within minutes.
- **Hourly** — `npm run check:registrars` sends a PAN that matches nobody
  (`ZZZZZ9999Z`) to every registrar we query and expects "no record". An error
  means the endpoint, a header rule or the host changed. It also reports every
  issue whose allotment is out but which is still on a registrar's own site,
  and why (`not-in-registrar-list` or `registrar-not-supported`).
- **`GET /health`** returns `degraded`, `problems`, each registrar's list and
  self-test state, and the coverage summary. Its status code follows the
  database only, so a registrar outage cannot make the platform restart you.

**Telegram.** Set `TELEGRAM_BOT_TOKEN` (from @BotFather) and `TELEGRAM_CHAT_ID`,
then `npm run alert:test`. An error logged anywhere is sent once per distinct
error per `ALERT_REPEAT_MINUTES` (default 360); registrar problems are sent when
they appear and again as RESOLVED when they clear, never repeated while they
persist. `ALERTS_DRY_RUN=true` prints messages instead of sending. Never use
`AAAAA0000A` as a test PAN — registrars hold it on real applicants' records.

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
