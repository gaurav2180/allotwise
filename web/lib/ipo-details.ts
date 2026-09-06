import "server-only";

/**
 * Per-IPO issue facts, scraped from the registrar-agnostic IPO Watch page.
 *
 * The backend already parses this, but its metadata sync only runs for
 * `upcoming` and `open` issues (scripts/sync-metadata.js), so every closed IPO —
 * precisely the ones a user opens to check allotment — has null details. Rather
 * than show a grid of dashes, this fills the gaps at request time and the API
 * route merges it under whatever the backend already knows.
 *
 * Cached per slug; a miss is remembered too, so a page that does not exist is
 * not refetched on every expand.
 */

const TTL_MS = 6 * 60 * 60 * 1000;
const MISS_TTL_MS = 30 * 60 * 1000;

export interface ScrapedDetails {
  priceBand: string | null;
  faceValue: string | null;
  issueSize: string | null;
  issueType: string | null;
  listingExchanges: string | null;
  lotSize: number | null;
  minInvestment: number | null;
  allotmentDate: string | null;
  refundDate: string | null;
  listingDate: string | null;
}

const EMPTY: ScrapedDetails = {
  priceBand: null,
  faceValue: null,
  issueSize: null,
  issueType: null,
  listingExchanges: null,
  lotSize: null,
  minInvestment: null,
  allotmentDate: null,
  refundDate: null,
  listingDate: null,
};

const strip = (s: string) =>
  s
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const MONTHS: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

/** "September 2, 2026" -> "2026-09-02" */
function longDate(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  if (!m) return null;
  const mm = MONTHS[m[1].toLowerCase()];
  return mm ? `${m[3]}-${mm}-${m[2].padStart(2, "0")}` : null;
}

const intOf = (s: string | undefined): number | null => {
  const m = String(s ?? "").replace(/[₹,\s]/g, "").match(/\d+/);
  return m ? Number(m[0]) : null;
};

function tables(html: string): string[][][] {
  return (html.match(/<table[\s\S]*?<\/table>/gi) ?? []).map((t) =>
    [...t.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) =>
      [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => strip(c[1]))
    )
  );
}

export function parseDetailPage(html: string): ScrapedDetails {
  const all = tables(html);

  // Label/value rows, flattened across every table on the page.
  const pairs: Record<string, string> = {};
  for (const rows of all) {
    for (const cells of rows) {
      if (cells.length >= 2 && cells[0] && cells[1]) {
        pairs[cells[0].replace(/:$/, "").trim().toLowerCase()] = cells[1].trim();
      }
    }
  }
  const get = (...keys: string[]) => keys.map((k) => pairs[k]).find(Boolean) ?? null;

  // Lot table: Application | Lot Size | Shares | Amount.
  // "Retail Minimum" can be more than one lot on SME issues, so shares-per-lot
  // is shares / lots — otherwise a 2-lot minimum reports double the real lot.
  let lotSize: number | null = null;
  let minInvestment: number | null = null;
  for (const rows of all) {
    const header = (rows[0] ?? []).join(" ").toLowerCase();
    if (!header.includes("lot size") && !header.includes("shares")) continue;
    const retail = rows.find((r) => /retail\s*min/i.test(r[0] ?? ""));
    if (!retail) continue;
    const lots = intOf(retail[1]);
    const shares = intOf(retail[2]);
    minInvestment = intOf(retail[retail.length - 1]);
    lotSize = shares !== null && lots && lots > 0 ? Math.round(shares / lots) : shares;
    break;
  }

  return {
    priceBand: get("ipo price band", "price band"),
    faceValue: get("face value"),
    issueSize: get("issue size", "total issue size"),
    issueType: get("issue type"),
    listingExchanges: get("ipo listing", "listing at"),
    lotSize,
    minInvestment,
    allotmentDate: longDate(get("basis of allotment", "allotment date", "ipo allotment date")),
    refundDate: longDate(get("refunds", "refund", "initiation of refunds")),
    listingDate: longDate(get("ipo listing date", "listing date", "tentative listing date")),
  };
}

const cache = new Map<string, { at: number; value: ScrapedDetails | null }>();

async function load(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    // Cloudflare occasionally serves an empty body to non-browser clients.
    return html.length > 5000 ? html : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Cached value without triggering a fetch. Lets the list endpoint use whatever
 * is already warm and treat the rest as simply not-yet-known, instead of
 * blocking a page load on a fan-out of page scrapes.
 */
export function peekDetails(slug: string): ScrapedDetails | null {
  const hit = cache.get(slug);
  if (!hit) return null;
  const ttl = hit.value ? TTL_MS : MISS_TTL_MS;
  if (Date.now() - hit.at >= ttl) return null;
  return hit.value;
}

/** Never throws; returns nulls when the page cannot be read. */
export async function scrapeDetails(slug: string): Promise<ScrapedDetails> {
  const hit = cache.get(slug);
  if (hit) {
    const ttl = hit.value ? TTL_MS : MISS_TTL_MS;
    if (Date.now() - hit.at < ttl) return hit.value ?? EMPTY;
  }

  // The page slug is usually the market slug plus "-ipo"; some already carry it.
  const candidates = slug.endsWith("-ipo") ? [slug] : [`${slug}-ipo`, slug];
  for (const c of candidates) {
    const html = await load(`https://ipowatch.in/${c}/`);
    if (!html) continue;
    const value = parseDetailPage(html);
    // Only treat it as a hit if the page actually yielded something.
    if (value.lotSize || value.issueSize || value.listingDate || value.priceBand) {
      cache.set(slug, { at: Date.now(), value });
      return value;
    }
  }

  cache.set(slug, { at: Date.now(), value: null });
  return EMPTY;
}
