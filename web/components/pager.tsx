"use client";

import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

type Slot = number | "gap";

/**
 * The page numbers to draw: the first and last always, the current one and
 * its neighbours, and a gap wherever pages are skipped. Never more than seven
 * slots, so the strip has a fixed worst-case width.
 */
export function pageSlots(page: number, pages: number): Slot[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i);
  const keep = new Set([0, pages - 1, page - 1, page, page + 1].filter((p) => p >= 0 && p < pages));
  // Near either end, show enough pages there that a gap never hides one page.
  if (page <= 2) [1, 2, 3].forEach((p) => keep.add(p));
  if (page >= pages - 3) [pages - 4, pages - 3, pages - 2].forEach((p) => keep.add(p));
  const sorted = [...keep].sort((a, b) => a - b);
  const out: Slot[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push("gap");
    out.push(p);
  });
  return out;
}

/**
 * Pages of a long list: where you are ("16–30 of 52"), arrows either side and
 * the page numbers between. Every button is a 36px target on a phone; below
 * 360px the current page's neighbours drop out so the strip still fits a
 * 320px screen. Pages are zero-based; the labels are not.
 */
export function Pager({
  page,
  pages,
  total,
  pageSize,
  onChange,
  label,
}: {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
  label: string;
}) {
  if (pages <= 1) return null;
  const from = page * pageSize + 1;
  const to = Math.min(total, from + pageSize - 1);
  const button =
    "grid size-9 shrink-0 place-items-center rounded-control text-[13px] font-medium transition-colors duration-150 sm:size-8";

  return (
    <nav aria-label={label} className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <p className="num text-[12px] text-dim" aria-live="polite">
        {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page === 0}
          aria-label="Previous page"
          className={cn(button, "text-text hover:bg-row-hover disabled:pointer-events-none disabled:opacity-35")}
        >
          <CaretLeftIcon size={14} weight="bold" />
        </button>
        {pageSlots(page, pages).map((s, i) =>
          s === "gap" ? (
            <span key={`gap-${i}`} className="num w-5 text-center text-[13px] text-dim" aria-hidden>
              …
            </span>
          ) : (
            <button
              key={s}
              type="button"
              onClick={() => onChange(s)}
              aria-label={`Page ${s + 1}`}
              aria-current={s === page ? "page" : undefined}
              className={cn(
                button,
                "num",
                s === page ? "bg-chip text-text" : "text-dim hover:bg-row-hover hover:text-text",
                // Squeezed phones keep first, last and current only.
                pages > 7 && Math.abs(s - page) === 1 && s !== 0 && s !== pages - 1 && "hidden min-[360px]:grid"
              )}
            >
              {s + 1}
            </button>
          )
        )}
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page === pages - 1}
          aria-label="Next page"
          className={cn(button, "text-text hover:bg-row-hover disabled:pointer-events-none disabled:opacity-35")}
        >
          <CaretRightIcon size={14} weight="bold" />
        </button>
      </div>
    </nav>
  );
}
