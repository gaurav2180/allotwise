# Deploying to Railway

Two services from this one repo, plus two volumes. Both services build from the
same GitHub repo and are told apart by their **root directory**.

| Service | Root directory | Public domain | Volume mount |
| --- | --- | --- | --- |
| `backend` | `/` | **no** | `/app/data` |
| `web` | `/web` | yes | `/app/data` |

## Why the scheduler is not its own service

A Railway volume attaches to exactly one service, and both the API and the sync
jobs write the same SQLite database. Two services cannot share it, so the
scheduler runs inside the backend process instead — that is what
`SCHEDULER_ENABLED=true` is for. `npm run scheduler` stays the right answer
anywhere volumes can be shared.

## Why the backend has no public domain

Nothing outside needs to reach it: the browser only ever talks to `web`, which
proxies onward. Leaving the backend private means the allotment endpoint is not
publicly reachable at all, and Railway's internal DNS keeps the traffic off the
internet. `web` reaches it at `backend.railway.internal`.

## Backend service — variables

```
NODE_ENV=production
PORT=3000
PAN_HASH_SECRET=<paste a fresh 48-byte random string>
DB_PATH=/app/data/allotwise.db
TRUST_PROXY_HOPS=1
SCHEDULER_ENABLED=true
SCHEDULER_RUN_ON_START=true
```

- **`PAN_HASH_SECRET` is mandatory.** The process refuses to boot in production
  without it (`src/config.js`). Generate with:
  `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
  Never reuse the value from a local `.env`. Rotating it invalidates every
  cached allotment result, which is safe — they are re-fetched.
- **`PORT=3000` is pinned deliberately.** Railway would otherwise assign one,
  and `web` needs a predictable address for the private-network call.
- **`TRUST_PROXY_HOPS=1`** — `web` forwards the real client IP as
  `x-forwarded-for`. Without this, Express attributes every request to the
  `web` service's IP and all users share one rate-limit bucket.
- `DB_PATH` is absolute so it lands on the mounted volume rather than in the
  container's ephemeral filesystem, which is wiped on every deploy.

## Web service — variables

```
NODE_ENV=production
BACKEND_URL=http://backend.railway.internal:3000
```

- `NODE_ENV=production` gates the CSP and HSTS headers in `next.config.ts`.
  Without it the app still runs, but unprotected.
- Do **not** set `PORT`. Railway injects it and `next start` reads it; this is
  why the start script no longer hardcodes a port.

## Volumes

Both services write to disk and both need a volume, or the data is lost on
every deploy.

| Service | Mount path | Holds |
| --- | --- | --- |
| `backend` | `/app/data` | `allotwise.db` — registrar mappings, GMP history, calendar |
| `web` | `/app/data` | `waitlist.jsonl` — email addresses |

The waitlist path comes from `process.cwd()`, which is `/app` when the service
root is `/web`, so `/app/data` is correct for both.

## After the first deploy

1. `GET https://<web-domain>/` should render, and `/app` should list IPOs.
2. Check the backend logs for `allotwise listening`, then for scheduler ticks.
   An empty IPO list means the scheduler has not completed its first sync yet.
3. Confirm the headers are live:
   `curl -sI https://<web-domain>/app | grep -i "content-security\|strict-transport"`
4. Confirm the backend is **not** publicly reachable — it should have no domain.

## Known constraints

- **Single replica each.** `numReplicas` is pinned to 1 in both `railway.json`
  files, and that is not a formality: SQLite, the waitlist file, every
  in-memory cache and both rate limiters are per-process. A second replica
  would double-write the database and halve the effective rate limits.
- **No database backups.** Railway volumes are not snapshotted by default.
  `allotwise.db` is rebuildable from the registrars, but the waitlist is not —
  back that file up before it matters.
- **Scheduler timing.** GMP and registrar data only move while the backend is
  running. A crash-looping backend silently freezes the data.
