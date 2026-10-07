"use client";

import Link from "next/link";
import { CaretDownIcon, CaretUpIcon } from "@phosphor-icons/react";
import { useIpos } from "@/hooks/use-ipos";
import type { IpoListItem } from "@/lib/schemas";
import { inr } from "@/lib/utils";

const tone = (n: number | null) =>
  n === null || n === 0 ? "var(--dim)" : n > 0 ? "var(--positive)" : "var(--negative)";
const soft = (n: number | null) =>
  n === null || n === 0 ? "var(--chip-bg)" : n > 0 ? "var(--positive-soft)" : "var(--negative-soft)";

function Item({ r, hidden }: { r: IpoListItem; hidden?: boolean }) {
  const pct = r.estGainPct;
  const Caret = (pct ?? r.gmp ?? 0) < 0 ? CaretDownIcon : CaretUpIcon;
  return (
    <Link
      href="/app"
      aria-hidden={hidden}
      tabIndex={hidden ? -1 : undefined}
      className="group flex shrink-0 items-center gap-2.5 rounded-pill px-3 py-1.5 text-[13px] whitespace-nowrap transition-colors duration-150 hover:bg-row-hover"
    >
      {r.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={r.logo} alt="" width={20} height={20} loading="lazy" className="size-5 rounded-[5px] bg-white object-contain ring-1 ring-border" />
      ) : (
        <span className="grid size-5 place-items-center rounded-[5px] bg-chip text-[9px] font-semibold text-dim">
          {r.name.slice(0, 1)}
        </span>
      )}
      <span className="font-medium">{r.name}</span>
      <span className="num font-medium" style={{ color: tone(r.gmp) }}>
        {r.gmp === null ? "—" : `₹${inr(r.gmp)}`}
      </span>
      {r.gmp !== null && (
        <span
          className="num inline-flex items-center gap-0.5 rounded-pill px-1.5 py-0.5 text-[11px] font-medium"
          style={{ color: tone(pct ?? r.gmp), background: soft(pct ?? r.gmp) }}
        >
          <Caret size={10} weight="fill" aria-hidden />
          {pct === null ? "no price yet" : `${Math.abs(pct).toFixed(2)}%`}
        </span>
      )}
    </Link>
  );
}

/**
 * A market-ticker strip of every issue not yet listed — upcoming, open, or
 * closed and awaiting listing — with its live GMP. It drifts slowly, pauses
 * under the pointer or keyboard focus, and becomes a hand-scrolled strip for
 * anyone who has asked for reduced motion.
 */
export function Ticker() {
  const { data, isPending } = useIpos();

  const items = (data?.ipos ?? [])
    .filter((r) => !r.listing && !r.listedOn && r.status !== "listed")
    .sort((a, b) => (b.estGainPct ?? -Infinity) - (a.estGainPct ?? -Infinity));

  return (
    <div className="aw-marquee-host relative flex items-center border-b border-border bg-surface">
      <div className="relative z-10 flex shrink-0 items-center gap-2 self-stretch border-r border-border bg-surface pr-4 pl-4 sm:pl-6">
        <span className="relative flex size-2" aria-hidden>
          <span className="aw-live-ping absolute inset-0 rounded-full" style={{ background: "var(--positive)" }} />
          <span className="relative size-2 rounded-full" style={{ background: "var(--positive)" }} />
        </span>
        <span className="text-[11px] font-semibold tracking-[0.08em] whitespace-nowrap uppercase">Live GMP</span>
        {!isPending && <span className="num hidden text-[11px] text-dim sm:inline">{items.length} IPOs</span>}
      </div>

      <div
        className="aw-no-scrollbar min-w-0 flex-1 overflow-hidden py-2 motion-reduce:overflow-x-auto"
        style={{
          maskImage: "linear-gradient(to right, transparent, black 40px, black calc(100% - 64px), transparent)",
          WebkitMaskImage: "linear-gradient(to right, transparent, black 40px, black calc(100% - 64px), transparent)",
        }}
        aria-label="IPOs not yet listed, with grey market premium"
      >
        {isPending && (
          <div className="flex gap-6 px-6">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="aw-skeleton h-5 w-44 rounded-pill" />
            ))}
          </div>
        )}
        {data && items.length === 0 && (
          <span className="px-6 text-[13px] text-dim">No issue is waiting to list right now.</span>
        )}
        {items.length > 0 && (
          <div
            className="aw-marquee flex w-max items-center"
            style={{ ["--marquee-duration" as string]: `${Math.max(30, items.length * 5)}s` }}
          >
            {[0, 1].map((copy) => (
              <div
                key={copy}
                className={`flex shrink-0 items-center gap-1 pr-1 ${copy === 1 ? "motion-reduce:hidden" : ""}`}
                aria-hidden={copy === 1}
              >
                {items.map((r) => (
                  <Item key={`${copy}-${r.slug}`} r={r} hidden={copy === 1} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
