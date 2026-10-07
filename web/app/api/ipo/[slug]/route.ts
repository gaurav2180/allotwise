import { NextResponse } from "next/server";
import { backendGet, clientIp } from "@/lib/backend";

export const dynamic = "force-dynamic";

/** Everything known about one IPO — timeline, lot size, band, issue size. */
export async function GET(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;

  const res = await backendGet(`/ipo/${encodeURIComponent(slug)}`, {
    forwardedFor: clientIp(request.headers),
    timeoutMs: 12_000,
  });

  if (!res.ok) {
    return NextResponse.json({ error: { code: res.code, message: res.message } }, { status: res.status });
  }
  return NextResponse.json(res.data);
}
