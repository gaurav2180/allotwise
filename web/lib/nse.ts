import "server-only";
import { bestMatch, nameTokens } from "@/lib/match";

/**
 * NSE subscription (bidding) figures.
 *
 * The backend already does this, but only for issues it managed to match
 * against NSE's *upcoming* feed — which lists a handful of current issues. An
 * issue that has closed drops out of that feed, so it never got a symbol and
 * therefore never got subscription, even though NSE still serves its numbers.
 *
 * `public-past-issues` carries ~1400 issues back to 2012 with their symbols, so
 * it fills the gap. Symbols are not derivable from the name — "Purple Style
 * Labs" trades as PERNIASPOP — which is why this lookup exists at all.
 */

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.nseindia.com/market-data/all-upcoming-issues-ipo",
};

const SYMBOLS_TTL_MS = 6 * 60 * 60 * 1000;
// Bidding moves while an issue is open, so this is deliberately short.
const SUBS_TTL_MS = 10 * 60 * 1000;

let cookieJar = "";
let primedAt = 0;

async function prime(): Promise<void> {
  if (cookieJar && Date.now() - primedAt < 5 * 60_000) return;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch("https://www.nseindia.com/market-data/all-upcoming-issues-ipo", {
      headers: { ...BROWSER_HEADERS, Accept: "text/html" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    const set = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    const jar = set.map((c) => c.split(";")[0]).filter(Boolean);
    if (jar.length) {
      cookieJar = jar.join("; ");
      primedAt = Date.now();
    }
  } catch {
    // Leave the jar as-is; the API call may still succeed.
  } finally {
    clearTimeout(timer);
  }
}

async function api<T>(path: string, timeoutMs = 12_000): Promise<T | null> {
  await prime();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`https://www.nseindia.com/api/${path}`, {
      headers: { ...BROWSER_HEADERS, ...(cookieJar ? { Cookie: cookieJar } : {}) },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) cookieJar = "";
      return null;
    }
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

type Issue = { symbol?: string; company?: string; companyName?: string };

let symbolCache: { at: number; rows: Map<string, { symbol: string; company: string }> } = {
  at: 0,
  rows: new Map(),
};

/**
 * Every issue NSE knows a symbol for — the current-upcoming feed plus the
 * past-issue archive, merged and accumulated across fetches rather than
 * replaced wholesale.
 *
 * NSE has no single feed for issues that are *currently* open: an issue drops
 * out of "upcoming" the moment it starts, and does not appear in "past" until
 * it closes — so an issue in the middle of its bidding window is invisible to
 * a snapshot of either feed alone, even though NSE's own subscription endpoint
 * has real data for it right then. Accumulating means a symbol seen once (e.g.
 * while it was still upcoming) stays resolvable through that gap instead of
 * disappearing the moment the source that reported it moves on.
 */
async function loadSymbols(): Promise<{ symbol: string; company: string }[]> {
  if (symbolCache.rows.size && Date.now() - symbolCache.at < SYMBOLS_TTL_MS) {
    return [...symbolCache.rows.values()];
  }

  const [past, upcoming] = await Promise.all([
    api<Issue[]>("public-past-issues", 20_000),
    api<Issue[]>("all-upcoming-issues?category=ipo"),
  ]);

  let added = false;
  for (const list of [past, upcoming]) {
    if (!Array.isArray(list)) continue;
    for (const r of list) {
      const symbol = String(r.symbol ?? "").trim();
      const company = String(r.company ?? r.companyName ?? "").trim();
      if (symbol && company) {
        symbolCache.rows.set(symbol, { symbol, company });
        added = true;
      }
    }
  }

  if (added) symbolCache.at = Date.now();
  return [...symbolCache.rows.values()];
}

/**
 * Token -> candidates, so a lookup scores a handful of plausible names instead
 * of all ~1400. Scoring every candidate for every IPO meant tens of thousands
 * of tokenisations per request, which was slow enough to blow the caller's
 * time budget before the later issues were reached.
 */
let index: { at: number; byToken: Map<string, { symbol: string; company: string }[]> } | null = null;

async function loadIndex() {
  const rows = await loadSymbols();
  if (index && index.at === symbolCache.at) return index.byToken;

  const byToken = new Map<string, { symbol: string; company: string }[]>();
  for (const row of rows) {
    for (const t of nameTokens(row.company)) {
      const list = byToken.get(t);
      if (list) list.push(row);
      else byToken.set(t, [row]);
    }
  }
  index = { at: symbolCache.at, byToken };
  return byToken;
}

/** NSE symbol for a company name, or null when it does not trade on NSE. */
export async function resolveSymbol(name: string): Promise<string | null> {
  const byToken = await loadIndex();
  if (!byToken.size) return null;

  // Only names sharing at least one word with the target are worth scoring.
  const seen = new Set<{ symbol: string; company: string }>();
  for (const t of nameTokens(name)) {
    for (const row of byToken.get(t) ?? []) seen.add(row);
  }
  if (!seen.size) return null;

  return bestMatch(name, [...seen], (r) => r.company)?.symbol ?? null;
}

/**
 * Force the ~1400-company symbol index fresh, for the background warmer. A
 * page load that hits this cold pays a 20s fetch plus a full re-index; warming
 * it on a schedule means a request almost never has to.
 */
export async function warmSymbolIndex(): Promise<void> {
  symbolCache = { at: 0, rows: symbolCache.rows };
  await loadIndex();
}

const PRIMARY = new Set(["QIB", "NII", "Retail", "Employee", "Shareholder", "Total"]);

function normalizeCategory(label: string): string | null {
  const s = label.toLowerCase();
  if (s === "total") return "Total";
  if (s.includes("qualified institutional") || /\bqibs?\b/.test(s)) return "QIB";
  if (s.includes("non institutional") || s.includes("non-institutional") || /\bniis?\b/.test(s)) return "NII";
  if (s.includes("retail")) return "Retail";
  if (s.includes("employee")) return "Employee";
  if (s.includes("shareholder")) return "Shareholder";
  return null;
}

const toNum = (v: unknown): number | null => {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

export interface Subscription {
  overall: number | null;
  /** Shaped to match the backend's own subscription rows so the two sources are
   *  interchangeable downstream. Share counts are present but unused by the UI. */
  categories: {
    category: string;
    sharesOffered: number | null;
    sharesBid: number | null;
    timesSubscribed: number | null;
  }[];
}

const subsCache = new Map<string, { at: number; value: Subscription | null }>();

/** Live bidding figures for one symbol. Null when NSE has none. */
export async function fetchSubscription(symbol: string): Promise<Subscription | null> {
  const hit = subsCache.get(symbol);
  if (hit && Date.now() - hit.at < SUBS_TTL_MS) return hit.value;

  const data = await api<{ dataList?: Record<string, unknown>[] }>(
    `ipo-active-category?symbol=${encodeURIComponent(symbol)}`
  );
  const list = Array.isArray(data?.dataList) ? data.dataList : [];

  const categories: Subscription["categories"] = [];
  for (const row of list) {
    const raw = String(row.category ?? "");
    // The first row repeats the column titles.
    if (raw === "Category") continue;
    const category = normalizeCategory(raw);
    if (!category || !PRIMARY.has(category)) continue;
    const offered = toNum(row.noOfShareOffered);
    const bid = toNum(row.noOfSharesBid);
    // NSE's own ratio is unusable when it reports zero shares offered for an
    // SME issue while shares bid is genuinely large (a data-quality gap on
    // NSE's side, confirmed against real bid volumes, not a client parsing
    // bug) — recording "0.00" there would read as no demand when the truth is
    // NSE cannot compute the ratio either. `null` says "not computable here"
    // rather than asserting a number that would be a fabrication.
    const times = offered && offered > 0 ? toNum(row.noOfTotalMeant) : null;
    categories.push({
      category,
      sharesOffered: offered,
      sharesBid: bid,
      timesSubscribed: times === null ? null : Math.round(times * 100) / 100,
    });
  }

  const total = categories.find((c) => c.category === "Total");
  // Real demand is "shares were bid for", not "NSE could compute a ratio" —
  // the latter is exactly the field that goes missing for SME issues, so
  // gating on it would discard real bid data along with the broken ratio.
  const meaningful = categories.some((c) => (c.sharesBid ?? 0) > 0);
  const value = categories.length && meaningful ? { overall: total?.timesSubscribed ?? null, categories } : null;

  subsCache.set(symbol, { at: Date.now(), value });
  return value;
}

export type SubscriptionResult = { overall: number | null; categories: Subscription["categories"] };

/**
 * Resolve symbol + fetch subscription for a batch of issues, writing hits into
 * `out`. Shared by the request path (`/api/ipos`, budgeted so a cold cache
 * cannot stall the page) and the background warmer (unbounded, since nothing
 * is waiting on it). Concurrency is bounded either way — this source rate-
 * limits bursts.
 */
export async function resolveSubscriptions(
  issues: { slug: string; name: string }[],
  out: Map<string, SubscriptionResult>,
  { budgetMs }: { budgetMs?: number } = {}
): Promise<void> {
  if (!issues.length) return;

  const queue = [...issues];
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      try {
        const symbol = await resolveSymbol(next.name);
        if (!symbol) continue;
        const s = await fetchSubscription(symbol);
        if (s) out.set(next.slug, { overall: s.overall, categories: s.categories });
      } catch {
        // One issue failing must not cost the others their figures.
      }
    }
  };

  const run = Promise.all([worker(), worker(), worker()]);
  await (budgetMs ? Promise.race([run, new Promise((r) => setTimeout(r, budgetMs))]) : run);
}
