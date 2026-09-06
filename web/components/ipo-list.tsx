"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { FilterTabs, type TabOption } from "@/components/filter-tabs";
import { IpoRow, IpoListHeader } from "@/components/ipo-row";
import { PastList } from "@/components/past-list";
import {
  ListSkeleton,
  NoMatchesState,
  NoPansBanner,
  NoSearchMatchesState,
  UnreachableState,
} from "@/components/states";
import { usePans } from "@/hooks/use-pans";
import { useIpoSearch } from "@/hooks/use-ipo-search";
import { ipoListSchema, apiErrorSchema, type IpoList, type IpoListItem } from "@/lib/schemas";
import { derivePhase } from "@/lib/utils";

type Filter = "ongoing" | "upcoming" | "allotted" | "past";
type BoardFilter = "all" | "mainboard" | "sme";

/**
 * The three states an issue can be in, from an applicant's point of view.
 * Exhaustive by construction — every current IPO lands in exactly one, so
 * nothing is hidden by the absence of an "All" tab.
 *
 * "Ongoing" deliberately includes an issue that has closed but whose allotment
 * has not been published: from the applicant's side it is still in flight.
 */
function bucketOf(ipo: IpoListItem): Exclude<Filter, "past"> {
  if (ipo.allotment.available || ipo.listedOn || ipo.listing) return "allotted";
  // Dates over scraped status: an issue that opened overnight is no longer
  // upcoming, whatever the last sync recorded.
  return derivePhase(ipo) === "upcoming" ? "upcoming" : "ongoing";
}

async function fetchIpos(): Promise<IpoList> {
  const res = await fetch("/api/ipos", { cache: "no-store" });
  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    throw new Error(parsed.success ? parsed.data.error.message : "The service returned an error.");
  }

  const parsed = ipoListSchema.safeParse(body);
  if (!parsed.success) throw new Error("The IPO data was in an unexpected format.");
  return parsed.data;
}

const BOARDS: { value: BoardFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "mainboard", label: "Mainboard" },
  { value: "sme", label: "SME" },
];

export function IpoList() {
  const [filter, setFilter] = useState<Filter>("ongoing");
  const [board, setBoard] = useState<BoardFilter>("all");
  // Lifted here rather than kept local to IpoRow, so opening one row can
  // close whichever other one was open — only one detail panel expanded
  // at a time.
  const [openKey, setOpenKey] = useState<string | null>(null);
  // Only a *switch* — a different row already open — should scroll the newly
  // opened one into view: that's the case where a row collapsing elsewhere
  // shifts the page around and can leave things looking wrong wherever the
  // user's scroll happened to land. Opening the first row from a fully
  // closed list causes no such shift, so it opens exactly where it is.
  const [scrollOnOpen, setScrollOnOpen] = useState(false);
  const chosen = useRef(false);
  const { pans, ready } = usePans();
  const { query: search, setQuery: setSearch } = useIpoSearch();
  const q = search.trim().toLowerCase();
  const isSearching = q.length > 0;

  const query = useQuery({ queryKey: ["ipos"], queryFn: fetchIpos });

  // Board narrows the set first, so the tab counts reflect what the board
  // filter is actually showing rather than the unfiltered total.
  const scoped = useMemo(() => {
    const all = query.data?.ipos ?? [];
    return board === "all" ? all : all.filter((r) => r.board === board);
  }, [query.data, board]);

  const counts = useMemo(() => {
    const c = { ongoing: 0, upcoming: 0, allotted: 0 };
    for (const r of scoped) c[bucketOf(r)] += 1;
    return c;
  }, [scoped]);

  // Land on a tab that actually has something. Ongoing is what most visits are
  // for — issues currently in play — so it comes first; allotted is still a
  // reasonable fallback since checking a result is the other common reason to
  // open the app. Runs once, so the tab never moves under the user afterwards.
  useEffect(() => {
    if (chosen.current || !query.data) return;
    chosen.current = true;
    const first = (["ongoing", "allotted", "upcoming"] as const).find((b) => counts[b] > 0);
    if (first && first !== "ongoing") setFilter(first);
  }, [query.data, counts]);

  const rows = useMemo(() => {
    // A search spans every status — the tabs partition by where an issue
    // stands, not by what it's named, so bucketing would hide the very row
    // being searched for if it sits in a different tab than the current one.
    const list = isSearching
      ? scoped.filter((r) => r.name.toLowerCase().includes(q))
      : scoped.filter((r) => bucketOf(r) === filter);
    // Highest premium first within a bucket — the rows worth looking at.
    return [...list].sort((a, b) => (b.gmp ?? 0) - (a.gmp ?? 0));
  }, [scoped, filter, isSearching, q]);

  // Listing history is fetched separately and isn't searched here, so an
  // active search always falls back to the current cycle's list.
  const isPast = !isSearching && filter === "past";

  // Memoized so its identity is stable across renders that don't actually
  // change the counts (opening a row, for one) — FilterTabs re-measures and
  // scrolls the active tab into view whenever this reference changes, and a
  // fresh array on every render was firing that on every row toggle, which on
  // a scrolled-down page meant scrolling back up to reveal the tab strip.
  const tabs: TabOption<Filter>[] = useMemo(
    () => [
      { value: "ongoing", label: "Ongoing", count: counts.ongoing },
      { value: "upcoming", label: "Upcoming", count: counts.upcoming },
      { value: "allotted", label: "Allotted", count: counts.allotted },
      // No count: the listing history is fetched only when this tab is opened.
      { value: "past", label: "Past" },
    ],
    [counts]
  );

  return (
    <div>
      <div className="mb-4 space-y-3">
        {/* Tabs partition by status, which a search query cuts across — shown
            during a search they'd sit there unable to actually filter anything. */}
        {!isSearching && (
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0">
            <FilterTabs options={tabs} value={filter} onChange={setFilter} label="Filter IPOs by status" />
          </div>
        )}

        {/* The saved-PAN count used to sit here as a sentence. It was a status
            message wedged among controls, unactionable where it stood, and it
            wrapped badly on a phone — it now rides the PANs nav item, which is
            both always visible and the place you would go to act on it. */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Board does not apply to listing history, so it is hidden rather
              than shown disabled. */}
          <div className={`flex items-center gap-1.5 ${isPast ? "hidden" : ""}`} role="group" aria-label="Filter by board">
            {BOARDS.map((b) => {
              const active = board === b.value;
              return (
                <button
                  key={b.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setBoard(b.value)}
                  className={`inline-flex min-h-8 items-center rounded-pill border px-3 text-[12px] font-medium transition-colors duration-150 sm:min-h-0 sm:px-3 sm:py-1 ${
                    active
                      ? "border-transparent bg-chip text-text"
                      : "border-border text-dim hover:text-text"
                  }`}
                >
                  {b.label}
                </button>
              );
            })}
          </div>

          {isSearching && (
            <p className="text-[12px] text-dim" aria-live="polite">
              {rows.length} result{rows.length === 1 ? "" : "s"} for &ldquo;{search}&rdquo;
            </p>
          )}
        </div>
      </div>

      {/* Listing history is a different dataset with a different question
          ("how did it actually do"), so it gets its own list and columns. */}
      {isPast && <PastList />}

      {!isPast && query.isPending && <ListSkeleton />}

      {!isPast && query.isError && (
        <UnreachableState
          message={query.error instanceof Error ? query.error.message : "The request failed."}
          onRetry={() => query.refetch()}
          retrying={query.isFetching}
        />
      )}

      {!isPast && query.data && rows.length === 0 && isSearching && (
        <NoSearchMatchesState query={search} onReset={() => setSearch("")} />
      )}

      {!isPast && query.data && rows.length === 0 && !isSearching && (
        <NoMatchesState
          filter={[board === "all" ? "" : board, filter].filter(Boolean).join(" ")}
          // Clearing the board filter is the useful escape here — the tab is a
          // real state, not a mistake, so send them to one that has issues in it.
          onReset={() => {
            setBoard("all");
            const first = (["ongoing", "allotted", "upcoming"] as const).find((b) => counts[b] > 0);
            if (first) setFilter(first);
          }}
        />
      )}

      {!isPast && query.data && rows.length > 0 && (
        <>
          {/* Only actionable on Allotted: an Ongoing or Upcoming issue has no
              published result yet, so prompting for a PAN there is premature —
              the row itself already says so when expanded. A search bypasses
              the tab entirely, so it gets no opinion on this either. */}
          {!isSearching && filter === "allotted" && ready && pans.length === 0 && (
            <div className="mb-3">
              <NoPansBanner />
            </div>
          )}
          <IpoListHeader />
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            {rows.map((ipo) => {
              const key = `${ipo.source}:${ipo.slug}`;
              return (
                <IpoRow
                  key={key}
                  ipo={ipo}
                  pans={pans}
                  panStoreReady={ready}
                  open={openKey === key}
                  scrollOnOpen={scrollOnOpen}
                  onToggle={() => {
                    const next = openKey === key ? null : key;
                    setScrollOnOpen(openKey !== null && next !== null);
                    setOpenKey(next);
                  }}
                />
              );
            })}
          </div>
          {/* Two facts earn their place here: a dash is a coverage gap rather
              than a zero, and the premium is not a quoted price. Which tracker
              a given figure came from is not one of them — the day-wise panel
              names its source where that actually matters, and the rest was
              implementation detail dressed up as a disclosure. */}
          <p className="mt-6 text-[12px] text-dim">
            A dash means the issue has not opened yet, not zero demand. Grey market premium is
            unofficial and is not a quoted price.{" "}
            <Link href="/disclaimer" className="underline underline-offset-2 hover:no-underline">
              Disclaimer
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
