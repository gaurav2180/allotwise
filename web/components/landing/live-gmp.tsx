"use client";

import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { IpoLogo } from "@/components/ipo-logo";
import { useIpos } from "@/hooks/use-ipos";
import { derivePhase, estProfitPerLot, inr, signedPct } from "@/lib/utils";

const tone = (n: number | null) =>
  n === null || n === 0 ? "var(--dim)" : n > 0 ? "var(--positive)" : "var(--negative)";

/**
 * The hero's right half: the product's actual board, running against the live
 * API. Not a screenshot and not seeded data — if the service is down it says so
 * rather than showing invented rows. Each premium is drawn as a bar against the
 * strongest one, so the board reads at a glance the way a quote screen does.
 */
export function LiveGmp() {
  const { data, isPending, isError, isFetching } = useIpos();

  // Everything not yet listed — closed issues awaiting listing still trade in
  // the grey market, and are often the ones people are watching most closely.
  const rows = (data?.ipos ?? [])
    .filter((r) => !r.listing && !r.listedOn && r.status !== "listed" && r.gmp !== null)
    .sort((a, b) => (b.estGainPct ?? -Infinity) - (a.estGainPct ?? -Infinity))
    .slice(0, 6);
  const top = Math.max(1, ...rows.map((r) => Math.abs(r.estGainPct ?? 0)));

  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface shadow-[0_1px_0_rgba(0,0,0,0.02),0_24px_48px_-24px_rgba(21,21,26,0.18)]">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-[13px] font-semibold">Grey market board</h2>
          <p className="text-[11px] text-dim" aria-live="polite">
            {isFetching && !isPending ? "Updating…" : "Not yet listed, strongest first"}
          </p>
        </div>
        <span className="num text-[11px] text-dim">Est. profit / lot</span>
      </div>

      {isPending && (
        <div className="divide-y divide-border" aria-busy="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <div className="aw-skeleton size-9 shrink-0 rounded-control" />
              <div className="flex-1 space-y-1.5">
                <div className="aw-skeleton h-3.5 w-40 rounded-pill" />
                <div className="aw-skeleton h-1 w-24 rounded-pill" />
              </div>
              <div className="aw-skeleton h-4 w-14 rounded-pill" />
            </div>
          ))}
        </div>
      )}

      {isError && (
        <p className="px-4 py-10 text-center text-[13px]" style={{ color: "var(--negative)" }}>
          The IPO data service is unreachable right now, so there is nothing real to show here.
        </p>
      )}

      {data && rows.length === 0 && (
        <p className="px-4 py-10 text-center text-[13px] text-dim">
          No issue waiting to list has a grey market quote today. The primary market runs in bursts.
        </p>
      )}

      {data && rows.length > 0 && (
        <>
          <ol className="divide-y divide-border">
            {rows.map((r) => {
              const pct = r.estGainPct;
              const profit = estProfitPerLot(r.lotSize, r.gmp);
              const phase = derivePhase(r);
              return (
                <li key={r.slug} className="flex items-center gap-3 px-4 py-3">
                  <IpoLogo name={r.name} src={r.logo} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-[13px] font-medium">{r.name}</span>
                      <span className="hidden shrink-0 text-[10px] tracking-wide text-dim uppercase sm:inline">
                        {r.board === "sme" ? "SME" : "Main"} ·{" "}
                        {phase === "open" ? "Open" : phase === "upcoming" ? "Upcoming" : "Listing soon"}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1 flex-1 overflow-hidden rounded-pill bg-chip" aria-hidden>
                        {pct !== null && (
                          <div
                            className="h-full rounded-pill"
                            style={{
                              width: `${Math.max(2, (Math.abs(pct) / top) * 100)}%`,
                              background: tone(pct),
                            }}
                          />
                        )}
                      </div>
                      <span className="num w-23 shrink-0 text-right text-[12px]" style={{ color: tone(r.gmp) }}>
                        ₹{inr(r.gmp)}
                        {pct !== null && <span className="text-[10px]"> ({signedPct(pct)})</span>}
                      </span>
                    </div>
                  </div>
                  <span className="num w-16 shrink-0 text-right text-[13px] font-medium" style={{ color: tone(profit) }}>
                    {profit === null ? "—" : `₹${inr(profit)}`}
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
            <p className="text-[11px] text-dim">
              GMP via InvestorGain · unofficial.{" "}
              <Link href="/disclaimer" className="underline underline-offset-2 hover:no-underline">
                Disclaimer
              </Link>
            </p>
            <Link
              href="/app"
              className="-my-2 inline-flex min-h-11 shrink-0 items-center gap-1 text-[12px] font-medium sm:min-h-0 sm:py-2"
            >
              All {data.count} IPOs
              <ArrowRightIcon size={12} weight="bold" aria-hidden />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
