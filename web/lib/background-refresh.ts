import "server-only";
import { backendGet } from "@/lib/backend";
import { resolveSubscriptions } from "@/lib/nse";
import { warmLogos } from "@/lib/logos";
import { warmSymbolIndex } from "@/lib/nse";
import { resolveIpojiSubscriptions, warmIpojiSlugIndex } from "@/lib/ipoji-subscription";
import { warmIpojiGmpIndex } from "@/lib/ipoji-gmp";
import { peekDetails, scrapeDetails } from "@/lib/ipo-details";
import { fetchListings } from "@/lib/listings";
import { derivePhase } from "@/lib/utils";
import { calendarSchema } from "@/lib/schemas";

/**
 * Keeps this server's own caches hot on a schedule, instead of only refreshing
 * whichever one a request happens to find stale.
 *
 * The backend has its own scheduler for registrar/GMP/metadata data (see
 * `npm run scheduler` in the repo root) — this is the frontend-side equivalent
 * for the sources this Next app reads directly: NSE subscription, NSE symbols,
 * IPO Watch logos, and the listing-outcome table.
 *
 * Subscription is the fast lane: it is the one figure that moves while a
 * market session runs, and it was the concrete gap reported ("subscription
 * rate is still not shown for every ipo") — a page load landing on a cold
 * per-symbol cache is what produced that. Everything else changes slowly
 * enough that an hours-long cadence is honest, not lazy.
 */

const SUBSCRIPTION_INTERVAL_MS = 3 * 60 * 1000;
const SLOW_INTERVAL_MS = 3 * 60 * 60 * 1000;

async function currentEligibleIssues(): Promise<{ slug: string; name: string; board: string }[]> {
  const res = await backendGet("/calendar", { timeoutMs: 15_000 });
  if (!res.ok) return [];
  const parsed = calendarSchema.safeParse(res.data);
  if (!parsed.success) return [];
  return parsed.data.ipos
    .filter((r) => derivePhase(r) !== "upcoming")
    .map((r) => ({ slug: r.slug, name: r.name, board: r.board }));
}

async function refreshSubscriptions() {
  try {
    const issues = await currentEligibleIssues();
    if (!issues.length) return;
    // Unbounded — nothing is waiting on this tick, so it can take as long as
    // the source takes. The point is for the *next* page load to find it
    // already warm. NSE runs for everyone; IPO Ji only for SME, where NSE's
    // own ratio is uncomputable (see lib/ipoji-subscription.ts).
    const sme = issues.filter((i) => i.board === "sme");
    await Promise.allSettled([
      resolveSubscriptions(issues, new Map()),
      resolveIpojiSubscriptions(sme, new Map()),
      // SME premiums come from here too, and a premium moves during the day —
      // so it belongs on this tick rather than the three-hourly one.
      warmIpojiGmpIndex(),
    ]);
    console.log(JSON.stringify({ ts: new Date().toISOString(), scope: "bg-refresh", msg: "subscription tick", issues: issues.length, sme: sme.length }));
  } catch (err) {
    console.warn(JSON.stringify({ ts: new Date().toISOString(), scope: "bg-refresh", msg: "subscription tick failed", message: (err as Error).message }));
  }
}

/**
 * Detail pages for every IPO on the calendar, so the list can show a real
 * price band ("₹408–429") rather than the cap price the calendar carries.
 * The request path only ever reads this cache, never fills it — 30 detail
 * fetches is far too much to put in front of a page load.
 */
async function warmDetails() {
  const res = await backendGet("/calendar", { timeoutMs: 15_000 });
  if (!res.ok) {
    console.warn(JSON.stringify({ ts: new Date().toISOString(), scope: "bg-refresh", msg: "detail warm skipped", reason: "calendar unavailable", code: res.code }));
    return;
  }
  const parsed = calendarSchema.safeParse(res.data);
  if (!parsed.success) {
    console.warn(JSON.stringify({ ts: new Date().toISOString(), scope: "bg-refresh", msg: "detail warm skipped", reason: "calendar shape" }));
    return;
  }

  // Only the ones missing from cache; `scrapeDetails` remembers misses too, so
  // this settles down to almost no work once warm.
  const cold = parsed.data.ipos.map((r) => r.slug).filter((s) => !peekDetails(s));
  if (!cold.length) return;

  // Paced, not parallel. Firing all ~30 at once got a chunk of them throttled
  // by the source and they came back empty; nothing is waiting on this tick, so
  // it can afford to take half a minute and actually get them all.
  let resolved = 0;
  for (const slug of cold) {
    const d = await scrapeDetails(slug).catch(() => null);
    if (d?.priceBand) resolved += 1;
    await new Promise((r) => setTimeout(r, 300));
  }
  console.log(JSON.stringify({ ts: new Date().toISOString(), scope: "bg-refresh", msg: "detail warm", cold: cold.length, withBand: resolved }));
}

async function refreshSlow() {
  const results = await Promise.allSettled([
    warmLogos(),
    warmSymbolIndex(),
    fetchListings(),
    warmIpojiSlugIndex(),
    warmDetails(),
  ]);
  console.log(JSON.stringify({ ts: new Date().toISOString(), scope: "bg-refresh", msg: "slow tick", logos: results[0].status, symbols: results[1].status, listings: results[2].status, ipojiSlugs: results[3].status, details: results[4].status }));
}

declare global {
  // eslint-disable-next-line no-var
  var __allotwiseBgRefresh: boolean | undefined;
}

export function startBackgroundRefresh() {
  // Guard against Next's dev-mode module re-evaluation (Fast Refresh, or this
  // file being imported from more than one entry point) starting a second set
  // of intervals in the same process.
  if (globalThis.__allotwiseBgRefresh) return;
  globalThis.__allotwiseBgRefresh = true;

  console.log(JSON.stringify({ ts: new Date().toISOString(), scope: "bg-refresh", msg: "started", subscriptionMinutes: SUBSCRIPTION_INTERVAL_MS / 60_000, slowHours: SLOW_INTERVAL_MS / 3_600_000 }));

  // Fire once immediately so the first real page load never pays the cold-cache
  // cost, then settle into the schedule.
  void refreshSubscriptions();
  void refreshSlow();

  const fast = setInterval(refreshSubscriptions, SUBSCRIPTION_INTERVAL_MS);
  const slow = setInterval(refreshSlow, SLOW_INTERVAL_MS);
  fast.unref();
  slow.unref();
}
