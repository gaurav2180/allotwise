"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { IpoLogo } from "@/components/ipo-logo";
import { ListSkeleton, UnreachableState } from "@/components/states";
import { apiErrorSchema, listingsSchema, type Listing } from "@/lib/schemas";
import { inr, signedPct } from "@/lib/utils";

const PAGE = 60;

async function fetchListings() {
  const res = await fetch("/api/listings", { cache: "no-store" });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    throw new Error(parsed.success ? parsed.data.error.message : "The request failed.");
  }
  const parsed = listingsSchema.safeParse(body);
  if (!parsed.success) throw new Error("The listing history was in an unexpected format.");
  return parsed.data;
}

/** Columns differ from the live list: a listed IPO has an outcome, not a forecast. */
function PastHeader() {
  return (
    <div className="flex items-center gap-3 px-4 pb-2 sm:gap-4" aria-hidden>
      <span className="size-9 shrink-0" />
      <div className="min-w-0 flex-1" />
      <div className="flex shrink-0 items-center gap-3 sm:gap-4">
        <div className="hidden w-20 text-right text-[11px] text-dim sm:block">Issue price</div>
        <div className="w-20 text-right text-[11px] text-dim">Listed at</div>
        <div className="w-24 text-right text-[11px] text-dim">Result</div>
      </div>
    </div>
  );
}

function PastRow({ row }: { row: Listing }) {
  const down = row.gainPct < 0;
  const flat = row.gainPct === 0;
  // A listing that went badly is information, so it gets the full negative
  // colour — no muting, no rounding toward zero.
  const color = flat ? "var(--dim)" : down ? "var(--negative)" : "var(--positive)";

  return (
    <div className="flex items-center gap-3 border-t border-border px-3 py-3 first:border-t-0 sm:gap-4 sm:px-4">
      <IpoLogo name={row.name} src={row.logo} />

      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium">{row.name}</div>
        <div className="mt-0.5 text-[12px] text-dim">
          Listed
          {row.gmp !== null && (
            <>
              {" · "}
              <span className="num font-normal">GMP was ₹{inr(row.gmp)}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3 sm:gap-4">
        <div className="num hidden w-20 text-right text-[13px] sm:block">₹{inr(row.issuePrice)}</div>
        <div className="num w-20 text-right text-[13px]">₹{inr(row.listingPrice)}</div>
        <div className="num w-24 text-right text-[14px]" style={{ color }}>
          {signedPct(row.gainPct)}
        </div>
      </div>
    </div>
  );
}

type Outcome = "all" | "up" | "down";

function OutcomeChip({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`num inline-flex min-h-11 items-center rounded-pill border px-3 font-medium transition-colors duration-150 sm:min-h-0 sm:px-2.5 sm:py-1 ${
        active ? "border-transparent bg-chip" : "border-border hover:bg-row-hover"
      }`}
      style={{ color: color ?? "var(--text)" }}
    >
      {label}
    </button>
  );
}

export function PastList() {
  const [shown, setShown] = useState(PAGE);
  const [outcome, setOutcome] = useState<Outcome>("all");
  const query = useQuery({ queryKey: ["listings"], queryFn: fetchListings, staleTime: 30 * 60_000 });

  if (query.isPending) return <ListSkeleton />;

  if (query.isError) {
    return (
      <UnreachableState
        message={query.error instanceof Error ? query.error.message : "The request failed."}
        onRetry={() => query.refetch()}
        retrying={query.isFetching}
      />
    );
  }

  const data = query.data!;
  const filtered =
    outcome === "all"
      ? data.listings
      : data.listings.filter((l) => (outcome === "up" ? l.gainPct > 0 : l.gainPct < 0));
  const rows = filtered.slice(0, shown);

  const select = (next: Outcome) => {
    setOutcome(next);
    setShown(PAGE);
  };

  return (
    <div>
      {/* Both sides of the record, and both are reachable. The list is newest
          first, so without these the losses sit a hundred rows down — which is
          exactly the information a user needs before believing a GMP. */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px]">
        <OutcomeChip active={outcome === "all"} onClick={() => select("all")} label={`All ${data.count}`} />
        <OutcomeChip
          active={outcome === "up"}
          onClick={() => select("up")}
          label={`${data.gains} up`}
          color="var(--positive)"
        />
        <OutcomeChip
          active={outcome === "down"}
          onClick={() => select("down")}
          label={`${data.losses} down`}
          color="var(--negative)"
        />
        <span className="text-dim">at listing</span>
      </div>

      <PastHeader />
      <div className="overflow-hidden rounded-card border border-border bg-surface">
        {rows.map((r) => (
          <PastRow key={`${r.name}-${r.issuePrice}-${r.listingPrice}`} row={r} />
        ))}
      </div>

      {shown < filtered.length && (
        <div className="mt-3 flex justify-center">
          <button
            onClick={() => setShown((s) => s + PAGE)}
            className="inline-flex h-10 items-center rounded-control border border-border bg-surface px-4 text-[13px] font-medium hover:bg-row-hover sm:h-9"
          >
            Show {Math.min(PAGE, filtered.length - shown)} more
          </button>
        </div>
      )}

      <p className="mt-5 text-[12px] text-dim">
        Listing price is the opening price on debut, against the issue price. It is not the price
        today.
      </p>
    </div>
  );
}
