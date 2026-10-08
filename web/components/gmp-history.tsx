"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CaretLeftIcon, InfoIcon } from "@phosphor-icons/react";
import { IpoLogo } from "@/components/ipo-logo";
import { GmpChart } from "@/components/gmp-chart";
import { useIpos } from "@/hooks/use-ipos";
import { FROM_LIST_KEY, gmpHistoryQuery } from "@/hooks/use-gmp-history";
import type { IpoListItem } from "@/lib/schemas";
import { capPrice, derivePhase, estProfitPerLot, formatLongDate, inr, listingGainPerLot } from "@/lib/utils";

const signColor = (n: number | null | undefined) =>
  n === null || n === undefined || n === 0 ? undefined : n > 0 ? "var(--positive)" : "var(--negative)";

const pct1 = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : `${n.toFixed(1)}%`;

function statusLabel(ipo: IpoListItem): string {
  if (ipo.listing || ipo.listedOn || ipo.status === "listed") return "Listed";
  const phase = derivePhase(ipo);
  return phase === "open" ? "Ongoing" : phase === "upcoming" ? "Upcoming" : "Closed";
}

function OverviewRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-3.5 last:border-b-0">
      <span className="text-[14px] text-dim">{label}</span>
      <span className="num text-[15px] font-medium" style={color ? { color } : undefined}>
        {value}
      </span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-6 text-[16px] font-semibold">{children}</h2>;
}

export function GmpPageSkeleton() {
  return (
    <div className="mx-auto max-w-2xl" aria-busy="true">
      <div className="flex items-center gap-2">
        <div className="size-9" />
        <div className="aw-skeleton h-5 w-56 rounded-pill" />
      </div>
      <div className="mt-4 flex items-center gap-3">
        <div className="aw-skeleton size-9 rounded-control" />
        <div className="space-y-1.5">
          <div className="aw-skeleton h-5 w-48 rounded-pill" />
          <div className="aw-skeleton h-3.5 w-16 rounded-pill" />
        </div>
      </div>
      <div className="aw-skeleton mt-7 h-5 w-52 rounded-pill" />
      <div className="aw-skeleton mt-3 h-44 rounded-card" />
      <div className="aw-skeleton mt-7 h-5 w-32 rounded-pill" />
      <div className="aw-skeleton mt-3 h-56 rounded-card" />
    </div>
  );
}

/** One IPO's premium: where it stands now, and how it got there day by day. */
export function GmpPage() {
  const slug = useSearchParams().get("ipo") ?? "";
  const router = useRouter();
  const ipos = useIpos();
  const history = useQuery({ ...gmpHistoryQuery(slug), enabled: Boolean(slug) });

  // A real history step when the list sent us here: the browser restores the
  // list's scroll position, and the list restores its tab and open row.
  const goBack = (e: React.MouseEvent) => {
    let fromList = false;
    try {
      fromList = sessionStorage.getItem(FROM_LIST_KEY) === slug;
      sessionStorage.removeItem(FROM_LIST_KEY);
    } catch {}
    if (fromList && window.history.length > 1) {
      e.preventDefault();
      router.back();
    }
  };

  const ipo = ipos.data?.ipos.find((r) => r.slug === slug) ?? null;
  const name = ipo?.name ?? history.data?.name ?? null;
  const points = history.data?.history ?? [];
  const latest = points.length ? points[points.length - 1] : null;

  // The day-wise table is read for this page, so its last point is the newest
  // reading there is; the list's figure is only as fresh as the last sync. The
  // headline uses the newer one so it always matches the end of the chart.
  const gmp = latest?.gmp ?? ipo?.gmp ?? null;
  const issuePrice = capPrice(ipo?.priceBand);
  const gmpPct = gmp !== null && issuePrice ? (gmp / issuePrice) * 100 : null;
  const profit = estProfitPerLot(ipo?.lotSize, gmp);
  const expected = gmp !== null && issuePrice ? issuePrice + gmp : (latest?.indicative ?? null);

  // Once an issue has listed, the real outcome replaces the forecast: the price
  // it listed at, and what a lot gained or lost on it.
  const listing = ipo?.listing ?? null;
  const listingGain = listingGainPerLot(ipo?.lotSize, listing);
  const signed = (n: number) => `${n < 0 ? "−" : ""}₹${inr(Math.abs(n))}`;

  const loading = Boolean(slug) && (ipos.isPending || history.isPending) && !name;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center gap-2">
        <Link
          href="/app"
          onClick={goBack}
          aria-label="Back to IPOs"
          className="-ml-2 grid size-9 shrink-0 place-items-center rounded-control hover:bg-row-hover"
        >
          <CaretLeftIcon size={20} weight="bold" />
        </Link>
        <h1 className="truncate text-[16px] font-semibold">{name ? `${name} IPO GMP` : "IPO GMP"}</h1>
      </div>

      {loading && (
        <div className="mt-5 space-y-3">
          <div className="aw-skeleton h-12 w-64 rounded-card" />
          <div className="aw-skeleton h-48 rounded-card" />
        </div>
      )}

      {!loading && !name && (
        <p className="mt-6 text-[13px] text-dim">This IPO is not in the current list.</p>
      )}

      {name && (
        <>
          <div className="mt-4 flex items-center gap-3">
            <IpoLogo name={name} src={ipo?.logo ?? null} />
            <div className="min-w-0">
              <div className="truncate text-[17px] font-semibold">{name} IPO</div>
              {ipo && <div className="text-[13px] text-dim">{statusLabel(ipo)}</div>}
            </div>
          </div>

          <SectionTitle>Current Market Overview</SectionTitle>
          <div className="mt-1">
            <OverviewRow
              label={listing ? "Last GMP" : "Current GMP"}
              value={gmp === null ? "—" : gmpPct === null ? `₹${inr(gmp)}` : `₹${inr(gmp)} (${pct1(gmpPct)})`}
              color={signColor(gmp)}
            />
            {listing ? (
              <>
                <OverviewRow
                  label="Listing Gain/Lot"
                  value={listingGain === null ? "—" : signed(listingGain)}
                  color={signColor(listingGain)}
                />
                <OverviewRow label="Issue Price" value={`₹${inr(listing.issuePrice)}`} />
                <OverviewRow
                  label="Listed At"
                  value={`₹${inr(listing.price)} (${listing.gainPct > 0 ? "+" : ""}${pct1(listing.gainPct)})`}
                  color={signColor(listing.gainPct)}
                />
              </>
            ) : (
              <>
                <OverviewRow
                  label="Est. Profit/Lot"
                  value={profit === null ? "—" : `₹${inr(profit)}`}
                  color={signColor(profit)}
                />
                <OverviewRow label="Issue Price" value={issuePrice ? `₹${inr(issuePrice)}` : "—"} />
                <OverviewRow label="Expected Listing" value={expected !== null ? `₹${inr(expected)}` : "—"} />
              </>
            )}
          </div>

          {points.length >= 2 && (
            <>
              <div className="mt-6 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[16px] font-semibold">GMP Trend</h2>
                <span className="num text-[12px] text-dim">
                  ₹{inr(points[0].gmp)} on {formatLongDate(points[0].date)} → ₹{inr(points[points.length - 1].gmp)} now
                </span>
              </div>
              <div className="mt-3 rounded-card border border-border bg-surface px-2 pt-2 pb-1">
                <GmpChart points={points} showPct={Boolean(issuePrice)} />
              </div>
            </>
          )}

          <SectionTitle>GMP History</SectionTitle>
          {history.isPending && <div className="aw-skeleton mt-3 h-40 rounded-card" />}
          {history.isError && (
            <p className="mt-2 text-[13px] text-dim">The GMP history is unavailable right now.</p>
          )}
          {history.data && points.length === 0 && (
            <p className="mt-2 text-[13px] text-dim">No GMP has been quoted for this IPO yet.</p>
          )}
          {points.length > 0 && (
            <div className="mt-3 overflow-hidden rounded-card border border-border">
              <table className="w-full text-[14px]">
                <thead className="bg-surface text-[13px] text-dim">
                  <tr>
                    <th className="px-3 py-3 text-left font-normal">Date</th>
                    <th className="px-3 py-3 text-right font-normal">GMP (₹)</th>
                    <th className="px-3 py-3 text-right font-normal">GMP %</th>
                    <th className="px-3 py-3 text-right font-normal">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {[...points].reverse().map((p) => (
                    <tr key={p.date} className="border-t border-border">
                      <td className="px-3 py-3.5">{formatLongDate(p.date)}</td>
                      <td className="num px-3 py-3.5 text-right" style={{ color: signColor(p.gmp) }}>
                        ₹{inr(p.gmp)}
                      </td>
                      <td className="num px-3 py-3.5 text-right">{issuePrice ? pct1(p.pct) : "—"}</td>
                      <td
                        className="num px-3 py-3.5 text-right"
                        style={{ color: signColor(p.change) ?? "var(--dim)" }}
                      >
                        {p.change === null ? "—" : `${p.change > 0 ? "+" : ""}${inr(p.change)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <SectionTitle>What is GMP?</SectionTitle>
          <p className="mt-2 text-[14px] leading-relaxed text-dim">
            Grey Market Premium (GMP) is the premium at which IPO shares trade unofficially before
            they list on the stock exchange. It reflects demand and gives an expected listing price:
            issue price plus GMP. Estimated profit per lot is lot size times GMP.
          </p>

          <div className="mt-5 flex gap-2 border-t border-border pt-4 text-[13px] text-dim">
            <InfoIcon size={16} className="mt-0.5 shrink-0" aria-hidden />
            <p>
              GMP is unofficial and can change rapidly. Always do your own research before investing.
              Data via InvestorGain{history.data?.updatedAt ? `, updated ${history.data.updatedAt}` : ""}.{" "}
              <Link href="/disclaimer" className="underline underline-offset-2 hover:no-underline">
                Disclaimer
              </Link>
            </p>
          </div>
        </>
      )}
    </div>
  );
}
