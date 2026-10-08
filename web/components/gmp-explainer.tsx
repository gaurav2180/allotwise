"use client";

import { useEffect, useState } from "react";
import { inr } from "@/lib/utils";

const rupees = (n: number) => `${n < 0 ? "−" : ""}₹${inr(Math.abs(n))}`;
const signedRupees = (n: number) => (n === 0 ? "₹0" : `${n < 0 ? "−" : "+"}₹${inr(Math.abs(n))}`);
const tone = (n: number | null) =>
  n === null || n === 0 ? "var(--text)" : n > 0 ? "var(--positive)" : "var(--negative)";

function Tile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="min-w-0 rounded-control border border-border bg-surface px-3 py-2.5">
      <div className="text-[10px] tracking-wide text-dim uppercase">{label}</div>
      <div className="num mt-0.5 truncate text-[15px] font-semibold" style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}

const Op = ({ children }: { children: React.ReactNode }) => (
  <span className="num self-center text-[16px] text-dim" aria-hidden>
    {children}
  </span>
);

/** One sum, drawn as tiles joined by operators. Wraps on a phone, operators and all. */
function Sum({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div role="group" aria-label={label} className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-stretch gap-x-2 gap-y-1">
      {children}
    </div>
  );
}

/**
 * What GMP is, shown with the figures of the issue on screen rather than in the
 * abstract: a bar that is the price with the premium laid on top of it, then the
 * two sums that matter — issue price plus premium is the price it is expected to
 * open at, and premium times lot size is what one lot would make. With no
 * figures yet, the same layout carries the words alone.
 */
export function GmpExplainer({
  issuePrice,
  gmp,
  lotSize,
  listing,
}: {
  issuePrice: number | null;
  gmp: number | null;
  lotSize: number | null;
  listing: { price: number; gainPct: number } | null;
}) {
  const known = issuePrice !== null && gmp !== null;
  const expected = known ? issuePrice + gmp : null;
  const perLot = gmp !== null && lotSize ? Math.round(gmp * lotSize * 100) / 100 : null;

  // The bar fills in on arrival; the global reduced-motion rule makes it instant.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // The bar's full width is whichever is higher, the issue price or the price the
  // premium implies. A negative premium leaves the issue price whole and marks
  // the part of it the premium takes back.
  const top = known ? Math.max(issuePrice, expected!) : 1;
  const base = known ? Math.min(issuePrice, expected!) : 0;
  const basePct = known ? (base / top) * 100 : 0;
  const gapPct = known ? ((top - base) / top) * 100 : 0;
  const negative = known && gmp < 0;

  return (
    <div className="mt-3 rounded-card border border-border p-4 sm:p-5">
      <p className="text-[14px] leading-relaxed text-dim">
        <span className="font-medium text-text">Grey market premium</span> is the extra amount traders
        will pay for an IPO share, off the exchange, before it lists. It is a sentiment gauge, not a
        quote.
      </p>

      {known && (
        <div className="mt-5">
          <div className="flex h-3 overflow-hidden rounded-pill bg-chip" role="img" aria-label={`Issue price ${rupees(issuePrice)}, premium ${signedRupees(gmp)}`}>
            <div
              className="h-full transition-[width] duration-700 ease-out"
              style={{ width: shown ? `${basePct}%` : "0%", background: "var(--dim)", opacity: 0.55 }}
            />
            <div
              className="h-full transition-[width] duration-700 ease-out"
              style={{
                width: shown ? `${gapPct}%` : "0%",
                background: negative
                  ? "repeating-linear-gradient(135deg, var(--negative) 0 3px, transparent 3px 6px)"
                  : tone(gmp),
                transitionDelay: "250ms",
              }}
            />
          </div>
          <div className="num mt-1.5 flex justify-between text-[11px] text-dim">
            <span>Issue price {rupees(issuePrice)}</span>
            <span style={{ color: tone(gmp) }}>premium {signedRupees(gmp)}</span>
          </div>
        </div>
      )}

      <div className="mt-5 space-y-3">
        <div>
          <div className="mb-1.5 text-[12px] font-medium">Expected listing price</div>
          <Sum label="Issue price plus GMP equals expected listing price">
            <Tile label="Issue price" value={issuePrice !== null ? rupees(issuePrice) : "price"} />
            <Op>+</Op>
            <Tile label="GMP" value={gmp !== null ? rupees(gmp) : "premium"} color={gmp !== null ? tone(gmp) : undefined} />
            <Op>=</Op>
            <Tile label="Expected" value={expected !== null ? rupees(expected) : "listing"} color={expected !== null ? tone(gmp) : undefined} />
          </Sum>
        </div>

        <div>
          <div className="mb-1.5 text-[12px] font-medium">Estimated profit on one lot</div>
          <Sum label="GMP times lot size equals estimated profit per lot">
            <Tile label="GMP" value={gmp !== null ? rupees(gmp) : "premium"} color={gmp !== null ? tone(gmp) : undefined} />
            <Op>×</Op>
            <Tile label="Lot size" value={lotSize ? `${inr(lotSize)}` : "shares"} />
            <Op>=</Op>
            <Tile label="Per lot" value={perLot !== null ? rupees(perLot) : "profit"} color={perLot !== null ? tone(perLot) : undefined} />
          </Sum>
        </div>
      </div>

      {listing && expected !== null && (
        <p className="num mt-4 border-t border-border pt-3 text-[12px] text-dim">
          It has since listed at{" "}
          <span style={{ color: tone(listing.gainPct) }} className="font-medium">
            {rupees(listing.price)}
          </span>{" "}
          — the premium pointed to {rupees(expected)}.
        </p>
      )}
    </div>
  );
}
