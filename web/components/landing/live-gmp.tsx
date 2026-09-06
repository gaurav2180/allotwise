"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { IpoLogo } from "@/components/ipo-logo";
import { ipoListSchema, type IpoList } from "@/lib/schemas";
import { inr, signedPct, times } from "@/lib/utils";

async function fetchIpos(): Promise<IpoList> {
  const res = await fetch("/api/ipos", { cache: "no-store" });
  if (!res.ok) throw new Error("unavailable");
  const parsed = ipoListSchema.safeParse(await res.json());
  if (!parsed.success) throw new Error("shape");
  return parsed.data;
}

/**
 * The hero's right half: the product's actual table, running against the live
 * API. Not a screenshot and not seeded data — if the service is down it says so
 * rather than showing invented rows.
 */
export function LiveGmp() {
  const { data, isPending, isError, isFetching } = useQuery({
    queryKey: ["ipos"],
    queryFn: fetchIpos,
    // The section is labelled "Live" — back that with an actual poll instead
    // of only refetching on a full page reload. Backend GMP sync runs every
    // 30 minutes (SCHEDULER_GMP_MS), so anything faster than that just adds
    // load without ever seeing newer numbers; 2 minutes is comfortably inside
    // that window while a visitor is actually looking at the page.
    refetchInterval: 2 * 60_000,
    refetchIntervalInBackground: false,
  });

  const rows = (data?.ipos ?? [])
    .filter((r) => r.status === "open" || r.status === "upcoming")
    .sort((a, b) => (b.gmp ?? 0) - (a.gmp ?? 0))
    .slice(0, 6);

  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface">
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="text-[13px] font-medium">Live grey market premium</h2>
        {/* Backs up the "Live" label during the 2-minute background poll —
            without this, newer numbers would swap in with no visible cause. */}
        <span className="text-[11px] text-dim" aria-live="polite">
          {isFetching && !isPending ? "Updating…" : "Open & upcoming"}
        </span>
      </div>

      {isPending && (
        <div className="divide-y divide-border" aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <div className="aw-skeleton size-9 shrink-0 rounded-control" />
              <div className="aw-skeleton h-4 w-40 rounded-pill" />
              <div className="aw-skeleton ml-auto h-4 w-12 rounded-pill" />
            </div>
          ))}
        </div>
      )}

      {isError && (
        <p className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--negative)" }}>
          The IPO data service is unreachable right now, so there is nothing real to show here.
        </p>
      )}

      {data && rows.length === 0 && (
        <p className="px-4 py-8 text-center text-[13px] text-dim">
          No issues are open or upcoming today. The Indian primary market runs in bursts.
        </p>
      )}

      {data && rows.length > 0 && (
        <>
          <div className="flex items-center gap-3 px-4 pt-2 pb-1 text-[11px] text-dim">
            <span className="flex-1">IPO</span>
            <span className="w-14 text-right">GMP</span>
            <span className="w-16 text-right">Est. gain</span>
            <span className="hidden w-14 text-right sm:block">Subs.</span>
          </div>
          <div className="divide-y divide-border">
            {rows.map((r) => {
              const gain = r.estGainPct ?? 0;
              return (
                <div key={r.slug} className="flex items-center gap-3 px-4 py-2.5">
                  <IpoLogo name={r.name} src={r.logo} />
                  <span className="min-w-0 flex-1 truncate text-[13px]">{r.name}</span>
                  <span className="num w-14 text-right text-[13px]">
                    {r.gmp === null ? "—" : `₹${inr(r.gmp)}`}
                  </span>
                  <span
                    className="num w-16 text-right text-[13px]"
                    style={{
                      color: gain > 0 ? "var(--positive)" : gain < 0 ? "var(--negative)" : "var(--dim)",
                    }}
                  >
                    {signedPct(r.estGainPct)}
                  </span>
                  <span className="num hidden w-14 text-right text-[13px] text-dim sm:block">
                    {r.subscription?.overall != null ? times(r.subscription.overall) : "—"}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
            <p className="text-[11px] text-dim">
              {data.attribution[0] ?? "Grey market premium is unofficial."}{" "}
              <Link href="/disclaimer" className="underline underline-offset-2 hover:no-underline">
                Disclaimer
              </Link>
            </p>
            <Link href="/app" className="-my-2 inline-flex min-h-11 shrink-0 items-center text-[12px] underline underline-offset-2 hover:no-underline sm:min-h-0 sm:py-2">
              See all {data.count}
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
