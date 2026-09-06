"use client";

import { useEffect, useId, useRef } from "react";
import Link from "next/link";
import {
  ArrowClockwiseIcon,
  CaretDownIcon,
  SealCheckIcon,
  CurrencyInrIcon,
  TrendUpIcon,
  UsersIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { PanResult } from "@/components/pan-result";
import { IpoLogo } from "@/components/ipo-logo";
import { IpoDetailPanel } from "@/components/ipo-detail";
import { useAllotmentCheck } from "@/hooks/use-allotment-check";
import { useAccordionHeight } from "@/hooks/use-accordion-height";
import type { IpoListItem } from "@/lib/schemas";
import type { PanEntry } from "@/lib/pan";
import {
  cn,
  derivePhase,
  formatDate,
  formatPriceBand,
  inr,
  relativeDay,
  signedPct,
  times,
} from "@/lib/utils";

/**
 * Plain-language state, not the raw status enum. This line is what decides the
 * next click, so it says what can be done rather than what the record says.
 * Within a week a countdown reads faster than a date.
 */
function stateLine(ipo: IpoListItem): string {
  // A listed issue has an outcome, which outranks anything still pending.
  if (ipo.listing) return "Listed";
  if (ipo.listedOn) {
    // It has listed, but the debut price is not published yet. Say both.
    const rel = relativeDay(ipo.listedOn);
    return rel === "today" ? "Listed today" : `Listed ${formatDate(ipo.listedOn)}`;
  }
  if (ipo.allotment.available) return "Allotment out";

  // Derived from dates, not the scraped status, which goes stale overnight.
  switch (derivePhase(ipo)) {
    case "open": {
      const rel = relativeDay(ipo.closeDate);
      if (rel === "today") return "Closes today";
      return rel ? `Closes ${rel}` : ipo.closeDate ? `Open until ${formatDate(ipo.closeDate)}` : "Open now";
    }
    case "upcoming": {
      const rel = relativeDay(ipo.openDate);
      if (rel === "today") return "Opens today";
      return rel ? `Opens ${rel}` : ipo.openDate ? `Opens ${formatDate(ipo.openDate)}` : "Upcoming";
    }
    default:
      return "Closed — allotment pending";
  }
}

/**
 * A listing that went badly is information, so it carries the full negative
 * colour — the same treatment the Past tab uses. No softening.
 */
function listedColor(gainPct: number): string {
  if (gainPct > 0) return "var(--positive)";
  if (gainPct < 0) return "var(--negative)";
  return "var(--dim)";
}

/** Desktop column widths, shared with IpoListHeader so figures line up. */
const COL = {
  price: "sm:w-24",
  gmp: "sm:w-28",
  subs: "sm:w-16",
};

/**
 * On a phone the label sits above the figure, because there is no room for a
 * column header. From `sm` the header carries the labels and the cell shows
 * only the number, right-aligned into its column.
 *
 * Every row uses the same three columns. A column that changes meaning between
 * rows stops the list being a table — the header ends up naming one thing while
 * the cell beneath shows another, and the rows no longer align. Anything that
 * varies per row belongs on the meta line under the name, not in the grid.
 */
function Stat({
  label,
  icon: Icon,
  className,
  children,
}: {
  label: string;
  /** Small mark beside the label. It sits in `dim`, never the accent — these
   *  aid scanning, they are not decoration. */
  icon?: React.ComponentType<{ size?: number; weight?: "regular"; className?: string }>;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0 text-left sm:text-right", className)}>
      <div className="flex items-center gap-1 text-[11px] text-dim sm:hidden">
        {Icon && <Icon size={12} weight="regular" aria-hidden className="shrink-0" />}
        {label}
      </div>
      <div className="num mt-0.5 truncate text-[13px] sm:mt-0 sm:text-[14px]">{children}</div>
    </div>
  );
}

/** Column labels, desktop only — on mobile each cell carries its own. */
function HeaderCell({
  label,
  icon: Icon,
  className,
}: {
  label: string;
  icon: React.ComponentType<{ size?: number; weight?: "regular"; className?: string }>;
  className: string;
}) {
  return (
    <div className={cn("flex items-center justify-end gap-1 text-[11px] text-dim", className)}>
      <Icon size={12} weight="regular" aria-hidden className="shrink-0" />
      {label}
    </div>
  );
}

export function IpoListHeader() {
  return (
    <div className="hidden items-center gap-4 px-4 pb-2 sm:flex" aria-hidden>
      <div className="min-w-0 flex-1" />
      <div className="flex shrink-0 items-center gap-4">
        <HeaderCell label="Issue price" icon={CurrencyInrIcon} className={COL.price} />
        <HeaderCell label="GMP" icon={TrendUpIcon} className={COL.gmp} />
        <HeaderCell label="Subs" icon={UsersIcon} className={COL.subs} />
      </div>
      <span className="w-4 shrink-0" />
    </div>
  );
}

export function IpoRow({
  ipo,
  pans,
  panStoreReady,
  open,
  scrollOnOpen,
  onToggle,
}: {
  ipo: IpoListItem;
  pans: PanEntry[];
  panStoreReady: boolean;
  /** Owned by IpoList, not local state — so opening one row can close
   *  whichever other one was open. */
  open: boolean;
  /** True only when this open replaced a different row that was already
   *  open. Opening the first row from a fully closed list shouldn't move the
   *  page at all — it's already exactly where the user tapped it; scrolling
   *  only earns its place once a switch has shifted the layout around. */
  scrollOnOpen: boolean;
  onToggle: () => void;
}) {
  const panelId = useId();
  const rowRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const accordion = useAccordionHeight(open, detailRef);

  // Bring the row to the top of the viewport as it opens, so the expanded
  // content actually fits on screen instead of running off the bottom of a
  // row that opened wherever it happened to be scrolled to.
  //
  // scrollOnOpen only fires on a switch, which also collapses whichever row
  // was open before. If that row sits above this one, its own close
  // transition is still shrinking it and pulling this row upward for the
  // next 300ms — scrolling immediately targets where the row is *right now*,
  // not where it settles once that collapse finishes, which is exactly the
  // "close but not quite aligned" mismatch this was producing. Waiting for
  // that transition (matches --dur-accordion) means the layout has already
  // settled by the time this aims at it.
  useEffect(() => {
    if (!open || !scrollOnOpen) return;
    const t = setTimeout(() => {
      rowRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 300);
    return () => clearTimeout(t);
  }, [open, scrollOnOpen]);

  // The allotment call keys off the REGISTRAR slug, which differs from the
  // market slug this row is otherwise identified by.
  const registrarSlug = ipo.allotment.available ? ipo.allotment.ipo : undefined;
  const check = useAllotmentCheck(registrarSlug);

  const gain = ipo.estGainPct ?? 0;
  const gainColor = gain > 0 ? "var(--positive)" : gain < 0 ? "var(--negative)" : "var(--dim)";
  // The full band when the detail scrape has reached this IPO, else the
  // calendar's cap price. Both go through the same formatter, so a fixed-price
  // issue and a two-ended band render consistently.
  const issuePrice = formatPriceBand(ipo.priceBandFull ?? ipo.priceBand);
  // Listed either way: with a published debut price, or by date alone.
  const hasListed = Boolean(ipo.listing || ipo.listedOn);

  return (
    <div ref={rowRef} className="scroll-mt-3 border-t border-border first:border-t-0">
      {/* Mobile-first: identity on one line, the three figures on their own row
          beneath it so all of them fit at 390px. From `sm` there is room to put
          the figures inline and the labels move to the sticky column header. */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full flex-col gap-2.5 px-3 py-3 text-left hover:bg-row-hover sm:flex-row sm:items-center sm:gap-4 sm:px-4"
      >
        <div className="flex min-w-0 items-center gap-3 sm:flex-1">
          <IpoLogo name={ipo.name} src={ipo.logo} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-medium">{ipo.name}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-dim">
              <span>{stateLine(ipo)}</span>
              {/* The debut price is the one fact that only some rows have, so it
                  lives here rather than displacing a column. */}
              {ipo.listing && (
                <>
                  <span aria-hidden>·</span>
                  <span className="num" style={{ color: listedColor(ipo.listing.gainPct) }}>
                    ₹{inr(ipo.listing.price)} ({signedPct(ipo.listing.gainPct)})
                  </span>
                </>
              )}
              <span aria-hidden>·</span>
              <span className="shrink-0">{ipo.board === "sme" ? "SME" : "Mainboard"}</span>
            </div>
          </div>
          <CaretDownIcon
            size={14}
            weight="bold"
            aria-hidden
            className="w-4 shrink-0 text-dim transition-transform duration-200 sm:hidden"
            style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
          />
        </div>

        {/* One set of columns for every row, always in the same order and
            meaning, so the header is true of every line beneath it. */}
        <div className="grid grid-cols-3 gap-2 sm:flex sm:shrink-0 sm:items-center sm:gap-4">
          <Stat label="Issue price" icon={CurrencyInrIcon} className={COL.price}>
            {ipo.listing ? `₹${inr(ipo.listing.issuePrice)}` : (issuePrice ?? "—")}
          </Stat>

          {/* Premium and the gain it implies are one figure, so the percentage
              sits in brackets beside it. Once an issue has listed the premium is
              a superseded forecast, so it drops to `dim` — the outcome that
              replaced it is coloured on the line above. */}
          <Stat label="GMP" icon={TrendUpIcon} className={COL.gmp}>
            {ipo.gmp === null ? (
              "—"
            ) : hasListed ? (
              <span className="text-dim">₹{inr(ipo.gmp)}</span>
            ) : (
              <span style={{ color: gainColor }}>
                ₹{inr(ipo.gmp)} <span className="text-[11px]">({signedPct(ipo.estGainPct)})</span>
              </span>
            )}
          </Stat>

          <Stat label="Subs" icon={UsersIcon} className={COL.subs}>
            {ipo.subscription?.overall != null ? times(ipo.subscription.overall) : "—"}
          </Stat>
        </div>

        <CaretDownIcon
          size={14}
          weight="bold"
          aria-hidden
          className="hidden w-4 shrink-0 text-dim transition-transform duration-200 sm:block"
          style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
        />
      </button>

      <div id={panelId} style={accordion.outerStyle} inert={accordion.inert} role="region">
        <div ref={detailRef} style={accordion.innerStyle}>
          <div className="border-t border-border px-3 pb-3 sm:px-4 sm:pb-4">
            {/* Allotment first. Checking a result is what the product is for,
                and it used to sit below the whole detail grid and the GMP
                chart — past the fold on a phone, which buried the one thing
                people open a row to do. */}
            <ExpandedBody ipo={ipo} pans={pans} panStoreReady={panStoreReady} check={check} />

            {/* Only mounted while open, so the detail request is never made for
                a row nobody looked at. */}
            {open && (
              <IpoDetailPanel slug={ipo.slug} gmp={ipo.gmp} gmpSource={ipo.gmpSource} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ExpandedBody({
  ipo,
  pans,
  panStoreReady,
  check,
}: {
  ipo: IpoListItem;
  pans: PanEntry[];
  panStoreReady: boolean;
  check: ReturnType<typeof useAllotmentCheck>;
}) {
  // Not every IPO is checkable: the backend only maps a registrar once the
  // issue reaches one. Say so rather than showing a button that cannot work.
  if (!ipo.allotment.available) {
    return (
      <p className="pt-3 text-[13px] text-dim">
        No registrar has published allotment for this IPO yet. It becomes checkable here once one
        does — usually a day or two after the issue closes.
      </p>
    );
  }

  if (!panStoreReady) {
    return <div className="aw-skeleton mt-3 h-9 w-48 rounded-control" />;
  }

  if (pans.length === 0) {
    return (
      <div className="pt-3">
        <p className="text-[13px] text-dim">
          Save a PAN to check this IPO. PANs stay in this browser — they are sent to the registrar
          only for the seconds a check takes, and never stored on our servers.
        </p>
        <Link
          href="/pans"
          className="mt-3 inline-flex h-10 items-center rounded-control border px-4 text-sm font-medium sm:h-9"
          style={{
            background: "var(--btn-bg)",
            color: "var(--btn-text)",
            borderColor: "var(--btn-border)",
          }}
        >
          Add a PAN
        </Link>
      </div>
    );
  }

  return (
    <div
      className="mt-3 rounded-card border border-border p-3"
      style={{
        background:
          "radial-gradient(140% 100% at 100% 0%, var(--accent-soft), var(--surface) 55%)",
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[14px] font-medium">
          <span
            className="grid size-6 shrink-0 place-items-center rounded-control"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
            aria-hidden
          >
            <SealCheckIcon size={14} weight="bold" />
          </span>
          Check allotment
        </h3>

        {/* The action sits with the heading rather than after the list: with
            several PANs saved it was otherwise pushed off the bottom. */}
        <Button variant="primary" size="sm" onClick={() => check.run(pans)} disabled={check.isRunning}>
          {check.isRunning && (
            <ArrowClockwiseIcon size={14} weight="bold" className="animate-spin" aria-hidden />
          )}
          {check.isRunning
            ? "Checking…"
            : check.hasRun
              ? "Check again"
              : `Check ${pans.length} ${pans.length === 1 ? "PAN" : "PANs"}`}
        </Button>
      </div>

      <ul className="mt-3 space-y-1.5">
        {pans.map((p, i) => (
          <PanResult key={p.id} entry={p} state={check.results[p.id]} index={i} />
        ))}
      </ul>

      <p className="mt-2.5 text-[11px] text-dim">
        Sent to the registrar for this check only. Never stored.
      </p>
    </div>
  );
}
