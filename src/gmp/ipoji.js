import { config } from '../config.js';
import { slugify } from '../lib/validate.js';
import { normalizeStatus } from '../lib/marketDates.js';

// GMP + calendar source adapter for IPO Ji (ipoji.com).
//
// Two pages, because they answer different questions:
//
//   /ipo      the calendar. Every current, upcoming and recently-listed issue as
//             a card carrying name, ISO open/close dates, board, price band, lot
//             size, issue size and the expected premium. This is the spine.
//   /ipo-gmp  the premium only, for issues actively quoted, refreshed far more
//             often than the cards. Overlaid on top where the two overlap.
//
// It is a single source on purpose. Running two trackers side by side produced
// the same IPO twice in the list whenever they named it differently -- IPO Watch
// calls one "NSE" and IPO Ji "National Stock Exchange of India" -- and nothing
// short of a hand-maintained alias table reconciles those: they share no slug
// and no name token, so neither slug matching nor the fuzzy name matcher used
// for registrar links can see they are the same company. Deduplicating after the
// fact was always going to leak. One source cannot disagree with itself.
//
// IPO Ji is the one kept because it is both better-formed and more reliable.
// Dates are real ISO values in `<time datetime>` rather than IPO Watch's
// "28-1 Sept", which has to have its year and month boundary inferred; price
// bands are full ranges rather than just the cap; issue size is the published
// rupee amount rather than a share count. And through the period where IPO Watch
// was timing out from the deployed host and serving Cloudflare 522s elsewhere,
// IPO Ji stayed up.

export const meta = {
  id: 'ipoji',
  label: 'IPO Ji',
  url: 'https://www.ipoji.com/ipo-gmp',
  attribution: 'IPO calendar and GMP data via IPO Ji (ipoji.com). Grey market premium is unofficial.',
};

const CALENDAR_URL = 'https://www.ipoji.com/ipo';

const NAMED_ENTITIES = { amp: '&', nbsp: ' ', lt: '<', gt: '>', quot: '"', ndash: '–', mdash: '—', rupee: '₹' };

// The page currently serves ₹ and – as literal characters, but the rupee sign
// and the dash in a date range are exactly the two places a CMS is most likely
// to start emitting entities, and either would end up stored verbatim in a
// price band or issue size. Decoding costs nothing and removes the trap.
const stripTags = (s) =>
  s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// "Sep 4, 2026" -> "2026-09-04". Returns null rather than a guess for "TBA".
function isoDate(raw) {
  const m = String(raw || '').match(/([A-Za-z]{3,})\s+(\d{1,2}),?\s*(\d{4})/);
  if (!m) return null;
  const mi = MONTHS[m[1].slice(0, 3).toLowerCase()];
  if (mi === undefined) return null;
  const dt = new Date(Date.UTC(Number(m[3]), mi, Number(m[2])));
  if (dt.getUTCMonth() !== mi || dt.getUTCDate() !== Number(m[2])) return null;
  return dt.toISOString().slice(0, 10);
}

// "Sep 4, 2026 - Sep 8, 2026". The separator is an en dash on the page; a
// hyphen inside the month names is impossible, so splitting on either is safe.
function parseOfferDates(raw) {
  const parts = String(raw || '').split(/\s(?:-|–|to)\s/);
  if (parts.length < 2) {
    const only = isoDate(raw);
    return { openDate: only, closeDate: only };
  }
  return { openDate: isoDate(parts[0]), closeDate: isoDate(parts[1]) };
}

// Cells are read by their `data-label`, not by index, so a column being added
// or reordered does not silently shift every value by one. `label` is a pattern
// rather than a literal because the open/close header is joined by an en dash
// that the page could equally serve as `&ndash;`.
function cellByLabel(row, label) {
  const m = row.match(new RegExp(`data-label="${label}"[^>]*>([\\s\\S]*?)</td>`, 'i'));
  return m ? stripTags(m[1]) : null;
}

/**
 * Parse the `/ipo` calendar cards -- the full set of current, upcoming and
 * recently-listed issues, and the source of everything except the live premium.
 */
export function parseListing(html, { ref = new Date() } = {}) {
  const records = [];
  const today = ref.toISOString().slice(0, 10);

  for (const block of html.split(/<article class="[^"]*ipo-card[^"]*"/i).slice(1)) {
    const card = block.slice(0, block.indexOf('</article>') + 1 || undefined);
    const attrs = card.slice(0, card.indexOf('>'));
    const attr = (k) => (attrs.match(new RegExp(`${k}="([^"]*)"`, 'i')) ?? [])[1];

    const name = stripTags((card.match(/<h3[^>]*class="[^"]*ipo-card-name[^"]*"[^>]*>([\s\S]*?)<\/h3>/i) ?? [])[1] ?? '');
    if (!name) continue;

    // Real ISO values in the markup, so no parsing of display text and no year
    // to infer. An issue with no dates announced yet simply has none.
    const times = [...card.matchAll(/<time[^>]*datetime="(\d{4}-\d{2}-\d{2})"/gi)].map((m) => m[1]);
    const openDate = times[0] ?? null;
    const closeDate = times[1] ?? times[0] ?? null;

    // Labelled stats, read by label rather than position.
    const stats = {};
    for (const m of card.matchAll(
      /ipo-card-secondary-label[^>]*>([\s\S]*?)<\/span>\s*<span[^>]*ipo-card-body-value[^>]*>([\s\S]*?)<\/span>/gi
    )) {
      const value = stripTags(m[2]);
      // "N/A", "TBA" and an em dash are the page's ways of saying not announced
      // yet. Stored verbatim they become "₹N/A" on a row, so they are dropped
      // here and the field is simply absent.
      if (/^(n\/?a|tba|tbd|—|-)$/i.test(value.replace(/^₹/, '').trim())) continue;
      stats[stripTags(m[1]).toLowerCase()] = value;
    }

    // "₹208 (12%)" -- premium and its percentage of the cap price.
    const premium = stats['exp. premium'] ?? stats['exp premium'] ?? '';
    const gmpMatch = premium.match(/(-?)\s*₹\s*(\d+(?:\.\d+)?)/);
    const pctMatch = premium.match(/\(\s*(-?\d+(?:\.\d+)?)\s*%/);
    const gmp = gmpMatch ? Number(gmpMatch[2]) * (gmpMatch[1] === '-' ? -1 : 1) : null;

    // The card's own status badge conflates open with closed ("current" covers
    // both), so it is trusted only for `listed`, which the dates cannot tell us.
    // Everything else follows from the dates, which are exact.
    let status;
    if (attr('data-ipo-status') === 'listed') status = 'listed';
    else if (!openDate) status = 'upcoming';
    else if (today < openDate) status = 'upcoming';
    else if (closeDate && today > closeDate) status = 'closed';
    else status = 'open';

    records.push({
      name,
      slug: slugify(name),
      board: attr('data-ipo-board') === 'sme' ? 'sme' : 'mainboard',
      gmp,
      gmpTrend: null,
      priceBand: stats['offer price'] || null,
      estListingPrice: null,
      estGainPct: pctMatch ? Number(pctMatch[1]) : null,
      openDate,
      closeDate,
      status,
      sourceUpdatedAt: null,
      source: meta.id,
      // Carried through to the metadata sync, which would otherwise fetch a
      // detail page per issue to learn what the card already says.
      issueSize: stats['issue size'] || null,
      lotSize: (() => {
        const n = Number(String(stats['lot size'] ?? '').replace(/[,\s]/g, ''));
        return Number.isFinite(n) && n > 0 ? n : null;
      })(),
    });
  }
  return records;
}

/**
 * Parse the `/ipo-gmp` table -- the live premium, quoted far more often than the
 * calendar cards are rebuilt.
 *
 * Rows with `data-hasgmp="false"` are kept: their numeric attributes are zeroed
 * because no premium has been quoted yet, which is not the same as a premium of
 * zero, so `gmp` is null there while the calendar fields still land.
 */
export function parse(html) {
  const records = [];
  const blocks = html.split(/<tr class="gmp-row"/i).slice(1);

  for (const block of blocks) {
    const end = block.indexOf('</tr>');
    const row = end < 0 ? block : block.slice(0, end);
    const attrs = row.slice(0, row.indexOf('>'));
    const attr = (k) => (attrs.match(new RegExp(`${k}="([^"]*)"`, 'i')) ?? [])[1];

    const name = attr('data-name')?.trim();
    if (!name) continue;

    const quoted = attr('data-hasgmp') === 'true';
    const num = (k) => {
      const n = Number(attr(k));
      return Number.isFinite(n) ? n : null;
    };
    const indicative = num('data-indicative');
    const { openDate, closeDate } = parseOfferDates(cellByLabel(row, 'Open[^"]*Close'));

    records.push({
      name,
      slug: slugify(name),
      board: attr('data-type') === 'sme' ? 'sme' : 'mainboard',
      gmp: quoted ? num('data-gmp') : null,
      // IPO Ji has no trend glyph. The field is parsed but never rendered, so
      // leaving it null is a smaller lie than deriving an arrow from one point.
      gmpTrend: null,
      priceBand: cellByLabel(row, 'Price Band') || null,
      estListingPrice: quoted && indicative > 0 ? indicative : null,
      estGainPct: quoted ? num('data-pct') : null,
      openDate,
      closeDate,
      status: normalizeStatus(attr('data-status')),
      sourceUpdatedAt: cellByLabel(row, 'Last Updated') || null,
      source: meta.id,
    });
  }
  return records;
}

async function fetchHtml(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.gmp.timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': config.gmp.userAgent,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`IPO Ji fetch failed: HTTP ${res.status} (${url})`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetries(fn) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < 2) await sleep(1500 * (attempt + 1));
    }
  }
  throw lastErr;
}

/**
 * Merge the premium quoted on `/ipo-gmp` into a calendar record.
 *
 * The two pages carry the same premium at different freshness -- the cards are
 * rebuilt far less often than the table is requoted -- so the table wins where
 * both have a figure. It also has the indicative listing price and the "last
 * updated" stamp, neither of which appears on a card.
 */
function applyQuote(record, quote) {
  if (!quote) return record;
  return {
    ...record,
    gmp: quote.gmp ?? record.gmp,
    estGainPct: quote.estGainPct ?? record.estGainPct,
    estListingPrice: quote.estListingPrice ?? record.estListingPrice,
    sourceUpdatedAt: quote.sourceUpdatedAt ?? record.sourceUpdatedAt,
    priceBand: record.priceBand ?? quote.priceBand,
  };
}

export async function fetchGmp({ ref = new Date() } = {}) {
  // The calendar is the spine and must succeed; the quote overlay is an
  // enhancement, so a failure there costs freshness rather than the whole sync.
  const listing = await withRetries(async () => {
    const html = await fetchHtml(CALENDAR_URL);
    if (!/ipo-card/.test(html)) {
      throw new Error(`IPO Ji calendar returned an unexpected body (${html.length} bytes)`);
    }
    const records = parseListing(html, { ref });
    if (!records.length) throw new Error('IPO Ji calendar parsed to zero issues');
    return records;
  });

  let quotes = [];
  try {
    quotes = await withRetries(async () => {
      const html = await fetchHtml(meta.url);
      if (!/gmp-row/.test(html)) {
        throw new Error(`IPO Ji returned an unexpected body (${html.length} bytes)`);
      }
      return parse(html);
    });
  } catch {
    // Cards still carry a premium, just a staler one.
  }

  const bySlug = new Map(quotes.map((q) => [q.slug, q]));
  const merged = listing.map((r) => applyQuote(r, bySlug.get(r.slug)));

  // An issue quoted on the GMP table but absent from the calendar (it drops off
  // the cards sooner after listing) would otherwise vanish from the tracker
  // mid-run. Same source, so this cannot duplicate anything.
  const seenSlugs = new Set(merged.map((r) => r.slug));
  for (const q of quotes) if (!seenSlugs.has(q.slug)) merged.push(q);

  return merged;
}

// --- Per-IPO detail page ----------------------------------------------------

// IPO Ji's slug is not derivable from the company name ("Complete Sports
// Management India" is `complete-sports-and-management-ipo`), so it is read off
// the site's own links rather than guessed. The listing pages carry every
// current issue; one fetch covers the whole detail sync.
let slugIndex = { at: 0, rows: [] };
const SLUG_TTL_MS = 3 * 60 * 60 * 1000;

async function loadSlugIndex() {
  if (slugIndex.rows.length && Date.now() - slugIndex.at < SLUG_TTL_MS) return slugIndex.rows;

  const seen = new Map();
  for (const page of ['https://www.ipoji.com/ipo', 'https://www.ipoji.com/ipo-list']) {
    let html;
    try {
      html = await fetchHtml(page);
    } catch {
      continue; // One listing page down should not empty the index.
    }
    for (const m of html.matchAll(/href="\/ipo\/([a-z0-9-]+)"/gi)) {
      const slug = m[1];
      if (seen.has(slug)) continue;
      // "qualiance-international-ipo" -> "Qualiance International", the form the
      // name matcher compares against.
      const name = slug.replace(/-ipo$/, '').replace(/-/g, ' ');
      seen.set(slug, { slug, name });
    }
  }

  // Keep the previous index rather than emptying it on a bad fetch.
  if (seen.size) slugIndex = { at: Date.now(), rows: [...seen.values()] };
  return slugIndex.rows;
}

/** IPO Ji's own slug for a company name, or null when it does not carry it. */
export async function resolveSlug(name, bestMatch) {
  const rows = await loadSlugIndex();
  return rows.length ? (bestMatch(name, rows)?.slug ?? null) : null;
}

const cleanInt = (s) => {
  const n = Number(String(s ?? '').replace(/[₹,\s]/g, '').match(/\d+/)?.[0]);
  return Number.isFinite(n) ? n : null;
};

// The page states the same facts twice: a `fact-item` definition list at the
// top, and a milestone timeline lower down. The fact list is preferred because
// it carries values the timeline has no place for (issue size, lot size); the
// timeline backs it up for the dates, since the allotment row is rendered
// `d-none` on some issues and could plausibly be dropped rather than hidden.
function factPairs(html) {
  const pairs = {};
  const re =
    /<dt class="fact-label"[^>]*>([\s\S]*?)<\/dt>\s*<dd class="fact-value"[^>]*>([\s\S]*?)<\/dd>/gi;
  for (const m of html.matchAll(re)) {
    const label = stripTags(m[1]).replace(/:$/, '').toLowerCase();
    const value = stripTags(m[2]);
    // An em dash is the page's own "not published yet".
    if (label && value && value !== '—') pairs[label] = value;
  }
  return pairs;
}

function timelinePairs(html) {
  const pairs = {};
  const re =
    /<p class="step-date[^"]*"[^>]*>([\s\S]*?)<\/p>\s*<p class="step-label[^"]*"[^>]*>([\s\S]*?)<\/p>/gi;
  for (const m of html.matchAll(re)) {
    pairs[stripTags(m[2]).toLowerCase()] = stripTags(m[1]);
  }
  return pairs;
}

export function parseDetails(html) {
  const facts = factPairs(html);
  const steps = timelinePairs(html);
  const pick = (...keys) => {
    for (const k of keys) {
      if (facts[k]) return facts[k];
      if (steps[k]) return steps[k];
    }
    return null;
  };

  return {
    // Published as a rupee amount ("₹45.11 Cr", or "₹92.5 Cr Fresh + 76.74 Lakh
    // OFS" when the issue is split). Never a share count: a count multiplied by
    // the cap price does not reproduce the published figure, because anchor and
    // market-maker carve-outs sit outside it.
    issueSize: pick('issue size'),
    listingExchanges: pick('listing at'),
    allotmentDate: isoDate(pick('allotment date')),
    listingDate: isoDate(pick('listing', 'listing date')),
    lotSize: cleanInt(pick('lot size')),
    minInvestment: cleanInt(pick('minimum investment')),
  };
}

/** Fetch and parse one IPO's detail page, given IPO Ji's own slug. */
export async function fetchDetails(slug) {
  return parseDetails(await fetchHtml(`https://www.ipoji.com/ipo/${slug}`));
}
