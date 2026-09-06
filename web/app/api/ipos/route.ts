import { NextResponse } from "next/server";
import { backendGet, clientIp } from "@/lib/backend";
import { resolveLogos } from "@/lib/logos";
import { fetchListings, type Listing } from "@/lib/listings";
import { peekDetails, scrapeDetails } from "@/lib/ipo-details";
import { bestMatch } from "@/lib/match";
import { resolveSubscriptions, type SubscriptionResult } from "@/lib/nse";
import { resolveIpojiSubscriptions } from "@/lib/ipoji-subscription";
import { resolveIpojiGmp, type IpojiGmpQuote } from "@/lib/ipoji-gmp";
import { derivePhase } from "@/lib/utils";
import { calendarSchema } from "@/lib/schemas";

const todayIso = () => new Date().toISOString().slice(0, 10);

type SubsMap = Map<string, SubscriptionResult>;

/**
 * Warm the detail cache and read listing dates out of it.
 *
 * Two things need the detail page: the listing date (the backend's metadata
 * sync skips closed IPOs, so their date is null in the database — exactly the
 * set that is about to list) and the full price band (the calendar carries
 * only the cap price). So this is called with *every* slug, not just the
 * closed ones, and `priceBandFull` below reads the same cache.
 *
 * A cold cache must not stall the page: warming runs against a short budget
 * and whatever has landed by then is used, so the first load after a restart
 * shows cap prices and the next one shows bands. The background warmer covers
 * this too, but only where it shares a module instance with this route — in
 * dev it does not, so this path is the one that must stand on its own.
 */
async function listingDates(slugs: string[]): Promise<Map<string, string>> {
  const cold = slugs.filter((s) => !peekDetails(s));

  if (cold.length) {
    // Modest concurrency — this source rate-limits bursts.
    const queue = [...cold];
    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        await scrapeDetails(next).catch(() => undefined);
      }
    };
    await Promise.race([
      Promise.all([worker(), worker(), worker()]),
      new Promise((r) => setTimeout(r, 4000)),
    ]);
  }

  const out = new Map<string, string>();
  for (const s of slugs) {
    const d = peekDetails(s)?.listingDate;
    if (d) out.set(s, d);
  }
  return out;
}

export const dynamic = "force-dynamic";

/**
 * One request for the whole main screen.
 *
 * /calendar carries GMP and dates but not subscription, which is a separate
 * per-IPO endpoint. Fanning that out from the browser would be an N+1 waterfall,
 * so it is composed here instead. Only mainboard IPOs that are open or closed
 * can have subscription figures at all (the backend sources them from NSE), so
 * the fan-out is limited to those — usually a handful.
 */
export async function GET(request: Request) {
  const ip = clientIp(request.headers);

  const calendar = await backendGet("/calendar", { forwardedFor: ip });
  if (!calendar.ok) {
    return NextResponse.json(
      { error: { code: calendar.code, message: calendar.message } },
      { status: calendar.status }
    );
  }

  const parsed = calendarSchema.safeParse(calendar.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Calendar data did not match the expected shape." } },
      { status: 502 }
    );
  }

  const rows = parsed.data.ipos;

  // Anything that has opened can have bidding figures. Derived from dates, not
  // the scraped status — an issue that opened overnight still arrives marked
  // "upcoming" and would otherwise be skipped. SME is included: some SME issues
  // list on NSE Emerge and do carry figures.
  const eligible = rows.filter((r) => derivePhase(r) !== "upcoming");

  // Logos are cached upstream-side and never fatal, so this runs alongside the
  // subscription fan-out rather than gating it.
  const logosPromise = resolveLogos(rows.map((r) => r.name)).catch(
    (): Record<string, string> => ({})
  );

  // Once an issue actually lists, its real debut price supersedes the grey
  // market's forecast. The outcome table only gains a row after listing, so a
  // match here is itself the signal that an IPO has listed.
  const listingsPromise = fetchListings().catch((): Listing[] => []);

  // Subscription is read straight from NSE rather than through the backend.
  //
  // The backend only holds figures for issues it matched against NSE's
  // *upcoming* feed, so anything that has closed is missing — and asking it per
  // IPO cost one request each, which alone could exhaust its rate limit in a
  // dozen page loads. One source, one round trip, and better coverage.
  const subs: SubsMap = new Map();
  // Budgeted so a cold cache never stalls the page; anything that misses the
  // budget resolves on the next request, or sooner via the background warmer.
  const subsPromise = resolveSubscriptions(eligible, subs, { budgetMs: 6000 });

  // NSE reports zero shares offered for SME issues even when shares bid is
  // real (confirmed against actual bid volumes) — its own ratio is
  // uncomputable there, not merely absent. IPO Ji publishes the multiple
  // directly for SME issues, so it overwrites whatever partial figure NSE
  // gave (usually none) rather than reconstructing one. Mainboard is
  // untouched — NSE's own ratio is trustworthy there. Runs alongside the NSE
  // fetch, not after it — the two sources are independent.
  const smeEligible = eligible.filter((r) => r.board === "sme");
  const ipojiSubs: SubsMap = new Map();
  const ipojiPromise = resolveIpojiSubscriptions(smeEligible, ipojiSubs, { budgetMs: 6000 });

  // Every slug, because the price band is wanted for all of them. A listing
  // date only means something for a closed issue, and the `on <= today` guard
  // below discards a future one anyway.
  const datesPromise = listingDates(rows.map((r) => r.slug));

  // One tracker per row, for every board.
  //
  // The premium and its day-wise chart have to come from the same place: the
  // two trackers disagree (Kanohar: IPO Watch ₹205, IPO Ji ₹180) and a row
  // showing one number above a chart ending on another reads as a bug. IPO Ji
  // wins because it is the only source with real day-wise history — IPO Watch
  // publishes no history table at all — so pinning the headline to it is what
  // makes the chart honest. Where IPO Ji has no quote, the row falls back to
  // the backend's IPO Watch figure *and* to our own recorded series, so both
  // halves move together either way.
  const quotes = new Map<string, IpojiGmpQuote>();
  const gmpPromise = resolveIpojiGmp(rows, quotes, { budgetMs: 6000 }).catch(() => undefined);

  const [logos, listings, dates] = await Promise.all([
    logosPromise,
    listingsPromise,
    datesPromise,
  ]);
  await gmpPromise;
  await Promise.all([subsPromise, ipojiPromise]);
  for (const [slug, value] of ipojiSubs) subs.set(slug, value);
  const today = todayIso();

  return NextResponse.json({
    count: rows.length,
    ipos: rows.map((r) => {
      const listed = listings.length ? bestMatch(r.name, listings, (l) => l.name) : null;
      const on = dates.get(r.slug) ?? null;

      // Only when IPO Ji actually quotes this issue; otherwise the backend's
      // figure stands rather than the row losing its premium entirely.
      const quote = quotes.get(r.slug) ?? null;

      return {
        ...r,
        gmpSource: quote ? ("ipoji" as const) : ("ipowatch" as const),
        ...(quote
          ? {
              gmp: quote.gmp,
              estGainPct: quote.pct ?? r.estGainPct,
              estListingPrice: quote.indicative ?? r.estListingPrice,
            }
          : {}),
        subscription: subs.get(r.slug) ?? null,
        logo: logos[r.name] ?? null,
        listing: listed
          ? { price: listed.listingPrice, issuePrice: listed.issuePrice, gainPct: listed.gainPct }
          : null,
        // Cache-only: the calendar's own `priceBand` is just the cap price, and
        // fetching 30 detail pages to widen it would cost more than the figure
        // is worth on a cold load. The warmer keeps this hot; until it has run,
        // the row falls back to the cap price it already had.
        priceBandFull: peekDetails(r.slug)?.priceBand ?? null,
        // An issue whose listing date has arrived has listed, whether or not its
        // debut price has been published yet. The two are separate facts.
        listedOn: on && on <= today ? on : null,
      };
    }),
    attribution: parsed.data.attribution,
  });
}
