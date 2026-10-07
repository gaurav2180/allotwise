"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { GmpHistory } from "@/lib/schemas";
import { formatLongDate, inr } from "@/lib/utils";

type Point = GmpHistory["history"][number];

const SERIES = "var(--accent)";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

/** Round axis steps — 1, 2 or 5 times a power of ten — about `count` of them. */
function niceTicks(lo: number, hi: number, count = 4): number[] {
  const raw = Math.max(1, (hi - lo) / count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Number(v.toFixed(2)));
  return ticks;
}

/** Hover card for one day. Text stays in text tokens; only the swatch carries the series colour. */
function DayTooltip({
  active,
  payload,
  showPct,
}: {
  active?: boolean;
  payload?: { payload: Point & { t: number } }[];
  showPct: boolean;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-control border border-border bg-surface px-3 py-2 shadow-lg">
      <div className="text-[11px] text-dim">{formatLongDate(p.date)}</div>
      <div className="mt-1 flex items-center gap-2">
        <span className="h-0.5 w-3 rounded-pill" style={{ background: SERIES }} aria-hidden />
        <span className="num text-[14px] font-semibold">₹{inr(p.gmp)}</span>
        {showPct && p.pct !== null && <span className="num text-[12px] text-dim">{p.pct.toFixed(1)}%</span>}
      </div>
      {p.change !== null && (
        <div className="num mt-0.5 text-[11px] text-dim">
          {p.change === 0 ? "No change" : `${p.change > 0 ? "+" : "−"}₹${inr(Math.abs(p.change))} on the day`}
        </div>
      )}
    </div>
  );
}

/** The last point, ringed in the surface colour, with its value set beside it. */
function EndDot(props: { cx?: number; cy?: number; index?: number; payload?: Point; last: number }) {
  const { cx, cy, index, payload, last } = props;
  if (index !== last || cx === undefined || cy === undefined || !payload) return <g />;
  return (
    <g>
      <circle cx={cx} cy={cy} r={4} fill={SERIES} stroke="var(--surface)" strokeWidth={2} />
      <text x={cx - 8} y={cy - 10} textAnchor="end" className="num" fontSize={12} fontWeight={600} fill="var(--text)">
        ₹{inr(payload.gmp)}
      </text>
    </g>
  );
}

/**
 * Day-wise GMP as a single line over real time. One series, so no legend — the
 * section title names it. A zero line appears only when the premium reaches it.
 */
export function GmpChart({ points, showPct }: { points: Point[]; showPct: boolean }) {
  const data = points.map((p) => ({ ...p, t: Date.parse(`${p.date}T00:00:00Z`) }));
  const values = points.map((p) => p.gmp);
  const ticks = niceTicks(Math.min(...values), Math.max(...values));
  const domain: [number, number] = [ticks[0], ticks[ticks.length - 1]];
  const crossesZero = domain[0] < 0 && domain[1] > 0;

  return (
    <div className="h-56 w-full sm:h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 24, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="gmp-wash" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES} stopOpacity={0.12} />
              <stop offset="100%" stopColor={SERIES} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeWidth={1} vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            ticks={data.map((d) => d.t)}
            tickFormatter={(t: number) => shortDate(new Date(t).toISOString().slice(0, 10))}
            tick={{ fill: "var(--dim)", fontSize: 11 }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
            minTickGap={28}
            padding={{ left: 8, right: 8 }}
          />
          <YAxis
            domain={domain}
            ticks={ticks}
            allowDecimals={false}
            tick={{ fill: "var(--dim)", fontSize: 11 }}
            tickFormatter={(v: number) => `₹${inr(v)}`}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          {crossesZero && <ReferenceLine y={0} stroke="var(--dim)" strokeWidth={1} />}
          <Tooltip
            content={<DayTooltip showPct={showPct} />}
            cursor={{ stroke: "var(--dim)", strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey="gmp"
            stroke={SERIES}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="url(#gmp-wash)"
            dot={(p) => <EndDot key={p.index} {...p} last={data.length - 1} />}
            activeDot={{ r: 5, fill: SERIES, stroke: "var(--surface)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
