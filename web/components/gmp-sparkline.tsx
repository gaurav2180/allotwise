const SERIES = "var(--accent)";

/**
 * A word-sized trend line for the IPO row — no axes, no labels, just the shape
 * of the premium's run, with the latest day marked.
 */
export function GmpSparkline({ values, width = 96, height = 28 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return <svg width={width} height={height} aria-hidden />;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const x = (i: number) => 3 + (i / (values.length - 1)) * (width - 6);
  const y = (v: number) => 3 + (1 - (v - lo) / span) * (height - 6);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values.length - 1;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="shrink-0 overflow-visible">
      <path d={d} fill="none" stroke={SERIES} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(last)} cy={y(values[last])} r={3} fill={SERIES} stroke="var(--surface)" strokeWidth={1.5} />
    </svg>
  );
}
