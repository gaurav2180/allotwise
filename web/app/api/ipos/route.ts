import { NextResponse } from "next/server";
import { backendGet, clientIp } from "@/lib/backend";
import { resolveLogos } from "@/lib/logos";
import { fetchListings, type Listing } from "@/lib/listings";
import { peekDetails, scrapeDetails } from "@/lib/ipo-details";
import { bestMatch } from "@/lib/match";
import { resolveSubscriptions, type SubscriptionResult } from "@/lib/nse";
import { resolveIpojiSubscriptions } from "@/lib/ipoji-subscription";

import { capPrice, derivePhase } from "@/lib/utils";
import { calendarSchema } from "@/lib/schemas";

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * A listing outcome built from the debut price the calendar publishes.
 *
 * Applications are priced at the cap, so that is what the gain is measured
 * against. Null unless both figures are there — an issue that has listed but
 * whose opening price is not yet published is a real state, and the row shows
 * "Listed" without a number rather than inventing one.
 */
function listingFrom(listingPrice: number | null, priceBand: string | null) {
  const issuePrice = capPrice(priceBand);
  if (listingPrice === null || !issuePrice) return null;
  return {
    price: listingPrice,
    issuePrice,
    gainPct: Number((((listingPrice - issuePrice) / issuePrice) * 100).toFixed(2)),
  };
}

type SubsMap = Map<string, SubscriptionResult>;

/**
 * Warm the detail cache and read listing dates out of it.
 *
 * Only the listing date now: the backend's metadata sync skips closed IPOs, so
 * their date is null in the database — exactly the set that is about to list.
 * The price band used to come from here too, until the calendar started
 * carrying the full range itself.
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

  // The backend now carries the logo the source states outright for each issue,
  // so only the rows it has no logo for need the guessing path below — which
  // fuzzy-matches image filenames against company names and is what used to
  // leave about one issue in five on a monogram tile. Skipped entirely once
  // every row has one.
  const needLogo = rows.filter((r) => !r.logo).map((r) => r.name);
  const logosPromise = needLogo.length
    ? resolveLogos(needLogo).catch((): Record<string, string> => ({}))
    : Promise.resolve<Record<string, string>>({});

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

  // The premium is taken from the backend and nowhere else.
  //
  // This used to re-fetch IPO Ji's GMP table here and overlay it, from the days
  // when the backend ran IPO Watch and the two disagreed. The backend now reads
  // IPO Ji itself, so the overlay fetched the same site for the same number a
  // second time — and it made things worse rather than merely redundant. That
  // table carries ~18 issues where the calendar carries ~51, and the row was
  // labelled "ipoji" only when the overlay hit, so 28 of 53 rows were stamped
  // `ipowatch` while showing IPO Ji data. The chart panel then used that label
  // to explain away a cross-tracker disagreement that could not exist.
  //
  // One fetch, one number, one label: whatever the backend says, and `r.source`
  // to say where it came from.
  const [logos, listings, dates] = await Promise.all([
    logosPromise,
    listingsPromise,
    datesPromise,
  ]);
  await Promise.all([subsPromise, ipojiPromise]);
  for (const [slug, value] of ipojiSubs) subs.set(slug, value);
  const today = todayIso();

  return NextResponse.json({
    count: rows.length,
    ipos: rows.map((r) => {
      const listed = listings.length ? bestMatch(r.name, listings, (l) => l.name) : null;
      const on = dates.get(r.slug) ?? null;

      return {
        ...r,
        // Whoever the backend got the row from. `gmp`, `estGainPct` and
        // `estListingPrice` pass through untouched, so the figure, the
        // percentage it implies and the chart below all describe one reading.
        gmpSource: r.gmpSource ?? r.source,
        subscription: subs.get(r.slug) ?? null,
        logo: r.logo ?? logos[r.name] ?? null,
        listing: listed
          ? { price: listed.listingPrice, issuePrice: listed.issuePrice, gainPct: listed.gainPct }
          : // The outcome table covers barely any SME issue, which left listed
            // SME rows with a stale premium or a dash where a real result
            // belonged — one of them had listed 20% *down* and said nothing.
            // The calendar carries the debut price for exactly those, so it
            // fills in whenever the table has no match.
            listingFrom(r.listingPrice, r.priceBand),
        // No `priceBandFull` overlay any more. It existed because the calendar
        // used to carry only the cap price, so a second source was scraped to
        // widen it — and that source disagreed: Axiom Gas read ₹50-53 from the
        // calendar and ₹67 from the overlay, so the row displayed ₹67 while the
        // estimated profit was computed against a ₹53 cap. The calendar now
        // publishes the full band itself, which makes the overlay both
        // unnecessary and the only thing that could contradict it.
        //
        // An issue whose listing date has arrived has listed, whether or not its
        // debut price has been published yet. The two are separate facts.
        listedOn: on && on <= today ? on : null,
      };
    }),
    attribution: parsed.data.attribution,
  });
}
