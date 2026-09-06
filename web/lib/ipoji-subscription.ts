import "server-only";
import { bestMatch, uniqueTokenMatch } from "@/lib/match";
import type { SubscriptionResult } from "@/lib/nse";

/**
 * SME subscription figures from IPO Ji.
 *
 * NSE reports zero shares *offered* for SME issues even when shares bid is
 * real and large (see lib/nse.ts) — its own ratio is uncomputable there, not
 * merely absent. IPO Ji publishes the multiple directly on each issue's page,
 * so this reads it rather than reconstructing a denominator (an earlier
 * attempt at that, from issue size ÷ price band, undercounted because it
 * didn't exclude anchor/market-maker carve-outs — confirmed against IPO Ji's
 * own numbers: Ashutosh Fibre computed as 56x, the real figure is 133.82x).
 *
 * IPO Ji's slug is not derivable from the company name — "Complete Sports
 * Management India" is `complete-sports-and-management-ipo` — so slugs are
 * resolved the same way logos are (lib/logos.ts): real `/ipo/<slug>` links
 * pulled from IPO Ji's own listing pages, fuzzy-matched by name, rather than
 * guessed.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// Two pages, together comprehensive: /ipo carries current issues, /ipo-list is
// IPO Ji's own historical archive. Verified they yield the same combined slug
// set as six candidate URLs guessed from the site's nav.
const LISTING_SOURCES = ["https://www.ipoji.com/ipo", "https://www.ipoji.com/ipo-list"];
const SLUG_TTL_MS = 6 * 60 * 60 * 1000;
const SUBS_TTL_MS = 10 * 60 * 1000;

async function fetchText(url: string, timeoutMs = 15_000): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: { "User-Agent": UA, Accept: "text/html" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

let slugCache: { at: number; entries: { slug: string; name: string }[] } = { at: 0, entries: [] };

async function loadSlugs(): Promise<{ slug: string; name: string }[]> {
  if (slugCache.entries.length && Date.now() - slugCache.at < SLUG_TTL_MS) return slugCache.entries;

  const pages = await Promise.all(LISTING_SOURCES.map((u) => fetchText(u)));
  const seen = new Map<string, string>();
  const linkRe = /<a[^>]*href="\/ipo\/([a-z0-9-]+)"[^>]*>([\s\S]{0,300}?)<\/a>/gi;
  for (const html of pages) {
    if (!html) continue;
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(html)) !== null) {
      const slug = m[1];
      const name = m[2]
        .replace(/<[^>]*>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^View\s+/i, "")
        .replace(/\s+IPO$/i, "")
        .trim();
      if (name.length > 2 && !seen.has(slug)) seen.set(slug, name);
    }
  }

  const entries = [...seen.entries()].map(([slug, name]) => ({ slug, name }));
  // Serve a stale list rather than dropping every slug when both sources fail.
  if (entries.length) slugCache = { at: Date.now(), entries };
  return slugCache.entries;
}

/**
 * IPO Ji's own slug for a company name. Exported because the GMP history
 * scraper needs the same lookup — the slug is not derivable from the name, and
 * building a second index of it would double the fetching for no gain.
 */
export async function resolveIpojiSlug(name: string): Promise<string | null> {
  const entries = await loadSlugs();
  if (!entries.length) return null;
  const hit = bestMatch(name, entries, (e) => e.name) ?? uniqueTokenMatch(name, entries, (e) => e.name);
  return hit?.slug ?? null;
}

const CATEGORY_MAP: [RegExp, string][] = [
  [/qualified institutional/i, "QIB"],
  [/non-?institutional/i, "NII"],
  [/individual/i, "Retail"],
  [/employee/i, "Employee"],
  [/shareholder/i, "Shareholder"],
  [/^total$/i, "Total"],
];

function normalizeCategory(label: string): string | null {
  const trimmed = label.trim();
  for (const [re, name] of CATEGORY_MAP) if (re.test(trimmed)) return name;
  return null;
}

/**
 * The subscription card is a fixed block of `<span>Category</span><span>
 * xx.xxx x</span>` pairs (progress-bar labels), duplicated once for a
 * mobile-only layout variant with identical values — deduping by category
 * keeps the first occurrence, which is fine since both copies agree. Rows
 * outside the section id (`bHNI`, `sHNI` — a split of NII, not a top-level
 * category) don't match `normalizeCategory` and are dropped rather than
 * double-counted.
 */
function parseSubscriptionBlock(html: string): SubscriptionResult | null {
  const start = html.indexOf('id="ipo-live-subscription"');
  if (start < 0) return null;
  const block = html.slice(start, start + 8000);

  const pairRe = /<span[^>]*>\s*([^<]+?)\s*<\/span>\s*<span[^>]*>\s*([\d.]+)\s*x\s*<\/span>/gi;
  const seen = new Map<string, number>();
  let m: RegExpExecArray | null;
  while ((m = pairRe.exec(block)) !== null) {
    const category = normalizeCategory(m[1]);
    const value = Number(m[2]);
    if (category && Number.isFinite(value) && !seen.has(category)) seen.set(category, value);
  }
  if (!seen.size) return null;

  const categories: SubscriptionResult["categories"] = [...seen.entries()].map(([category, timesSubscribed]) => ({
    category,
    sharesOffered: null,
    sharesBid: null,
    timesSubscribed,
  }));
  return { overall: seen.get("Total") ?? null, categories };
}

const subsCache = new Map<string, { at: number; value: SubscriptionResult | null }>();

async function fetchIpojiSubscription(slug: string): Promise<SubscriptionResult | null> {
  const hit = subsCache.get(slug);
  if (hit && Date.now() - hit.at < SUBS_TTL_MS) return hit.value;

  const html = await fetchText(`https://www.ipoji.com/ipo/${slug}`);
  const value = html ? parseSubscriptionBlock(html) : null;
  subsCache.set(slug, { at: Date.now(), value });
  return value;
}

/**
 * Resolve slug + fetch subscription for a batch of (typically SME) issues,
 * writing hits into `out`. Mirrors `resolveSubscriptions` in lib/nse.ts —
 * shared shape by the request path (budgeted) and the background warmer
 * (unbounded).
 */
export async function resolveIpojiSubscriptions(
  issues: { slug: string; name: string }[],
  out: Map<string, SubscriptionResult>,
  { budgetMs }: { budgetMs?: number } = {}
): Promise<void> {
  if (!issues.length) return;

  const queue = [...issues];
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      try {
        const slug = await resolveIpojiSlug(next.name);
        if (!slug) continue;
        const value = await fetchIpojiSubscription(slug);
        if (value) out.set(next.slug, value);
      } catch {
        // One issue failing must not cost the others their figures.
      }
    }
  };

  const run = Promise.all([worker(), worker()]);
  await (budgetMs ? Promise.race([run, new Promise((r) => setTimeout(r, budgetMs))]) : run);
}

/**
 * Force the slug index fresh, for the background warmer — so a page load
 * never pays the two listing-page fetches itself.
 */
export async function warmIpojiSlugIndex(): Promise<void> {
  slugCache = { at: 0, entries: slugCache.entries };
  await loadSlugs();
}
