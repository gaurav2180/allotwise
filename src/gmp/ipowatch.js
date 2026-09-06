import { config } from '../config.js';
import { slugify } from '../lib/validate.js';
import { parseDateRange, normalizeStatus, parseRupees, parseEstListing } from '../lib/marketDates.js';

// GMP source adapter for IPO Watch (ipowatch.in).
//
// It is the one major GMP site that server-renders its data as clean HTML
// tables, so parsing is dependency-free and reasonably stable. Two live tables
// (mainboard + SME) each carry GMP *and* calendar fields, so a single fetch
// feeds both the /gmp and /calendar views. A third table is a historical
// GMP-vs-listing tracker, which we skip.
//
// GMP is unofficial grey-market data. Every record is stamped with source and
// the site's own "last updated" text so the API can attribute it.

export const meta = {
  id: 'ipowatch',
  label: 'IPO Watch',
  url: 'https://ipowatch.in/ipo-grey-market-premium-latest-ipo-gmp/',
  attribution: 'GMP data via IPO Watch (ipowatch.in). Grey market premium is unofficial.',
};

const stripTags = (s) =>
  s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Return each table with the board implied by its nearest preceding heading
// ("Mainboard IPO GMP" / "SME IPO GMP"), which is how the page separates them.
function splitTables(html) {
  const out = [];
  const re = /<table[\s\S]*?<\/table>/gi;
  let m;
  let lastBoard = 'mainboard';
  let cursor = 0;
  while ((m = re.exec(html)) !== null) {
    const preceding = html.slice(cursor, m.index);
    const headings = preceding.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi) || [];
    for (const h of headings) {
      const text = h.toLowerCase();
      if (text.includes('sme')) lastBoard = 'sme';
      else if (text.includes('mainboard') || text.includes('main board')) lastBoard = 'mainboard';
    }
    out.push({ html: m[0], board: lastBoard });
    cursor = m.index + m[0].length;
  }
  return out;
}
function splitRows(table) {
  const out = [];
  const re = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = re.exec(table)) !== null) out.push(m[1]);
  return out;
}
function splitCells(row) {
  const out = [];
  const re = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
  let m;
  while ((m = re.exec(row)) !== null) out.push(stripTags(m[1]));
  return out;
}

// Map a header label to a stable column key. Order matters: "Last Updated"
// contains the substring "date" (up-DATE-d), so it must be matched before the
// bare "date" column or it would steal the open/close date index.
function columnIndex(header) {
  const idx = {};
  header.forEach((h, i) => {
    const k = h.toLowerCase();
    if (k.includes('name')) idx.name = i;
    else if (k.includes('gmp')) idx.gmp = i;
    else if (k.includes('trend')) idx.trend = i;
    else if (k.includes('price band') || k === 'ipo price') idx.priceBand = i;
    else if (k.includes('listing')) idx.estListing = i;
    else if (k.includes('updated') || k.includes('last update')) idx.updated = i;
    else if (k.includes('date')) idx.date = i;
    else if (k.includes('status')) idx.status = i;
  });
  return idx;
}

// Only the two live tables carry a Status column; the historical tracker does
// not, which is how we tell them apart.
export function parse(html, { ref = new Date() } = {}) {
  const records = [];
  for (const { html: table, board } of splitTables(html)) {
    if (!/IPO GMP/i.test(table)) continue;
    const rows = splitRows(table).map(splitCells).filter((c) => c.length > 1);
    if (rows.length < 2) continue;

    const idx = columnIndex(rows[0]);
    if (idx.name === undefined || idx.gmp === undefined) continue;
    if (idx.status === undefined) continue; // historical table -> skip

    for (const cells of rows.slice(1)) {
      const name = cells[idx.name];
      if (!name || /^ipo name$/i.test(name)) continue;
      const { openDate, closeDate } = parseDateRange(cells[idx.date], ref);
      const est = parseEstListing(cells[idx.estListing]);
      records.push({
        name,
        slug: slugify(name),
        board,
        gmp: parseRupees(cells[idx.gmp]),
        gmpTrend: cells[idx.trend] || null,
        priceBand: cells[idx.priceBand] || null,
        estListingPrice: est.price,
        estGainPct: est.gainPct,
        openDate,
        closeDate,
        status: normalizeStatus(cells[idx.status]),
        sourceUpdatedAt: cells[idx.updated] || null,
        source: meta.id,
      });
    }
  }
  return records;
}

async function fetchHtmlOnce() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.gmp.timeoutMs);
  try {
    const res = await fetch(meta.url, {
      headers: {
        'User-Agent': config.gmp.userAgent,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`IPO Watch fetch failed: HTTP ${res.status}`);
    const html = await res.text();
    // Cloudflare intermittently serves an empty/near-empty body to bots; treat
    // that as a retryable failure rather than parsing zero rows.
    if (html.length < 5000 || !/IPO GMP/i.test(html)) {
      throw new Error(`IPO Watch returned an unexpected body (${html.length} bytes)`);
    }
    return html;
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchGmp({ ref = new Date() } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return parse(await fetchHtmlOnce(), { ref });
    } catch (err) {
      lastErr = err;
      if (attempt < 2) await sleep(1500 * (attempt + 1));
    }
  }
  throw lastErr;
}

// --- Per-IPO detail page (timeline + lot size + issue metadata) -------------

// "September 16, 2026" -> "2026-09-16"
const LONG_MON = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};
function longDate(raw) {
  const m = String(raw || '').match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  if (!m) return null;
  const mm = LONG_MON[m[1].toLowerCase()];
  return mm ? `${m[3]}-${mm}-${m[2].padStart(2, '0')}` : null;
}

const cleanInt = (s) => {
  const n = Number(String(s ?? '').replace(/[₹,\s]/g, '').match(/\d+/)?.[0]);
  return Number.isFinite(n) ? n : null;
};

// Build a label -> value map from the page's key/value detail tables.
function detailPairs(html) {
  const pairs = {};
  for (const { html: table } of splitTables(html)) {
    for (const cells of splitRows(table).map(splitCells)) {
      if (cells.length >= 2 && cells[0] && cells[1]) {
        pairs[cells[0].replace(/:$/, '').trim().toLowerCase()] = cells[1].trim();
      }
    }
  }
  return pairs;
}

export function parseDetails(html) {
  const p = detailPairs(html);
  const get = (...keys) => {
    for (const k of keys) if (p[k]) return p[k];
    return null;
  };

  // Retail minimum row of the lot-size table: "Retail Minimum | 1 | 107 | ₹14,980"
  let lotSize = null;
  let minInvestment = null;
  for (const { html: table } of splitTables(html)) {
    const rows = splitRows(table).map(splitCells);
    const header = (rows[0] || []).join(' ').toLowerCase();
    if (!header.includes('lot size') && !header.includes('shares')) continue;
    const retail = rows.find((r) => /retail\s*min/i.test(r[0] || ''));
    if (retail) {
      lotSize = cleanInt(retail[2] ?? retail[1]);
      minInvestment = cleanInt(retail[retail.length - 1]);
      break;
    }
  }

  return {
    faceValue: get('face value'),
    issueSize: get('issue size', 'total issue size'),
    issueType: get('issue type'),
    listingExchanges: get('ipo listing', 'listing at', 'listing'),
    allotmentDate: longDate(get('basis of allotment', 'allotment date', 'ipo allotment date')),
    refundDate: longDate(get('refunds', 'refund', 'initiation of refunds')),
    listingDate: longDate(get('ipo listing date', 'listing date', 'tentative listing date')),
    lotSize,
    minInvestment,
  };
}

// Fetch and parse one IPO's detail page. slug is IPO Watch's URL slug, which for
// current IPOs is "<name>-ipo".
export async function fetchDetails(slug) {
  const url = `https://ipowatch.in/${slug}/`;
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
    if (!res.ok) throw new Error(`IPO Watch detail fetch failed: HTTP ${res.status}`);
    const html = await res.text();
    if (html.length < 5000) throw new Error(`IPO Watch detail body too small (${html.length} bytes)`);
    return parseDetails(html);
  } finally {
    clearTimeout(timer);
  }
}
