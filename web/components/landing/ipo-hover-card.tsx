"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { IpoLogo } from "@/components/ipo-logo";
import { GmpSparkline } from "@/components/gmp-sparkline";
import { gmpHistoryQuery } from "@/hooks/use-gmp-history";
import type { IpoListItem } from "@/lib/schemas";
import { estProfitPerLot, formatDate, formatIssueSize, formatPriceBand, inr, signedPct, times } from "@/lib/utils";

export type HoverTarget = {
  ipo: IpoListItem;
  /** The event being hovered, e.g. "Allotment" — highlighted in the timeline. */
  label: string;
  color: string;
  /** Which step of the timeline it is. */
  step: "opens" | "closes" | "allotment" | "listing";
  rect: DOMRect;
};

const WIDTH = 296;
const GAP = 12;
const MARGIN = 10;

const tone = (n: number | null) =>
  n === null || n === 0 ? "var(--dim)" : n > 0 ? "var(--positive)" : "var(--negative)";

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] tracking-wide text-dim uppercase">{label}</div>
      <div className="num mt-0.5 truncate text-[14px] font-semibold" style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}

const STEPS: { key: HoverTarget["step"]; label: string; date: (i: IpoListItem) => string | null }[] = [
  { key: "opens", label: "Opens", date: (i) => i.openDate },
  { key: "closes", label: "Closes", date: (i) => i.closeDate },
  { key: "allotment", label: "Allotment", date: (i) => i.allotmentDate },
  { key: "listing", label: "Listing", date: (i) => i.listingDate },
];

/**
 * A card that floats beside the hovered calendar entry: the IPO's price,
 * premium, size and timeline, with the premium's trend drawn from the same day-
 * wise history the GMP page uses. Portalled to the body and positioned from the
 * entry's rectangle, because the calendar clips its own overflow; it flips to
 * the entry's left when the right edge of the screen is too near, and is
 * clamped vertically so it never leaves the viewport. Purely informational —
 * it takes no pointer events, so it can never get between the cursor and the
 * next entry.
 */
export function IpoHoverCard({ target }: { target: HoverTarget }) {
  const { ipo, rect } = target;
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number; side: "right" | "left" } | null>(null);

  const history = useQuery(gmpHistoryQuery(ipo.slug));
  const values = history.data?.history.map((p) => p.gmp) ?? [];

  // Positioned only once its own height is known, and shown a frame later, so
  // it never flashes at the wrong place before settling.
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 320;
    const side = window.innerWidth - rect.right >= WIDTH + GAP + MARGIN ? "right" : "left";
    const left = side === "right" ? rect.right + GAP : Math.max(MARGIN, rect.left - GAP - WIDTH);
    const wanted = rect.top + rect.height / 2 - h / 2;
    const top = Math.min(Math.max(MARGIN, wanted), Math.max(MARGIN, window.innerHeight - h - MARGIN));
    setPlace({ left, top, side });
  }, [rect, values.length]);

  const profit = estProfitPerLot(ipo.lotSize, ipo.gmp);
  const today = new Date().toISOString().slice(0, 10);
  const band = formatPriceBand(ipo.priceBand);

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      className="pointer-events-none fixed z-50 rounded-card border border-border bg-surface p-4 shadow-[0_24px_60px_-18px_rgba(0,0,0,0.45)]"
      style={{
        width: WIDTH,
        left: place?.left ?? 0,
        top: place?.top ?? 0,
        opacity: place ? 1 : 0,
        transform: place ? "scale(1)" : "scale(0.96)",
        transformOrigin: place?.side === "left" ? "right center" : "left center",
        transition: "opacity 160ms ease-out, transform 200ms cubic-bezier(0.22, 1, 0.36, 1)",
      }}
    >
      <div className="flex items-center gap-3">
        <IpoLogo name={ipo.name} src={ipo.logo} />
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold">{ipo.name}</div>
          <div className="text-[11px] text-dim">
            {ipo.board === "sme" ? "SME" : "Mainboard"}
            <span className="mx-1.5" aria-hidden>
              ·
            </span>
            <span style={{ color: target.color }}>{target.label}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3.5">
        <Stat label="Price band" value={band ?? "—"} />
        <Stat label="Lot size" value={ipo.lotSize ? inr(ipo.lotSize) : "—"} />
        <Stat
          label="GMP"
          value={ipo.gmp === null ? "—" : `₹${inr(ipo.gmp)}${ipo.estGainPct !== null ? ` (${signedPct(ipo.estGainPct)})` : ""}`}
          color={tone(ipo.gmp)}
        />
        <Stat label="Est. profit / lot" value={profit === null ? "—" : `₹${inr(profit)}`} color={tone(profit)} />
        <Stat label="Issue size" value={formatIssueSize(ipo.issueSize) ?? "—"} />
        <Stat label="Subscribed" value={ipo.subscription?.overall != null ? times(ipo.subscription.overall) : "—"} />
      </div>

      {values.length >= 2 && (
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
          <div>
            <div className="text-[10px] tracking-wide text-dim uppercase">GMP trend</div>
            <div className="num mt-0.5 text-[12px]">
              ₹{inr(values[0])} <span className="text-dim">→</span> ₹{inr(values[values.length - 1])}
              <span className="ml-1.5 text-[11px] text-dim">{values.length}d</span>
            </div>
          </div>
          <GmpSparkline values={values} width={88} height={26} />
        </div>
      )}

      <ol className="mt-4 grid grid-cols-4 gap-1 border-t border-border pt-3">
        {STEPS.map((s) => {
          const date = s.date(ipo);
          const here = s.key === target.step;
          const done = Boolean(date && date <= today);
          return (
            <li key={s.key} className="min-w-0">
              <div className="h-0.5 rounded-pill" style={{ background: here ? target.color : done ? "var(--text)" : "var(--border)", opacity: here || done ? 1 : 0.9 }} />
              <div className="mt-1.5 text-[10px] leading-tight" style={{ color: here ? target.color : "var(--dim)", fontWeight: here ? 600 : 400 }}>
                {s.label}
              </div>
              <div className="num text-[11px] leading-tight">{date ? formatDate(date) : "—"}</div>
            </li>
          );
        })}
      </ol>
    </div>,
    document.body
  );
}
