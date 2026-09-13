import { NextResponse } from "next/server";
import { backendGet, clientIp } from "@/lib/backend";
import { scrapeDetails } from "@/lib/ipo-details";
import { fetchIpojiIssueSize } from "@/lib/ipoji-gmp";

export const dynamic = "force-dynamic";

type Detail = {
  name: string;
  timeline: Record<string, string | null>;
  details: Record<string, string | number | null>;
};

/**
 * Issue size is reported as a rupee amount, and neither source has one for
 * every issue: IPO Watch gives shares only for some mainboard issues, IPO Ji
 * gives the amount there but leads with shares for SME. So the value kept is
 * whichever source published an amount at all.
 */
const hasAmount = (v: unknown): boolean =>
  /₹\s*[\d,]+(?:\.\d+)?\s*(?:cr|crore|crores)\b/i.test(String(v ?? ""));

/** Backend value wins; the scrape only fills a null. */
const fill = <T,>(current: T | null | undefined, fallback: T | null): T | null =>
  current === null || current === undefined || current === "" ? fallback : current;

/**
 * Everything known about one IPO — timeline, lot size, issue size.
 *
 * The backend's metadata sync only visits detail pages for upcoming and open
 * issues, so a closed IPO arrives with nulls throughout. Those gaps are filled
 * here from the same public source the backend uses, so the panel shows real
 * values instead of a grid of dashes. Fetched only when a row is expanded.
 */
export async function GET(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;

  const res = await backendGet<Detail>(`/ipo/${encodeURIComponent(slug)}`, {
    forwardedFor: clientIp(request.headers),
    timeoutMs: 12_000,
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: { code: res.code, message: res.message } },
      { status: res.status }
    );
  }

  const data = res.data;
  const d = data.details ?? {};
  const t = data.timeline ?? {};

  // The backend used to store only the cap price, so a "bandless" value here
  // meant an incomplete record worth scraping a second source for. It now
  // stores the full range, so a single figure is a single-price issue and not a
  // gap — treating it as one made every such row fetch a page it did not need.
  // An issue size with no rupee amount ("1,69,49,595 shares") is present but
  // unusable, so it counts as incomplete — otherwise an otherwise-full record
  // would short circuit below and never reach a source that has the amount.
  const amountless = Boolean(d.issueSize) && !hasAmount(d.issueSize);
  const incomplete =
    !d.lotSize ||
    !d.issueSize ||
    !d.faceValue ||
    !t.allotmentDate ||
    !t.listingDate ||
    amountless;

  if (!incomplete) return NextResponse.json(data);

  const s = await scrapeDetails(slug);

  // Whichever source published a rupee amount wins. IPO Ji is only asked when
  // neither of the two we already hold has one, so most issues never pay for
  // the lookup.
  let sizedWithAmount =
    [d.issueSize, s.issueSize].find(hasAmount) ?? null;
  if (!sizedWithAmount) {
    const fromIpoji = await fetchIpojiIssueSize(data.name).catch(() => null);
    if (hasAmount(fromIpoji)) sizedWithAmount = fromIpoji;
  }

  return NextResponse.json({
    ...data,
    timeline: {
      ...t,
      allotmentDate: fill(t.allotmentDate, s.allotmentDate),
      refundDate: fill(t.refundDate, s.refundDate),
      listingDate: fill(t.listingDate, s.listingDate),
    },
    details: {
      ...d,
      // The scrape fills a gap; it never overrides. It used to win outright,
      // from when the backend stored only a cap price — and the two disagree:
      // Axiom Gas read ₹50-53 on the row and ₹67 here, so the panel contradicted
      // the list and the estimated gain was divided by a price shown nowhere.
      priceBand: fill(d.priceBand, s.priceBand),
      faceValue: fill(d.faceValue, s.faceValue),
      issueSize: sizedWithAmount ?? fill(d.issueSize, s.issueSize),
      issueType: fill(d.issueType, s.issueType),
      listingExchanges: fill(d.listingExchanges, s.listingExchanges),
      lotSize: fill(d.lotSize, s.lotSize),
      minInvestment: fill(d.minInvestment, s.minInvestment),
    },
  });
}
