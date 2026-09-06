import { NextResponse } from "next/server";
import { backendGet, clientIp } from "@/lib/backend";
import { fetchIpojiGmpHistory, type GmpPoint } from "@/lib/ipoji-gmp";

export const dynamic = "force-dynamic";

type GmpResponse = {
  slug: string;
  name: string;
  gmp: { value: number | null; source: string; sourceUpdatedAt: string | null }[];
  history: { gmp: number | null; source: string; captured_at: string }[];
};

/**
 * Day-wise GMP for one IPO.
 *
 * IPO Ji first: it publishes the full series from the issue's first quote,
 * which is the only source checked that carries real history (IPO Watch, where
 * the headline premium comes from, has none on its detail pages). Our own
 * recorded series is the fallback — it is the same source as the headline, but
 * only holds readings since the scheduler started, so it is usually a few days
 * at most.
 *
 * The response says which source it got, because the two disagree on value and
 * the panel has to name that rather than hide it.
 */
export async function GET(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;

  const res = await backendGet<GmpResponse>(`/gmp?ipo=${encodeURIComponent(slug)}`, {
    forwardedFor: clientIp(request.headers),
    timeoutMs: 12_000,
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: { code: res.code, message: res.message } },
      { status: res.status }
    );
  }

  const name = res.data.name;
  const headline = res.data.gmp?.[0]?.value ?? null;

  const ipoji = await fetchIpojiGmpHistory(name).catch(() => null);
  if (ipoji?.length) {
    return NextResponse.json({
      slug: res.data.slug,
      name,
      headline,
      source: "ipoji",
      history: ipoji,
    });
  }

  // Fallback: our own readings, collapsed to the last one per calendar day.
  const byDay = new Map<string, number>();
  for (const row of res.data.history ?? []) {
    if (row.gmp === null) continue;
    const day = String(row.captured_at).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    // Rows arrive newest-first, so the first seen for a day is that day's last
    // reading and older rows for the same day must not overwrite it.
    if (!byDay.has(day)) byDay.set(day, row.gmp);
  }

  const ordered = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const history: GmpPoint[] = ordered.map(([date, gmp], i) => ({
    date,
    gmp,
    change: i === 0 ? null : gmp - ordered[i - 1][1],
    pct: null,
    indicative: null,
  }));

  return NextResponse.json({
    slug: res.data.slug,
    name,
    headline,
    source: "allotwise",
    history,
  });
}
