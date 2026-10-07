"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { FilterTabs, type TabOption } from "@/components/filter-tabs";
import { Select } from "@/components/ui/select";
import { IpoRow, IpoListHeader } from "@/components/ipo-row";
import {
  ListSkeleton,
  NoMatchesState,
  NoPansBanner,
  NoSearchMatchesState,
  UnreachableState,
} from "@/components/states";
import { usePans } from "@/hooks/use-pans";
import { useIpoSearch } from "@/hooks/use-ipo-search";
import { useIpos } from "@/hooks/use-ipos";
import type { IpoListItem } from "@/lib/schemas";
import { allotmentOut, derivePhase } from "@/lib/utils";

type Filter = "ongoing" | "upcoming" | "allotted";
type BoardFilter = "all" | "mainboard" | "sme";

/**
 * The three states an issue can be in, from an applicant's point of view.
 * Exhaustive by construction — every current IPO lands in exactly one, so
 * nothing is hidden by the absence of an "All" tab.
 *
 * "Ongoing" deliberately includes an issue that has closed but whose allotment
 * has not been published: from the applicant's side it is still in flight.
 */
function bucketOf(ipo: IpoListItem): Filter {
  if (ipo.allotment.available || ipo.listedOn || ipo.listing || allotmentOut(ipo)) return "allotted";
  // Dates over scraped status: an issue that opened overnight is no longer
  // upcoming, whatever the last sync recorded.
  return derivePhase(ipo) === "upcoming" ? "upcoming" : "ongoing";
}

/**
 * Ordering, one comparator per tab.
 *
 * Everything was previously ranked by premium, highest first, which read as
 * scrambled the moment a date appeared on the row: the Ongoing tab ran
 * "closes in 3d, 3d, 4d, 4d, 3d" down the screen. A premium is worth ranking by
 * only when the rows are otherwise interchangeable, and they never are here —
 * each tab has a deadline that matters more.
 *
 * Every comparator ends on the name so equal dates resolve the same way on
 * every render, rather than depending on the order the API happened to return.
 */
const FAR_FUTURE = "9999-12-31";
const LONG_PAST = "0000-01-01";

const byName = (a: IpoListItem, b: IpoListItem) => a.name.localeCompare(b.name);

/**
 * Open issues first, closing soonest — then those closed and awaiting allotment.
 *
 * `now` is a parameter rather than read from the clock inside, so a comparator
 * is a pure function of its inputs. Phase depends on today's date, which made
 * these untestable without the fixtures rotting: a test pinned to real dates
 * passed when written and failed ten days later for no reason but the calendar.
 */
export function compareOngoing(a: IpoListItem, b: IpoListItem, now = new Date()): number {
  const openRank = (r: IpoListItem) => (derivePhase(r, now) === "open" ? 0 : 1);
  const diff = openRank(a) - openRank(b);
  if (diff !== 0) return diff;

  // Still open: the close date is a deadline, so the nearest one leads.
  if (openRank(a) === 0) {
    return (a.closeDate ?? FAR_FUTURE).localeCompare(b.closeDate ?? FAR_FUTURE) || byName(a, b);
  }
  // Closed and waiting: whichever closed most recently is furthest from its
  // allotment, but it is also the one the reader just applied to.
  return (b.closeDate ?? LONG_PAST).localeCompare(a.closeDate ?? LONG_PAST) || byName(a, b);
}

/** Opening soonest first; an issue with no date announced sits at the end. */
export function compareUpcoming(a: IpoListItem, b: IpoListItem, _now = new Date()): number {
  // A null date cannot be placed among real ones, and sorting it as "" would
  // put Jio and PhonePe above an issue opening tomorrow.
  return (a.openDate ?? FAR_FUTURE).localeCompare(b.openDate ?? FAR_FUTURE) || byName(a, b);
}

/** Allotment out but not yet listed first — there is still something to come. */
export function compareAllotted(a: IpoListItem, b: IpoListItem, _now = new Date()): number {
  const listedRank = (r: IpoListItem) => (r.listedOn || r.listing ? 1 : 0);
  const diff = listedRank(a) - listedRank(b);
  if (diff !== 0) return diff;

  // Most recent first within each group: a listing from yesterday is worth more
  // than one from a fortnight ago.
  const key = (r: IpoListItem) => r.listedOn ?? r.closeDate ?? LONG_PAST;
  return key(b).localeCompare(key(a)) || byName(a, b);
}

/**
 * Search spans every tab, so it needs one order across all of them: what is
 * live, then what is coming, then what is done.
 */
export function compareSearch(a: IpoListItem, b: IpoListItem, now = new Date()): number {
  const phaseRank = (r: IpoListItem) => {
    const phase = derivePhase(r, now);
    return phase === "open" ? 0 : phase === "upcoming" ? 1 : 2;
  };
  const diff = phaseRank(a) - phaseRank(b);
  if (diff !== 0) return diff;
  return phaseRank(a) === 1 ? compareUpcoming(a, b, now) : compareOngoing(a, b, now);
}

const BOARDS: { value: BoardFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "mainboard", label: "Mainboard" },
  { value: "sme", label: "SME" },
];

// Where the reader left the list, kept for the life of the tab so going to the
// GMP page or PANs and back lands on the same tab, filter and open row. Module
// scope rather than storage: it resets on a full reload, so the server-rendered
// defaults and the first client render always agree.
const remembered: { filter: Filter; board: BoardFilter; openKey: string | null; chosen: boolean } = {
  filter: "allotted",
  board: "all",
  openKey: null,
  chosen: false,
};

export function IpoList() {
  const [filter, setFilterState] = useState<Filter>(() => remembered.filter);
  const [board, setBoardState] = useState<BoardFilter>(() => remembered.board);
  // Lifted here rather than kept local to IpoRow, so opening one row can
  // close whichever other one was open — only one detail panel expanded
  // at a time.
  const [openKey, setOpenKeyState] = useState<string | null>(() => remembered.openKey);
  const setFilter = (v: Filter) => {
    remembered.filter = v;
    setFilterState(v);
  };
  const setBoard = (v: BoardFilter) => {
    remembered.board = v;
    setBoardState(v);
  };
  const setOpenKey = (v: string | null) => {
    remembered.openKey = v;
    setOpenKeyState(v);
  };
  // Only a *switch* — a different row already open — should scroll the newly
  // opened one into view: that's the case where a row collapsing elsewhere
  // shifts the page around and can leave things looking wrong wherever the
  // user's scroll happened to land. Opening the first row from a fully
  // closed list causes no such shift, so it opens exactly where it is.
  const [scrollOnOpen, setScrollOnOpen] = useState(false);
  const chosen = useRef(remembered.chosen);
  const { pans, ready } = usePans();
  const { query: search, setQuery: setSearch } = useIpoSearch();
  const q = search.trim().toLowerCase();
  const isSearching = q.length > 0;

  const query = useIpos();

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

  // Land on a tab that actually has something. Allotted comes first and is
  // the default — checking a result is the reason most visits happen — with
  // ongoing and upcoming as fallbacks. Runs once, so the tab never moves under
  // the user afterwards.
  useEffect(() => {
    if (chosen.current || !query.data) return;
    chosen.current = true;
    remembered.chosen = true;
    const first = (["allotted", "ongoing", "upcoming"] as const).find((b) => counts[b] > 0);
    if (first && first !== "allotted") {
      remembered.filter = first;
      setFilterState(first);
    }
  }, [query.data, counts]);

  const rows = useMemo(() => {
    // A search spans every status — the tabs partition by where an issue
    // stands, not by what it's named, so bucketing would hide the very row
    // being searched for if it sits in a different tab than the current one.
    const list = isSearching
      ? scoped.filter((r) => r.name.toLowerCase().includes(q))
      : scoped.filter((r) => bucketOf(r) === filter);

    if (isSearching) return [...list].sort(compareSearch);
    if (filter === "allotted") return [...list].sort(compareAllotted);
    if (filter === "upcoming") return [...list].sort(compareUpcoming);
    return [...list].sort(compareOngoing);
  }, [scoped, filter, isSearching, q]);

  // Memoized so its identity is stable across renders that don't actually
  // change the counts (opening a row, for one) — FilterTabs re-measures and
  // scrolls the active tab into view whenever this reference changes, and a
  // fresh array on every render was firing that on every row toggle, which on
  // a scrolled-down page meant scrolling back up to reveal the tab strip.
  const tabs: TabOption<Filter>[] = useMemo(
    () => [
      { value: "allotted", label: "Allotted", count: counts.allotted },
      { value: "ongoing", label: "Ongoing", count: counts.ongoing },
      { value: "upcoming", label: "Upcoming", count: counts.upcoming },
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
          <Select value={board} onChange={setBoard} options={BOARDS} label="Filter by board" />

          {isSearching && (
            <p className="text-[12px] text-dim" aria-live="polite">
              {rows.length} result{rows.length === 1 ? "" : "s"} for &ldquo;{search}&rdquo;
            </p>
          )}
        </div>
      </div>

      {/* Listing history is a different dataset with a different question
          ("how did it actually do"), so it gets its own list and columns. */}
      {query.isPending && <ListSkeleton />}

      {query.isError && (
        <UnreachableState
          message={query.error instanceof Error ? query.error.message : "The request failed."}
          onRetry={() => query.refetch()}
          retrying={query.isFetching}
        />
      )}

      {query.data && rows.length === 0 && isSearching && (
        <NoSearchMatchesState query={search} onReset={() => setSearch("")} />
      )}

      {query.data && rows.length === 0 && !isSearching && (
        <NoMatchesState
          filter={[board === "all" ? "" : board, filter].filter(Boolean).join(" ")}
          // Clearing the board filter is the useful escape here — the tab is a
          // real state, not a mistake, so send them to one that has issues in it.
          onReset={() => {
            setBoard("all");
            const first = (["allotted", "ongoing", "upcoming"] as const).find((b) => counts[b] > 0);
            if (first) setFilter(first);
          }}
        />
      )}

      {query.data && rows.length > 0 && (
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
            GMP and its percentage are shown exactly as InvestorGain quotes them. GMP is unofficial
            and is not a quoted price.{" "}
            <Link href="/disclaimer" className="underline underline-offset-2 hover:no-underline">
              Disclaimer
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
