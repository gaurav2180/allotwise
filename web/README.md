# Allotwise — frontend

Next.js App Router UI for the Allotwise backend. Built against `DESIGN.md`, which
is the governing spec.

## Running

The Express backend must be running first (from the repo root):

```bash
npm start            # backend on :3000
```

Then:

```bash
cd web
npm install
npm run dev          # UI on :3000 by default — use -p 4000 to avoid the backend
```

`BACKEND_URL` defaults to `http://localhost:3000`.

## Why the API is proxied

The backend ships no CORS middleware, so the browser cannot call it directly.
Every request goes through a Next route handler on the same origin:

| Route | Purpose |
| --- | --- |
| `/api/ipos` | `/calendar` plus a bounded per-IPO `/subscription` fan-out, merged server-side. Avoids an N+1 waterfall in the browser. |
| `/api/allotment` | One PAN against one IPO. Validates the PAN before it leaves the process; `no-store`, never logged. |
| `/api/waitlist` | Appends to `data/waitlist.jsonl`. File-backed, so single-instance only — swap for a database before scaling out. |

The proxy forwards `x-forwarded-for` so the backend's per-IP rate limits apply
to the real caller. **In a deployed environment the backend needs
`TRUST_PROXY_HOPS` set**, or every user shares one bucket.

## Screens

- `/` — landing. The hero's right half is the live GMP table, not a screenshot.
- `/app` — the main screen. IPO rows expand to one line per saved PAN.
- `/pans` — add, label, remove. localStorage only.
- `/tokens` — token proof sheet used for design review. Not linked from the product.

## PAN handling

PANs live in `localStorage` under `allotwise.pans.v1` and nowhere else. They are
sent as a query parameter on a check and are never persisted, cached, or logged
by this app. Displayed masked (`AAAAA****A`).

## Rate limits shape the UI

The backend allows 20 allotment calls / 15 min per IP, 30 per PAN / hour, and at
most **10 distinct PANs per IP per hour**. "Check all" therefore runs
**sequentially**, not in parallel, and stops early on a limit rejection rather
than burning the window — remaining PANs are marked skipped.

## Keeping data current

Two independent schedules, because the frontend reads some sources the backend
does not.

**Backend** (`npm run scheduler`, run from the repo root) — registrar mappings,
GMP, metadata, and links, on the intervals documented in the main README. This
must be running for the product data (allotment mappings, GMP) to move at all;
without it, `/calendar` and `/allotment` serve whatever was last synced.

**Frontend** (`instrumentation.ts` → `lib/background-refresh.ts`) — sources this
app reads directly rather than through the backend:

| Source | Interval | Why |
| --- | --- | --- |
| NSE subscription (mainboard) | 3 min | The one figure that moves while a market session runs |
| IPO Ji subscription (SME) | 3 min | Same reason; NSE's own SME figure is unusable (see below) |
| NSE symbol index (~1400 companies) | 3 h | Large, slow-changing; a request should never pay its cold-fetch cost |
| IPO Ji slug index (~250 companies) | 3 h | Same shape as the NSE symbol index, for the same reason |
| IPO Watch logos | 3 h | Company logos do not change hour to hour |
| Listing outcomes (Past tab) | 3 h | New rows appear once a day at most |

Starts once per server process — `instrumentation.ts` is Next's own
startup hook, not a request handler, and a `globalThis` guard stops dev-mode
Fast Refresh from starting a second set of intervals. Restarting `next dev`
restarts the warmer; it does not persist across restarts on its own.

The request path (`/api/ipos`) still resolves anything the warmer has not
gotten to yet, budgeted so a cold cache never stalls a page load — the warmer
just means that budget is rarely spent, because the answer is already sitting
in cache by the time someone asks.

**SME subscription — a separate source, not a workaround.** NSE reports zero
shares *offered* for SME issues even when shares *bid* is real and large
(confirmed against actual bid volumes — an NSE data-quality gap, not a parsing
bug here), so its own ratio is unusable there. Mainboard is unaffected and
stays on NSE, which is trustworthy for it.

An earlier attempt reconstructed the missing denominator from the issue size
and price band already scraped from IPO Watch (`issueSize ÷ cap price`). It
looked right — reproducing NSE's own 42.6x exactly on a mainboard issue used
as a sanity check — but was wrong for SME specifically: issue size includes
anchor-investor and market-maker carve-outs that are not part of the public
offer NSE's ratio is measured against, so the reconstructed multiple came out
low (Ashutosh Fibre: 56x reconstructed vs. 133.82x actual).

**Current source**: `lib/ipoji-subscription.ts` reads the multiple directly
from IPO Ji (`ipoji.com`), which publishes it per-category (QIB/NII/Retail/
Total) on each issue's own page — no reconstruction, no denominator. IPO Ji's
slug is not derivable from the company name ("Complete Sports Management
India" is `complete-sports-and-management-ipo`), so it is resolved the same
way logos are (`lib/logos.ts`): real `/ipo/<slug>` links are pulled from IPO
Ji's own listing pages and fuzzy-matched by name, rather than guessed. Wired
into `app/api/ipos/route.ts` for SME issues only, running alongside (not
instead of) the NSE fetch used for mainboard.

A dash still means the issue has not opened yet, or IPO Ji has not indexed it
under a resolvable name — not zero demand.
- **Historical logos are partial.** IPO Watch's logo pool (current + two
  listed-history pages, merged) does not cover the full 300-issue Past tab —
  there is no comprehensive public logo archive to pull from. Coverage skews
  toward recently-listed issues; older ones fall back to the monogram tile,
  which is a designed state, not a broken image.

## Notes

- Tailwind v4. The default radius scale is cleared in `@theme`, so only
  `rounded-card` / `rounded-control` / `rounded-pill` resolve — the three-shape
  rule is enforced by tooling.
- shadcn's CLI was deliberately not run: `init` rewrites `globals.css` with its
  own palette, and the Radix Tabs/Accordion fight the motion spec (custom
  sliding indicator, `grid-rows` accordion). The primitives in `components/ui`
  follow the same API by hand.
- The backend's GMP `trend` field is an emoji. It is parsed but never rendered.
