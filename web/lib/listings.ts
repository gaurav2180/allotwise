import "server-only";

/**
 * Listed-IPO outcomes: what each issue actually opened at, against its issue
 * price.
 *
 * The backend's GMP adapter deliberately skips this table (it has no Status
 * column, so it is not a live issue), which means the outcome data exists at the
 * source but not in our API. It is parsed here instead. Roughly one issue in
 * five listed below its price, and those are the rows that matter most — the
 * UI renders them in the negative colour without softening.
 */

const SOURCE = "https://ipowatch.in/ipo-grey-market-premium-latest-ipo-gmp/";
const TTL_MS = 6 * 60 * 60 * 1000;

export interface Listing {
  name: string;
  issuePrice: number;
  gmp: number | null;
  listingPrice: number;
  /** Actual listing gain or loss against the issue price. */
  gainPct: number;
}

const strip = (s: string) =>
  s
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const num = (s: string): number | null => {
  const m = String(s).replace(/[,\s]/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
};

export function parseListings(html: string): Listing[] {
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) ?? [];
  for (const t of tables) {
    const rows = [...t.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) =>
      [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => strip(c[1]))
    );
    if (rows.length < 2) continue;

    const header = rows[0].map((h) => h.toLowerCase());
    // The outcome table is the one carrying a listing price.
    const iName = header.findIndex((h) => h.includes("name"));
    const iPrice = header.findIndex((h) => h.includes("ipo price"));
    const iGmp = header.findIndex((h) => h.includes("gmp"));
    const iListing = header.findIndex((h) => h.includes("listing price"));
    if (iName < 0 || iPrice < 0 || iListing < 0) continue;

    const out: Listing[] = [];
    for (const cells of rows.slice(1)) {
      const name = cells[iName];
      const issuePrice = num(cells[iPrice] ?? "");
      const listingPrice = num(cells[iListing] ?? "");
      if (!name || issuePrice === null || listingPrice === null || issuePrice === 0) continue;
      out.push({
        name,
        issuePrice,
        gmp: iGmp >= 0 ? num(cells[iGmp] ?? "") : null,
        listingPrice,
        gainPct: Math.round(((listingPrice - issuePrice) / issuePrice) * 10000) / 100,
      });
    }
    if (out.length) return out;
  }
  return [];
}

let cache: { at: number; rows: Listing[] } = { at: 0, rows: [] };

export async function fetchListings(): Promise<Listing[]> {
  if (cache.rows.length && Date.now() - cache.at < TTL_MS) return cache.rows;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(SOURCE, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    // Cloudflare intermittently serves an empty body to non-browser clients.
    if (html.length < 5000) throw new Error("short body");
    const rows = parseListings(html);
    if (rows.length) cache = { at: Date.now(), rows };
    return rows.length ? rows : cache.rows;
  } finally {
    clearTimeout(timer);
  }
}
