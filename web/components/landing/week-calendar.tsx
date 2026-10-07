"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { IpoHoverCard, type HoverTarget } from "@/components/landing/ipo-hover-card";
import { useIpos } from "@/hooks/use-ipos";
import type { IpoListItem } from "@/lib/schemas";
import { cn } from "@/lib/utils";

type Kind = "allotment" | "listing" | "opens" | "closes";

const KINDS: { kind: Kind; label: string; color: string }[] = [
  { kind: "allotment", label: "Allotment", color: "var(--highlight)" },
  { kind: "listing", label: "Listing", color: "var(--positive)" },
  { kind: "opens", label: "Opens", color: "var(--accent)" },
  { kind: "closes", label: "Closes", color: "var(--dim)" },
];
const COLOR = Object.fromEntries(KINDS.map((k) => [k.kind, k.color])) as Record<Kind, string>;
const ORDER: Record<Kind, number> = { allotment: 0, listing: 1, opens: 2, closes: 3 };

/** Local calendar date as YYYY-MM-DD — the reader's day, not UTC's. */
const localIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

type Event = { kind: Kind; ipo: IpoListItem };

function eventsByDay(ipos: IpoListItem[], days: string[]) {
  const map = new Map<string, Event[]>(days.map((d) => [d, []]));
  for (const ipo of ipos) {
    const add = (kind: Kind, date: string | null) => {
      if (date && map.has(date)) map.get(date)!.push({ kind, ipo });
    };
    add("opens", ipo.openDate);
    add("closes", ipo.closeDate);
    add("allotment", ipo.allotmentDate);
    add("listing", ipo.listingDate);
  }
  for (const list of map.values()) list.sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
  return map;
}

type Hover = { enter: (e: Event, el: HTMLElement) => void; leave: () => void };

function Chip({ e, hover }: { e: Event; hover?: Hover }) {
  return (
    <Link
      href="/app"
      // The card shows the same facts as the title would, so it replaces it
      // wherever it is wired; the plain title stays for the phone agenda.
      title={hover ? undefined : `${KINDS.find((k) => k.kind === e.kind)!.label}: ${e.ipo.name}`}
      onMouseEnter={hover ? (ev) => hover.enter(e, ev.currentTarget) : undefined}
      onMouseLeave={hover?.leave}
      onFocus={hover ? (ev) => hover.enter(e, ev.currentTarget) : undefined}
      onBlur={hover?.leave}
      className="flex items-center gap-2 rounded-control px-2 py-1.5 transition-[background-color,transform] duration-150 hover:bg-row-hover hover:translate-x-0.5 focus-visible:bg-row-hover"
    >
      {e.ipo.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={e.ipo.logo} alt="" width={18} height={18} loading="lazy" className="size-4.5 shrink-0 rounded-[4px] bg-white object-contain" />
      ) : (
        <span className="grid size-4.5 shrink-0 place-items-center rounded-[4px] bg-chip text-[9px] font-semibold text-dim">
          {e.ipo.name.slice(0, 1)}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-[12px] leading-tight font-medium">{e.ipo.name}</span>
        <span className="block text-[10px] leading-tight" style={{ color: COLOR[e.kind] }}>
          {KINDS.find((k) => k.kind === e.kind)!.label}
        </span>
      </span>
    </Link>
  );
}

/**
 * The next seven days of the primary market, from the live list: every issue
 * opening, closing, publishing allotment or listing. Allotment — the moment
 * the product exists for — carries the gold.
 */
export function WeekCalendar() {
  const { data, isPending, isError } = useIpos();

  // One card shared by every entry. A short delay before it opens keeps it from
  // flickering as the cursor crosses the grid; it closes a beat after leaving,
  // so moving between neighbours reads as one card sliding rather than two.
  const [target, setTarget] = useState<HoverTarget | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const hover: Hover = {
    enter: useCallback((e: Event, el: HTMLElement) => {
      clearTimeout(closeTimer.current);
      const k = KINDS.find((x) => x.kind === e.kind)!;
      const show = () =>
        setTarget({ ipo: e.ipo, label: k.label, color: k.color, step: e.kind, rect: el.getBoundingClientRect() });
      clearTimeout(openTimer.current);
      // Switching between entries is immediate; the first open waits.
      if (target) show();
      else openTimer.current = setTimeout(show, 90);
    }, [target]),
    leave: useCallback(() => {
      clearTimeout(openTimer.current);
      closeTimer.current = setTimeout(() => setTarget(null), 100);
    }, []),
  };

  // A card anchored to a position that has since moved would float in the
  // wrong place, so scrolling or Escape simply dismisses it.
  useEffect(() => {
    if (!target) return;
    const close = () => setTarget(null);
    const key = (ev: KeyboardEvent) => ev.key === "Escape" && close();
    window.addEventListener("scroll", close, { passive: true });
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("scroll", close);
      window.removeEventListener("keydown", key);
    };
  }, [target]);

  const now = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    return { iso: localIso(d), d };
  });
  const byDay = eventsByDay(data?.ipos ?? [], days.map((d) => d.iso));
  const total = [...byDay.values()].reduce((n, l) => n + l.length, 0);

  return (
    <div>
      <ul className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Legend">
        {KINDS.map((k) => (
          <li key={k.kind} className="text-[12px] font-medium" style={{ color: k.color }}>
            {k.label}
          </li>
        ))}
      </ul>

      {/* Phones: an agenda, one day per row, so names are never squeezed into
          a seventh of the screen. Days with nothing on them are left out. */}
      <ol className="mt-5 space-y-4 md:hidden">
        {isPending && <li className="aw-skeleton h-24 rounded-card" />}
        {days.map(({ iso, d }, i) => {
          const events = byDay.get(iso) ?? [];
          if (!events.length) return null;
          return (
            <li key={iso} className="overflow-hidden rounded-card border border-border">
              <div className="flex items-baseline gap-2 border-b border-border bg-surface px-3 py-2">
                <span className="num text-[16px] font-semibold" style={{ color: i === 0 ? "var(--highlight)" : undefined }}>
                  {d.getDate()}
                </span>
                <span className="text-[12px] text-dim">
                  {i === 0 ? "Today" : d.toLocaleDateString("en-IN", { weekday: "long" })}
                </span>
              </div>
              <div className="grid gap-0.5 p-1.5">
                {events.map((e) => (
                  <Chip key={`${e.kind}-${e.ipo.slug}`} e={e} />
                ))}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-5 hidden md:block">
        <ol className="grid grid-cols-7 overflow-hidden rounded-card border border-border">
          {days.map(({ iso, d }, i) => {
            const events = byDay.get(iso) ?? [];
            const today = i === 0;
            return (
              <li key={iso} className={cn("flex min-h-56 flex-col", i > 0 && "border-l border-border", today && "bg-surface")}>
                <div className="flex items-baseline justify-between border-b border-border px-3 py-2.5">
                  <span className={cn("text-[12px] font-medium", today ? "text-text" : "text-dim")}>
                    {today ? "Today" : d.toLocaleDateString("en-IN", { weekday: "short" })}
                  </span>
                  <span
                    className="num text-[18px] font-semibold tracking-tight"
                    style={{ color: today ? "var(--highlight)" : undefined }}
                  >
                    {d.getDate()}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-0.5 p-1.5">
                  {isPending &&
                    [0, 1].map((k) => <div key={k} className="aw-skeleton h-9 rounded-control" />)}
                  {events.map((e) => (
                    <Chip key={`${e.kind}-${e.ipo.slug}`} e={e} hover={hover} />
                  ))}
                  {data && events.length === 0 && (
                    <span className="m-auto text-[11px] text-dim/60">—</span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {target && <IpoHoverCard target={target} />}

      {isError && (
        <p className="mt-3 text-[13px]" style={{ color: "var(--negative)" }}>
          The IPO calendar is unreachable right now.
        </p>
      )}
      {data && total === 0 && (
        <p className="mt-3 text-[13px] text-dim">A quiet week — no dates fall in the next seven days.</p>
      )}
    </div>
  );
}
