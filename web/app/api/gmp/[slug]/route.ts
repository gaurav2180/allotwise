import { NextResponse } from "next/server";
import { backendGet, clientIp } from "@/lib/backend";

export const dynamic = "force-dynamic";

type GmpResponse = {
  slug: string;
  name: string;
  source: string;
  gmp: { value: number | null; sourceUpdatedAt: string | null }[];
  daywise: {
    date: string;
    gmp: number;
    pct: number | null;
    indicative: number | null;
    profit: number | null;
    change: number | null;
  }[];
};

/**
 * Day-wise GMP for one IPO: the source's own table, the same feed the row's
 * premium comes from.
 */
export async function GET(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;

  const res = await backendGet<GmpResponse>(`/gmp?ipo=${encodeURIComponent(slug)}`, {
    forwardedFor: clientIp(request.headers),
    timeoutMs: 25_000,
  });

  if (!res.ok) {
    return NextResponse.json({ error: { code: res.code, message: res.message } }, { status: res.status });
  }

  return NextResponse.json({
    slug: res.data.slug,
    name: res.data.name,
    headline: res.data.gmp?.[0]?.value ?? null,
    updatedAt: res.data.gmp?.[0]?.sourceUpdatedAt ?? null,
    source: res.data.source,
    history: res.data.daywise ?? [],
  });
}
