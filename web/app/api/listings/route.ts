import { NextResponse } from "next/server";
import { fetchListings } from "@/lib/listings";
import { resolveLogos } from "@/lib/logos";

export const dynamic = "force-dynamic";

/**
 * Listed IPOs and how they actually opened. Fetched only when the Past tab is
 * opened — it is a few hundred rows and irrelevant to the default view.
 */
export async function GET() {
  try {
    const rows = await fetchListings();
    if (rows.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: "LISTINGS_UNAVAILABLE",
            message: "The listing-history source did not return any rows.",
          },
        },
        { status: 502 }
      );
    }

    const logos = await resolveLogos(rows.map((r) => r.name)).catch(
      (): Record<string, string> => ({})
    );

    const gains = rows.filter((r) => r.gainPct > 0).length;
    const losses = rows.filter((r) => r.gainPct < 0).length;

    return NextResponse.json({
      count: rows.length,
      gains,
      losses,
      listings: rows.map((r) => ({ ...r, logo: logos[r.name] ?? null })),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "UPSTREAM_ERROR",
          message:
            err instanceof Error && err.name === "AbortError"
              ? "The listing-history source did not respond in time."
              : "Could not reach the listing-history source.",
        },
      },
      { status: 502 }
    );
  }
}
