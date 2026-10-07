import { config } from '../config.js';
import { slugify } from '../lib/validate.js';

// The one market-data source: InvestorGain (investorgain.com).
//
// Chosen because it is what IPOwiz reads. Its day-wise table for Nityas Gems
// (₹9, ₹5, ₹5, ₹3, ₹3 from 28 Sep, est. listing ₹78, est. profit ₹600) is
// IPOwiz's screen number for number, and its live premiums matched IPOwiz on
// every issue compared where IPO Ji and IPO Watch each disagreed on several.
//
// Two pages:
//
//   live table   every current issue with board, status, premium, price, lot,
//                issue size, subscription, all four dates and the debut price.
//                This alone decides which IPOs exist.
//   issue page   the price band, exchanges and logo, and the day-wise premium
//                history the chart is drawn from.
//
// Grey market premium is unofficial. Every figure is attributed.

export const meta = {
  id: 'investorgain',
  label: 'InvestorGain',
  url: 'https://www.investorgain.com/report/live-ipo-gmp/331/',
  attribution: 'IPO and GMP data via InvestorGain (investorgain.com). Grey market premium is unofficial.',
};

const ORIGIN = 'https://www.investorgain.com';

const ENTITIES = { amp: '&', nbsp: ' ', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(s) {
  return String(s ?? '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

const stripTags = (s) =>
  decodeEntities(String(s ?? '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

// Cloudflare rewrites anything shaped like an address, and the debut price is
// printed as "L@455.00", so it arrives obfuscated. The encoding is a one-byte
// XOR key followed by the key-XORed bytes.
export function decodeCfEmail(hex) {
  const key = parseInt(hex.slice(0, 2), 16);
  let out = '';
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  return out;
}

const revealCfEmails = (html) =>
  html.replace(/<a[^>]*data-cfemail="([0-9a-f]+)"[^>]*>[\s\S]*?<\/a>/gi, (_, hex) => decodeCfEmail(hex));

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/**
 * "30-Sep" -> "2026-09-30". The table prints no year, so the year is the one
 * that puts the date nearest `ref`: a 2-Jan listing seen on 30 Dec is next
 * year, a 28-Dec open seen on 3 Jan is last year.
 */
export function dayMonth(raw, ref = new Date()) {
  const m = String(raw ?? '').match(/(\d{1,2})\s*-\s*([A-Za-z]{3})/);
  if (!m) return null;
  const mi = MONTHS[m[2].toLowerCase()];
  if (mi === undefined) return null;
  const day = Number(m[1]);
  let best = null;
  for (const y of [ref.getUTCFullYear() - 1, ref.getUTCFullYear(), ref.getUTCFullYear() + 1]) {
    const t = Date.UTC(y, mi, day);
    if (new Date(t).getUTCDate() !== day) continue;
    if (!best || Math.abs(t - ref.getTime()) < Math.abs(best - ref.getTime())) best = t;
  }
  return best === null ? null : new Date(best).toISOString().slice(0, 10);
}

const number = (s) => {
  const m = String(s ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  const n = m ? Number(m[0]) : NaN;
  return Number.isFinite(n) ? n : null;
};

const positive = (s) => {
  const n = number(s);
  return n !== null && n > 0 ? n : null;
};

function cells(row) {
  const out = {};
  for (const m of row.matchAll(/<td[^>]*data-label="([^"]*)"[^>]*>([\s\S]*?)<\/td>/gi)) {
    out[decodeEntities(m[1])] = m[2];
  }
  return out;
}

/**
 * Premium and its percentage, before the "low / high" line beneath them. The
 * percentage is taken as printed rather than recomputed, so it can never differ
 * from the source by a rounding step (₹42 on ₹64 is printed 65.62%, where
 * toFixed would give 65.63%).
 *
 * "₹ -- (0.00%)" is the source's way of writing a premium of zero — its range
 * line reads "0 ↓ / 0 ↑" and IPOwiz shows the same issues as ₹0 (0.0%) — so it
 * is 0, not missing. Only a cell with no figure at all is null.
 */
function parseGmp(cellHtml) {
  const head = stripTags(String(cellHtml ?? '').split(/<br\s*\/?>/i)[0]);
  const m = head.match(/₹\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return /₹\s*-{2,}/.test(head) ? { gmp: 0, pct: 0 } : { gmp: null, pct: null };
  const p = head.match(/\(\s*(-?\d+(?:\.\d+)?)\s*%\s*\)/);
  return { gmp: Number(m[1]), pct: p ? Number(p[1]) : null };
}

/** Status from dates, which are exact; the table's own letter only as a fallback. */
function statusOf({ openDate, closeDate, listingPrice, listingDate, badges }, today) {
  if (listingPrice !== null) return 'listed';
  if (listingDate && listingDate <= today && closeDate && closeDate < today) return 'listed';
  if (openDate && today < openDate) return 'upcoming';
  if (closeDate && today > closeDate) return 'closed';
  if (openDate) return 'open';
  if (badges.includes('U')) return 'upcoming';
  if (badges.includes('O')) return 'open';
  if (badges.includes('C')) return 'closed';
  return 'unknown';
}

/** Parse the live table: every current issue and everything the list shows. */
export function parse(html, { ref = new Date() } = {}) {
  const today = ref.toISOString().slice(0, 10);
  const records = [];

  for (const row of html.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    if (!/data-label="GMP"/i.test(row)) continue;
    const c = cells(row);
    const nameCell = revealCfEmails(c.Name ?? '');

    const link = nameCell.match(/<a[^>]*href="(\/gmp\/[^"]+)"[^>]*title="([^"]*)"/i);
    const name = decodeEntities(link?.[2] ?? stripTags(nameCell.split(/<span/i)[0])).trim();
    if (!name) continue;

    const badges = [...nameCell.matchAll(/<span[^>]*class="[^"]*badge[^"]*"[^>]*>([\s\S]*?)<\/span>/gi)].map((m) =>
      stripTags(m[1])
    );
    const exchangeBadge = badges.find((b) => /\bSME\b/i.test(b)) ?? null;

    const listed = stripTags(nameCell).match(/L@\s*(-?\d+(?:\.\d+)?)/);
    const listingPrice = listed ? positive(listed[1]) : null;

    const openDate = dayMonth(stripTags(c.Open), ref);
    const closeDate = dayMonth(stripTags(c.Close), ref);
    const allotmentDate = dayMonth(stripTags(c['BoA Dt']), ref);
    const listingDate = dayMonth(stripTags(c.Listing), ref);

    const price = positive(stripTags(c['Price (₹)'] ?? c.Price));
    const { gmp, pct } = parseGmp(c.GMP);
    const issueSize = stripTags(c['IPO Size']);

    records.push({
      name,
      slug: slugify(name),
      board: exchangeBadge ? 'sme' : 'mainboard',
      gmp,
      gmpTrend: null,
      // The table prints the cap only. The issue page supplies the full band,
      // which the database keeps over this whenever the two share a cap.
      priceBand: price ? `₹${price}` : null,
      estListingPrice: gmp !== null && price ? Number((price + gmp).toFixed(2)) : null,
      // No price announced yet means no percentage: the source prints "(0.00%)"
      // beside Jio's ₹177, which would read as a real zero gain.
      estGainPct: gmp === null || !price ? null : (pct ?? Number(((gmp / price) * 100).toFixed(2))),
      openDate,
      closeDate,
      allotmentDate,
      listingDate,
      status: statusOf({ openDate, closeDate, listingPrice, listingDate, badges }, today),
      sourceUpdatedAt: stripTags(c['Updated-On']) || null,
      source: meta.id,
      gmpSource: meta.id,
      sourcePath: link?.[1] ?? null,
      lotSize: positive(stripTags(c.Lot)),
      issueSize: /₹/.test(issueSize) ? issueSize : null,
      subscription: positive(stripTags(c.Sub)),
      listingPrice,
      listingExchanges: exchangeBadge,
    });
  }
  return records;
}

/**
 * The issue page's prose and metadata live in an escaped script payload, so
 * `<`, `\"` and `\\` have to be undone, sometimes twice, before it reads
 * as text.
 */
function payloadText(html) {
  let s = html;
  for (let i = 0; i < 2; i++) {
    s = s
      .replace(/\\\\/g, '\\')
      .replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\"/g, '"')
      .replace(/\\\//g, '/');
  }
  return s;
}

/** Day-wise premium, oldest first, exactly as the issue page tabulates it. */
export function parseHistory(html, { ref = new Date() } = {}) {
  const table = (html.match(/<table[\s\S]*?<\/table>/gi) ?? []).find((t) => /GMP Date/i.test(t));
  if (!table) return [];

  const byDay = new Map();
  for (const row of table.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const byTitle = {};
    for (const m of row.matchAll(/<td[^>]*data-title="([^"]*)"[^>]*>([\s\S]*?)<\/td>/gi)) {
      byTitle[decodeEntities(m[1]).toLowerCase()] = m[2];
    }
    const td = (title) => byTitle[title.toLowerCase()];
    const date = dayMonth(stripTags(td('GMP Date & Time') ?? td('GMP Date')), ref);
    const gmpCell = stripTags(td('GMP'));
    if (!date || !gmpCell) continue;
    const gmp = gmpCell.match(/₹\s*(-?\d+(?:\.\d+)?)/);
    if (!gmp) continue;
    const pct = gmpCell.match(/\(\s*(-?\d+(?:\.\d+)?)\s*%\s*\)/);
    // Newest first on the page, so the first row seen for a day is its latest.
    if (byDay.has(date)) continue;
    byDay.set(date, {
      date,
      gmp: Number(gmp[1]),
      pct: pct ? Number(pct[1]) : null,
      indicative: positive(stripTags(td('Est. Listing Price'))),
      profit: number(stripTags(td('Est. Profit'))),
    });
  }

  const points = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  return points.map((p, i) => ({ ...p, change: i === 0 ? null : Number((p.gmp - points[i - 1].gmp).toFixed(2)) }));
}

/** Price band, exchanges and logo from the issue page. */
export function parseIssuePage(html) {
  const text = stripTags(payloadText(html));

  const band = text.match(/price band (?:of|at)\s*₹\s*([\d,.]+)\s*(?:to|-|–)\s*₹?\s*([\d,.]+)\s*per share/i);
  const fixed = !band && text.match(/(?:fixed |issue )price (?:of|at|is)\s*₹\s*([\d,.]+)\s*per share/i);
  const priceBand = band ? `₹${band[1]} to ₹${band[2]}` : fixed ? `₹${fixed[1]}` : null;

  const exchanges = text.match(/will list on ((?:BSE|NSE)(?:\s*(?:,|and|&)\s*(?:BSE|NSE))*(?:\s*SME)?)/i);
  const listingExchanges = exchanges
    ? exchanges[1].replace(/\s*(?:and|&)\s*/gi, ', ').replace(/\s+/g, ' ').trim()
    : null;

  const og = payloadText(html).match(/og:image"\s*,\s*"content"\s*:\s*"([^"]+)"/i)?.[1]
    ?? html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i)?.[1]
    ?? null;
  // The site's own card stands in when an issue has no logo.
  const logo = og && !/investorgain|chittorgarh-logo/i.test(og) ? og : null;

  // The registrar and its own allotment-status page, from the structured
  // registrar record ("Website: <a href=...>"). This is what lets an issue be
  // checked even when its registrar is not one Allotwise queries directly.
  const payload = payloadText(html);
  const regName = payload.match(/"registrar_name"\s*:\s*"([^"]+)"/)?.[1] ?? null;
  const regInfo = payload.match(/"registrar_basic_info"\s*:\s*"([\s\S]*?)"\s*}/)?.[1] ?? '';
  const regUrl = regInfo.match(/Website:[\s\S]*?href=\\?"(https?:\/\/[^"\\\s]+)/i)?.[1] ?? null;

  return {
    priceBand,
    listingExchanges,
    logo,
    registrarName: regName ? decodeEntities(regName).trim() : null,
    registrarUrl: regUrl && /^https:\/\//i.test(regUrl) ? regUrl : null,
  };
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
    if (!res.ok) throw new Error(`InvestorGain fetch failed: HTTP ${res.status} (${url})`);
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

export async function fetchGmp({ ref = new Date() } = {}) {
  return withRetries(async () => {
    const html = await fetchHtml(meta.url);
    const records = parse(html, { ref });
    if (!records.length) throw new Error(`InvestorGain table parsed to zero issues (${html.length} bytes)`);
    return records;
  });
}

/** One issue page: its facts and its day-wise history, from one request. */
export async function fetchIssue(sourcePath, { ref = new Date() } = {}) {
  if (!/^\/gmp\/[a-z0-9-]+\/\d+\/?$/i.test(String(sourcePath ?? ''))) {
    throw new Error(`not an InvestorGain issue path: ${sourcePath}`);
  }
  const html = await withRetries(() => fetchHtml(`${ORIGIN}${sourcePath}`));
  return { ...parseIssuePage(html), history: parseHistory(html, { ref }) };
}
