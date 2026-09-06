import { cn } from "@/lib/utils";

/**
 * The Allotwise mark — "partial fill".
 *
 * A lot of four, three filled and one left open: allotment is never
 * all-or-nothing across a family of PANs, and this is that drawn literally. It
 * reads as a chart, a ledger and an allocation at once, and it survives 16px
 * in a browser tab, where a thin letterform would not.
 *
 * Colour is `currentColor` throughout, so the mark follows the text colour of
 * whatever it sits in and inverts cleanly between themes.
 */
export function LogoGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden focusable="false">
      <rect x="2" y="2" width="12.5" height="12.5" rx="2.5" fill="currentColor" />
      <rect x="17.5" y="2" width="12.5" height="12.5" rx="2.5" fill="currentColor" />
      <rect x="2" y="17.5" width="12.5" height="12.5" rx="2.5" fill="currentColor" />
      {/* The unfilled lot. This is the whole idea, so it never becomes a fourth
          solid square. */}
      <rect
        x="17.5"
        y="17.5"
        width="12.5"
        height="12.5"
        rx="2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      />
    </svg>
  );
}

/**
 * Mark plus wordmark, as one object. "Allot" carries the weight and "wise" sits
 * back in `dim` — the product is the allotment; the rest is the promise.
 */
export function LogoLockup({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoGlyph className="size-5.5 shrink-0" />
      <span className="text-[15px] font-semibold tracking-tight">
        Allot<span className="font-normal text-dim">wise</span>
      </span>
    </span>
  );
}
