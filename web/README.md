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

All market data — the IPO list, dates, lot, issue size, subscription, GMP and
the day-wise GMP history — reaches this app only through the backend, which
reads one source (InvestorGain). The app's API routes are pass-throughs; there
is no frontend scraping and no background warmer.

**Backend** (`npm run scheduler`, run from the repo root) must be running for
the data to move at all; without it, `/calendar` and `/allotment` serve
whatever was last synced.

## Notes

- Tailwind v4. The default radius scale is cleared in `@theme`, so only
  `rounded-card` / `rounded-control` / `rounded-pill` resolve — the three-shape
  rule is enforced by tooling.
- shadcn's CLI was deliberately not run: `init` rewrites `globals.css` with its
  own palette, and the Radix Tabs/Accordion fight the motion spec (custom
  sliding indicator, `grid-rows` accordion). The primitives in `components/ui`
  follow the same API by hand.
- The backend's GMP `trend` field is an emoji. It is parsed but never rendered.
