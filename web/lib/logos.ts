import "server-only";
import { matchScore, uniqueTokenMatch, MATCH_THRESHOLD } from "@/lib/match";

/**
 * Company logos for the IPO list.
 *
 * There is no logo field in our backend, so these are resolved from a public
 * IPO listing page whose logo filenames are themselves company slugs. Roughly
 * four in five current issues resolve; the rest fall back to a monogram tile in
 * the UI, which is a designed state rather than a broken image.
 *
 * Cached in module memory so the list endpoint costs one upstream fetch every
 * few hours, not one per request.
 */

// Three listing pages on the same site, each carrying a different slice of
// companies (current, mainboard-listed, SME-listed). None is comprehensive —
// together they roughly double single-page coverage. This is a real ceiling,
// not a bug: the site has no full historical archive, so a name from years
// back (as the Past tab shows) will often still resolve to a monogram.
const SOURCES = [
  "https://www.ipoji.com/ipo",
  "https://www.ipoji.com/ipo/listed-ipo",
  "https://www.ipoji.com/sme-ipo/listed-ipo",
];
const TTL_MS = 6 * 60 * 60 * 1000;

let cache: { at: number; urls: string[] } = { at: 0, urls: [] };

async function fetchOne(url: string): Promise<string[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "text/html",
      },
    });
    if (!res.ok) return [];
    const html = await res.text();
    return [...html.matchAll(/https:\/\/media\.ipoji\.com\/ipo\/images\/[a-z0-9._-]+/gi)].map((m) => m[0]);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function loadLogoUrls(): Promise<string[]> {
  if (cache.urls.length && Date.now() - cache.at < TTL_MS) return cache.urls;

  const lists = await Promise.all(SOURCES.map(fetchOne));
  const urls = [...new Set(lists.flat())];
  // Serve a stale list rather than dropping every logo when every source fails.
  if (urls.length) cache = { at: Date.now(), urls };
  return cache.urls;
}

/**
 * Force a refresh regardless of TTL, for the background warmer — so the pool
 * is hot before a page ever asks for it, rather than paying the fetch cost on
 * whichever request happens to find the cache cold.
 */
export async function warmLogos(): Promise<void> {
  cache = { at: 0, urls: cache.urls }; // keep the stale list as fallback mid-fetch
  await loadLogoUrls();
}

/** name -> logo URL, for the names that resolve. Never throws. */
export async function resolveLogos(names: string[]): Promise<Record<string, string>> {
  const urls = await loadLogoUrls();
  if (!urls.length) return {};

  const files = urls.map((u) => ({
    url: u,
    slug: (u.split("/").pop() ?? "").replace(/\.(png|jpe?g|webp|svg)$/i, ""),
  }));

  const out: Record<string, string> = {};
  for (const name of names) {
    let best: { url: string; s: number } | null = null;
    for (const f of files) {
      const s = matchScore(name, f.slug);
      if (s >= MATCH_THRESHOLD && (!best || s > best.s)) best = { url: f.url, s };
    }

    // Fall back to a single unambiguous token. "ESDS Software" and
    // "esds-solution" share only "esds", which scores below the threshold —
    // but "esds" identifies exactly one logo, so there is nothing to confuse
    // it with. A token matching several candidates is rejected.
    const resolved = best?.url ?? uniqueTokenMatch(name, files, (f) => f.slug)?.url;
    if (resolved) out[name] = resolved;
  }
  return out;
}
