import "server-only";
import { bestMatch } from "@/lib/match";
import { resolveIpojiSlug } from "@/lib/ipoji-subscription";

/**
 * Day-wise grey market premium history from IPO Ji.
 *
 * Our own `gmp_history` table only holds readings since the scheduler started,
 * so it cannot show a trend for an issue that has been quoted for weeks. IPO
 * Ji publishes the full day-wise series from the issue's first quote, which is
 * the only source checked that does — IPO Watch, where the headline premium
 * comes from, has no history table on its detail pages at all.
 *
 * Note the two sources disagree on the *value* (Qualiance: IPO Watch ₹55, IPO
 * Ji ₹40). GMP is unofficial and every tracker polls its own dealers, so there
 * is no reconciling them — the panel names the source instead of pretending
 * they are one number.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const TTL_MS = 30 * 60 * 1000;
// A miss is remembered too, so an IPO that IPO Ji does not carry is not
// refetched on every expand.
const MISS_TTL_MS = 30 * 60 * 1000;

export interface GmpPoint {
  /** ISO day, "2026-09-05". */
  date: string;
  gmp: number;
  /** Move since the previous recorded day; null on the first day. */
  change: number | null;
  /** Premium over the cap price, as published. */
  pct: number | null;
  /** Cap price + GMP, as published. Indicative only. */
  indicative: number | null;
}

/** Everything read off one IPO Ji issue page, cached together. */
interface IpojiPage {
  history: GmpPoint[];
  /** Raw issue size as published, e.g. "35,52,000 shares(agg. up to ₹45.11 Cr)". */
  issueSize: string | null;
}

const cache = new Map<string, { at: number; value: IpojiPage | null }>();

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

/** "+₹40" -> 40, "-₹6" -> -6, "—" -> null. */
function money(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = raw.replace(/,/g, "").match(/(-|\+)?\s*₹\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[2]);
  if (!Number.isFinite(n)) return null;
  return m[1] === "-" ? -n : n;
}

/** "+31%" -> 31, "-4%" -> -4. */
function percent(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = raw.match(/(-|\+)?\s*(-?\d+(?:\.\d+)?)\s*%/);
  if (!m) return null;
  const n = Number(m[2]);
  if (!Number.isFinite(n)) return null;
  return m[1] === "-" ? -n : n;
}

/**
 * The history table is marked up with a `gmp-history-table` class, ISO dates in
 * `<time datetime>`, and `data-label` on every cell — so rows are read by label
 * rather than by column position, which survives a column being added.
 */
/**
 * The trading day a reading belongs to.
 *
 * `datetime` is a UTC instant, but the table is labelled in IST and that is the
 * day a reader means. Slicing the ISO string puts an evening quote on the wrong
 * date — 2026-09-11T19:30:00Z is the 12th in Delhi — so the offset is applied
 * before the date is taken.
 */
function istDay(datetime: string): string | null {
  const ms = Date.parse(datetime);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function parseGmpHistory(html: string): GmpPoint[] {
  const start = html.indexOf("gmp-history-table");
  if (start < 0) return [];
  const end = html.indexOf("</table>", start);
  if (end < 0) return [];
  const table = html.slice(start, end);

  // Keyed by day, because the table can carry several readings for one date
  // (IPO Ji requotes through the day). Pushing each as its own point put the
  // same date on the axis three times with the line doubling back between them.
  const byDay = new Map<string, GmpPoint>();
  for (const row of table.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const stamp = (row.match(/<time[^>]*datetime="([^"]+)"/i) ?? [])[1];
    const date = stamp ? istDay(stamp) : null;
    if (!date) continue;

    const cell = (label: string) => {
      const m = row.match(new RegExp(`data-label="${label}"[^>]*>([\\s\\S]*?)</td>`, "i"));
      return m ? m[1].replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim() : undefined;
    };

    const gmp = money(cell("GMP"));
    if (gmp === null) continue;

    // Rows arrive newest-first, so the first one seen for a day is that day's
    // closing reading and an earlier one must not replace it.
    if (byDay.has(date)) continue;
    byDay.set(date, {
      date,
      gmp,
      change: null, // Recomputed below, against the previous *day*.
      pct: percent(cell("GMP %")),
      indicative: money(cell("Indicative Listing")),
    });
  }

  // The page lists newest first; a chart wants oldest first.
  const out = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));

  // The source's own Change column is the move since its previous *row*, which
  // may be earlier the same day. Once the series is one point per day that
  // number no longer describes the step the chart draws, so it is recomputed.
  return out.map((p, i) => ({ ...p, change: i === 0 ? null : p.gmp - out[i - 1].gmp }));
}

export interface IpojiGmpQuote {
  name: string;
  gmp: number;
  /** Premium over the cap price, as published. */
  pct: number | null;
  /** Cap price + GMP, as published. Indicative only. */
  indicative: number | null;
}

// The premium moves during the day, so this is deliberately short.
const INDEX_TTL_MS = 10 * 60 * 1000;
let indexCache: { at: number; rows: IpojiGmpQuote[] } = { at: 0, rows: [] };

/**
 * Current premium for every IPO IPO Ji quotes, from its one GMP listing page.
 *
 * The rows carry `data-gmp`, `data-pct` and `data-indicative` as attributes,
 * so the whole board comes from a single fetch rather than one page per IPO —
 * which is what makes it affordable to use as the headline figure for SME
 * rather than only inside an expanded row.
 */
export async function fetchIpojiGmpIndex(): Promise<IpojiGmpQuote[]> {
  if (indexCache.rows.length && Date.now() - indexCache.at < INDEX_TTL_MS) return indexCache.rows;

  const html = await fetchText("https://www.ipoji.com/ipo-gmp");
  if (!html) return indexCache.rows;

  const rows: IpojiGmpQuote[] = [];
  const rowRe = /<tr class="gmp-row"([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) !== null) {
    const attrs = m[1];
    const attr = (k: string) => (attrs.match(new RegExp(`${k}="([^"]*)"`, "i")) ?? [])[1];

    const name = attr("data-name")?.trim();
    if (!name) continue;
    // `data-hasgmp` is false before a premium is first quoted; the numeric
    // attributes are still present but zeroed, which would read as "no
    // premium" rather than "not quoted yet".
    if (attr("data-hasgmp") !== "true") continue;

    const gmp = Number(attr("data-gmp"));
    if (!Number.isFinite(gmp)) continue;

    const pct = Number(attr("data-pct"));
    const indicative = Number(attr("data-indicative"));
    rows.push({
      name,
      gmp,
      pct: Number.isFinite(pct) ? pct : null,
      indicative: Number.isFinite(indicative) && indicative > 0 ? indicative : null,
    });
  }

  // Serve the stale index rather than dropping every quote on a bad fetch.
  if (rows.length) indexCache = { at: Date.now(), rows };
  return indexCache.rows;
}

/** Force the index fresh, for the background warmer. */
export async function warmIpojiGmpIndex(): Promise<void> {
  indexCache = { at: 0, rows: indexCache.rows };
  await fetchIpojiGmpIndex();
}

/**
 * Latest IPO Ji premium for a batch of issues, writing hits into `out`.
 *
 * The listing page only carries issues still being quoted, so a closed SME
 * issue is absent from it — and leaving those on the backend's IPO Watch
 * figure would put the row's headline at odds with its own IPO Ji chart. Those
 * fall back to the last point of the day-wise page, which is the same number
 * the chart ends on. Both layers cache, so this settles to no work once warm.
 */
export async function resolveIpojiGmp(
  issues: { slug: string; name: string }[],
  out: Map<string, IpojiGmpQuote>,
  { budgetMs }: { budgetMs?: number } = {}
): Promise<void> {
  if (!issues.length) return;

  const index = await fetchIpojiGmpIndex().catch((): IpojiGmpQuote[] => []);
  const missing: { slug: string; name: string }[] = [];

  for (const issue of issues) {
    const hit = index.length ? bestMatch(issue.name, index, (q) => q.name) : null;
    if (hit) out.set(issue.slug, hit);
    else missing.push(issue);
  }
  if (!missing.length) return;

  const queue = [...missing];
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      try {
        const history = await fetchIpojiGmpHistory(next.name);
        const last = history?.[history.length - 1];
        if (last) {
          out.set(next.slug, {
            name: next.name,
            gmp: last.gmp,
            pct: last.pct,
            indicative: last.indicative,
          });
        }
      } catch {
        // One issue failing must not cost the others their premium.
      }
    }
  };

  const run = Promise.all([worker(), worker()]);
  await (budgetMs ? Promise.race([run, new Promise((r) => setTimeout(r, budgetMs))]) : run);
}

/**
 * "Issue Size 35,52,000 shares(agg. up to ₹45.11 Cr)" -> that string.
 *
 * IPO Watch publishes an exact share count for mainboard but only a rounded
 * "Approx ₹45.11 Crores" for SME; IPO Ji is the other way round. Reading it
 * here means the precise figure costs no extra request — this is the same page
 * the day-wise history already comes from.
 */
function parseIssueSize(html: string): string | null {
  for (const row of html.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const text = row
      .replace(/<[^>]*>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const m = text.match(/^Issue Size\s+(.+)$/i);
    if (m) return m[1].trim();
  }
  return null;
}

/** Both facts from one issue page, fetched once and cached together. */
async function fetchIpojiPage(name: string): Promise<IpojiPage | null> {
  const slug = await resolveIpojiSlug(name);
  if (!slug) return null;

  const hit = cache.get(slug);
  if (hit) {
    const ttl = hit.value ? TTL_MS : MISS_TTL_MS;
    if (Date.now() - hit.at < ttl) return hit.value;
  }

  const html = await fetchText(`https://www.ipoji.com/ipo-gmp/${slug}`);
  const page: IpojiPage | null = html
    ? { history: parseGmpHistory(html), issueSize: parseIssueSize(html) }
    : null;
  // Nothing useful on the page is the same as no page, for caching purposes.
  const value = page && (page.history.length || page.issueSize) ? page : null;
  cache.set(slug, { at: Date.now(), value });
  return value;
}

/** Day-wise history for one company name, or null when IPO Ji has none. */
export async function fetchIpojiGmpHistory(name: string): Promise<GmpPoint[] | null> {
  const page = await fetchIpojiPage(name);
  return page?.history.length ? page.history : null;
}

/** Issue size as IPO Ji publishes it, or null. */
export async function fetchIpojiIssueSize(name: string): Promise<string | null> {
  const page = await fetchIpojiPage(name);
  return page?.issueSize ?? null;
}
