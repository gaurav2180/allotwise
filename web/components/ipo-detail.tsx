"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { GmpHistoryPanel } from "@/components/gmp-history";
import { ipoDetailSchema, type IpoDetail } from "@/lib/schemas";
import { formatDate, formatIssueSize, inr, minApplication } from "@/lib/utils";

async function fetchDetail(slug: string): Promise<IpoDetail> {
  const res = await fetch(`/api/ipo/${encodeURIComponent(slug)}`, { cache: "no-store" });
  if (!res.ok) throw new Error("unavailable");
  const parsed = ipoDetailSchema.safeParse(await res.json());
  if (!parsed.success) throw new Error("shape");
  return parsed.data;
}

/**
 * The source writes "₹408 to ₹429 Per Share" and "₹10 Per Equity Share". The
 * trailing unit is implied by the label, so it is dropped and the range gets a
 * proper dash.
 */
function tidy(value: string | null): string | null {
  if (!value) return value;
  return value
    .replace(/\s*per\s+(equity\s+)?share\s*$/i, "")
    .replace(/\s+to\s+/i, " – ")
    .trim();
}

function Cell({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-dim">{label}</div>
      <div className="num mt-0.5 truncate text-[13px]">{value ?? "—"}</div>
    </div>
  );
}

/**
 * Issue facts and the tentative timeline, loaded only when a row is expanded.
 * Every value here comes from the API; nothing is inferred except est. profit,
 * which is labelled as an estimate because its input is unofficial.
 */
export function IpoDetailPanel({
  slug,
  gmp,
  gmpSource,
}: {
  slug: string;
  gmp: number | null;
  gmpSource: "ipowatch" | "ipoji";
}) {
  const { data, isPending, isError } = useQuery({
    queryKey: ["ipo", slug],
    queryFn: () => fetchDetail(slug),
    staleTime: 10 * 60_000,
  });

  if (isPending) {
    return (
      <div className="grid grid-cols-2 gap-3 pt-3 sm:grid-cols-4">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i}>
            <div className="aw-skeleton h-3 w-14 rounded-pill" />
            <div className="aw-skeleton mt-1.5 h-4 w-20 rounded-pill" />
          </div>
        ))}
      </div>
    );
  }

  // Details are supporting context, not the reason the row was opened, so a
  // failure here stays quiet rather than displacing the allotment check.
  if (isError || !data) {
    return <p className="pt-3 text-[12px] text-dim">Issue details are unavailable right now.</p>;
  }

  const { details, timeline } = data;
  const lot = details.lotSize;
  // Premium earned on the smallest application that can actually be made, so
  // this cell and "Min investment" describe the same money. Not lot size times
  // premium: SME minimums are two lots, and that version showed half the profit
  // on the investment named beside it. Unofficial in, unofficial out — "Est.".
  const minApp = minApplication(lot, details.minInvestment, details.priceBand);
  const estProfit = gmp !== null && minApp ? gmp * minApp.shares : null;

  return (
    <div className="pt-3">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <Cell label="Lot size" value={lot ? `${inr(lot)} shares` : null} />
        <Cell
          label={minApp && minApp.lots > 1 ? `Min investment (${minApp.lots} lots)` : "Min investment"}
          value={details.minInvestment ? `₹${inr(details.minInvestment)}` : null}
        />
        <Cell
          label="Est. profit on min."
          value={estProfit !== null ? `₹${inr(estProfit)}` : null}
        />
        <Cell label="Issue size" value={formatIssueSize(details.issueSize)} />
        <Cell label="Price band" value={tidy(details.priceBand)} />
        <Cell label="Face value" value={tidy(details.faceValue)} />
        <Cell label="Issue type" value={details.issueType} />
        <Cell label="Listing at" value={details.listingExchanges} />
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <div className="text-[11px] text-dim">Timeline</div>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          <Cell label="Opens" value={formatDate(timeline.openDate)} />
          <Cell label="Closes" value={formatDate(timeline.closeDate)} />
          <Cell label="Allotment" value={formatDate(timeline.allotmentDate)} />
          <Cell label="Listing" value={formatDate(timeline.listingDate)} />
        </div>
      </div>

      <GmpHistoryPanel slug={slug} headlineGmp={gmp} headlineSource={gmpSource} />

      {estProfit !== null && (
        <p className="mt-3 text-[12px] text-dim">
          Est. profit is the grey market premium on {inr(minApp?.shares ?? 0)} shares — the smallest
          application this issue allows, the same one priced above. GMP is unofficial and moves daily
          — it is not a quote, and it is frequently wrong.{" "}
          <Link href="/disclaimer" className="underline underline-offset-2 hover:no-underline">
            Full disclaimer
          </Link>
        </p>
      )}
    </div>
  );
}
