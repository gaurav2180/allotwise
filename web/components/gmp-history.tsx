"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CaretDownIcon, ChartLineUpIcon } from "@phosphor-icons/react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { gmpHistorySchema, type GmpHistory } from "@/lib/schemas";
import { formatDate, inr } from "@/lib/utils";
import { useAccordionHeight } from "@/hooks/use-accordion-height";

async function fetchGmpHistory(slug: string): Promise<GmpHistory> {
  const res = await fetch(`/api/gmp/${encodeURIComponent(slug)}`, { cache: "no-store" });
  if (!res.ok) throw new Error("unavailable");
  const parsed = gmpHistorySchema.safeParse(await res.json());
  if (!parsed.success) throw new Error("shape");
  return parsed.data;
}

type Point = GmpHistory["history"][number];

/**
 * Hover card for a single day. Recharts' default tooltip carries its own
 * light-mode styling, so this one is rebuilt on the token layer to follow the
 * theme, and shows the whole day's record rather than just the value.
 */
function GmpTooltip({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;

  return (
    <div className="rounded-control border border-border bg-surface px-2.5 py-2 shadow-lg">
      <div className="text-[11px] text-dim">{formatDate(p.date)}</div>
      <div className="num mt-0.5 text-[14px] font-medium">₹{inr(p.gmp)}</div>

      {(p.change !== null || p.pct !== null) && (
        <div className="mt-1 flex items-center gap-2 text-[11px]">
          {p.change !== null && (
            <span
              className="num"
              style={{
                color:
                  p.change === 0
                    ? "var(--dim)"
                    : p.change > 0
                      ? "var(--positive)"
                      : "var(--negative)",
              }}
            >
              {p.change > 0 ? "+" : ""}₹{inr(p.change)}
            </span>
          )}
          {p.pct !== null && <span className="num text-dim">{p.pct > 0 ? "+" : ""}{p.pct}%</span>}
        </div>
      )}

      {p.indicative !== null && (
        <div className="num mt-1 text-[11px] text-dim">Est. listing ₹{inr(p.indicative)}</div>
      )}
    </div>
  );
}

function GmpChart({ points }: { points: Point[] }) {
  // A real time axis, not a category one.
  //
  // Recharts spaces categories evenly, so a series that skips days — and these
  // do, whenever a tracker publishes no quote — drew every point the same
  // distance apart while the date labels jumped by one day here and four there.
  // The line implied a steady daily march that the dates contradicted. Plotting
  // against the timestamp makes a gap look like a gap.
  const data = points.map((p) => ({ ...p, t: Date.parse(`${p.date}T00:00:00Z`) }));
  const values = points.map((p) => p.gmp);
  // Direction over the whole window, which is what the shape is read for.
  const rising = values[values.length - 1] >= values[0];
  const colour = rising ? "var(--positive)" : "var(--negative)";
  const gradientId = `gmp-fill-${rising ? "up" : "down"}`;

  // Fitted to the series rather than anchored at zero: a premium that moved
  // ₹230–₹345 is a flat line against a ₹0 baseline, and the shape of the move
  // is the entire point of the chart. The pad keeps the line off the edges.
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max(2, (hi - lo) * 0.15);
  const domain: [number, number] = [Math.max(0, Math.floor(lo - pad)), Math.ceil(hi + pad)];

  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colour} stopOpacity={0.22} />
              <stop offset="100%" stopColor={colour} stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            // Without an explicit domain a numeric axis pads out to round
            // numbers, which here are meaningless instants either side of the
            // series.
            domain={["dataMin", "dataMax"]}
            // Ticks on the days that actually have a reading, so every label
            // corresponds to a point on the line rather than to an interpolated
            // position between two. minTickGap thins them when they crowd.
            ticks={data.map((d) => d.t)}
            tickFormatter={(t: number) => formatDate(new Date(t).toISOString().slice(0, 10))}
            tick={{ fill: "var(--dim)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            tick={{ fill: "var(--dim)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={52}
            domain={domain}
            tickFormatter={(v: number) => `₹${v}`}
          />
          <Tooltip
            content={<GmpTooltip />}
            cursor={{ stroke: "var(--dim)", strokeDasharray: "3 3" }}
          />
          <Area
            type="monotone"
            dataKey="gmp"
            stroke={colour}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            // The dot appears on hover only — one per day would crowd a series
            // that can run for weeks.
            dot={false}
            activeDot={{ r: 4, fill: colour, stroke: "var(--surface)", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GmpHistoryPanel({
  slug,
  headlineGmp,
  headlineSource,
}: {
  slug: string;
  /** The premium shown on the row, so the note compares against what is on
   *  screen rather than against whatever the backend holds. */
  headlineGmp: number | null;
  headlineSource: "ipowatch" | "ipoji";
}) {
  const [open, setOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const accordion = useAccordionHeight(open, contentRef);

  const { data, isPending, isError } = useQuery({
    queryKey: ["gmp-history", slug],
    queryFn: () => fetchGmpHistory(slug),
    // Only fetched once the section is opened, so a collapsed row costs nothing.
    enabled: open,
    staleTime: 10 * 60_000,
  });

  const points = data?.history ?? [];
  const latest = points.length ? points[points.length - 1].gmp : null;
  // Only worth explaining when the chart and the row are on different trackers
  // *and* the figures actually differ. SME is IPO Ji on both sides now, so it
  // stays quiet there; mainboard pairs an IPO Watch headline with an IPO Ji
  // chart, and GMP is unofficial enough that those routinely disagree.
  const disagrees =
    data?.source === "ipoji" &&
    headlineSource !== "ipoji" &&
    headlineGmp !== null &&
    latest !== null &&
    latest !== headlineGmp;

  return (
    <div className="mt-4 border-t border-border pt-3">
      {/* Accent-tinted rather than plain text: this is the one control inside an
          expanded row, and in `dim` it read as a caption and got missed. The
          accent keeps it distinct from the figures around it, which are green
          and red — a control should not be coloured like data. Filled once
          open, so the pressed state is visible without reading the caret. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex h-8 items-center gap-1.5 rounded-pill px-3 text-[12px] font-medium transition-[background-color,color] duration-150 active:scale-[0.97]"
        style={{
          background: open ? "var(--accent)" : "var(--accent-soft)",
          color: open ? "var(--btn-bg)" : "var(--accent)",
        }}
      >
        <ChartLineUpIcon size={14} weight="bold" aria-hidden />
        Day-wise GMP
        <CaretDownIcon
          size={12}
          weight="bold"
          aria-hidden
          className="transition-transform duration-200"
          style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
        />
      </button>

      <div style={accordion.outerStyle} inert={accordion.inert}>
        <div ref={contentRef} style={accordion.innerStyle}>
          <div className="pt-3">
            {open && isPending && <div className="aw-skeleton h-44 rounded-card" />}

            {isError && (
              <p className="text-[12px] text-dim">The premium history is unavailable right now.</p>
            )}

            {data && points.length === 0 && (
              <p className="text-[12px] text-dim">
                No premium has been recorded for this IPO yet.
              </p>
            )}

            {data && points.length === 1 && (
              <p className="text-[12px] text-dim">
                Only one reading so far —{" "}
                <span className="num text-text">₹{inr(points[0].gmp)}</span> on{" "}
                {formatDate(points[0].date)}.
              </p>
            )}

            {data && points.length > 1 && (
              <>
                <GmpChart points={points} />

                <p className="mt-2 text-[11px] text-dim">
                  {data.source === "ipoji" ? (
                    <>
                      Day-wise history via IPO Ji (ipoji.com).
                      {disagrees && (
                        <>
                          {" "}
                          Its latest reading is{" "}
                          <span className="num">₹{inr(latest as number)}</span> against the{" "}
                          <span className="num">₹{inr(headlineGmp as number)}</span> above, which
                          comes from IPO Watch — grey market premium is unofficial and trackers poll
                          different dealers, so the two rarely match exactly.
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      Recorded by Allotwise from IPO Watch, so the latest point matches the premium
                      above. History starts from when tracking began, not from the issue&rsquo;s
                      announcement.
                    </>
                  )}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
