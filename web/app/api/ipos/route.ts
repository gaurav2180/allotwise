import { NextResponse } from "next/server";
import { backendGet, clientIp } from "@/lib/backend";
import { capPrice } from "@/lib/utils";
import { calendarSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

const todayIso = () => new Date().toISOString().slice(0, 10);

/** The debut outcome, measured against the cap the applications were priced at. */
function listingFrom(listingPrice: number | null, priceBand: string | null) {
  const issuePrice = capPrice(priceBand);
  if (listingPrice === null || !issuePrice) return null;
  return {
    price: listingPrice,
    issuePrice,
    gainPct: Number((((listingPrice - issuePrice) / issuePrice) * 100).toFixed(2)),
  };
}

/**
 * The main screen in one request. Every figure on every row comes from the
 * backend, which reads one source for all of them, so nothing on a row can
 * contradict anything else on it.
 */
export async function GET(request: Request) {
  const calendar = await backendGet("/calendar", { forwardedFor: clientIp(request.headers) });
  if (!calendar.ok) {
    return NextResponse.json(
      { error: { code: calendar.code, message: calendar.message } },
      { status: calendar.status }
    );
  }

  const parsed = calendarSchema.safeParse(calendar.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Calendar data did not match the expected shape." } },
      { status: 502 }
    );
  }

  const today = todayIso();
  const rows = parsed.data.ipos;

  return NextResponse.json({
    count: rows.length,
    ipos: rows.map((r) => ({
      ...r,
      gmpSource: r.gmpSource ?? r.source,
      subscription: r.subscription !== null ? { overall: r.subscription, categories: [] } : null,
      listing: listingFrom(r.listingPrice, r.priceBand),
      listedOn: r.listingDate && r.listingDate <= today ? r.listingDate : null,
    })),
    attribution: parsed.data.attribution,
  });
}
