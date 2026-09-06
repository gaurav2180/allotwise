import { config } from '../config.js';
import { slugify } from '../lib/validate.js';

// NSE India's public IPO endpoints. Official data, clean JSON:
//   - all-upcoming-issues?category=ipo  -> metadata (dates, price, issue size)
//   - ipo-active-category?symbol=SYM    -> live subscription (× subscribed)
//
// NSE gates its /api routes behind a session cookie set when you load a page,
// and returns 401/empty to a cold client. So we prime a cookie jar from the
// homepage once and reuse it. Mainboard only -- SME issues live on NSE Emerge /
// BSE SME, which are not wired here.

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  Accept: 'text/html,application/json,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
};

let cookieJar = '';
let primedAt = 0;

async function prime() {
  // Re-prime at most every few minutes.
  if (cookieJar && Date.now() - primedAt < 5 * 60_000) return;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.nse.timeoutMs);
  try {
    const res = await fetch(config.nse.homepage, { headers: BROWSER_HEADERS, signal: ctrl.signal });
    // Node's fetch exposes multiple Set-Cookie via getSetCookie().
    const set = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    const jar = set.map((c) => c.split(';')[0]).filter(Boolean);
    if (jar.length) {
      cookieJar = jar.join('; ');
      primedAt = Date.now();
    }
  } finally {
    clearTimeout(timer);
  }
}

async function apiGet(path) {
  await prime();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.nse.timeoutMs);
  try {
    const res = await fetch(`${config.nse.apiBase}/${path}`, {
      headers: {
        ...BROWSER_HEADERS,
        Accept: 'application/json',
        Referer: 'https://www.nseindia.com/market-data/all-upcoming-issues-ipo',
        ...(cookieJar ? { Cookie: cookieJar } : {}),
      },
      signal: ctrl.signal,
    });
    if (res.status === 401 || res.status === 403) {
      // Cookie expired -- force a re-prime and retry once.
      cookieJar = '';
      await prime();
      const retry = await fetch(`${config.nse.apiBase}/${path}`, {
        headers: {
          ...BROWSER_HEADERS,
          Accept: 'application/json',
          Referer: 'https://www.nseindia.com/market-data/all-upcoming-issues-ipo',
          ...(cookieJar ? { Cookie: cookieJar } : {}),
        },
        signal: ctrl.signal,
      });
      if (!retry.ok) throw new Error(`NSE ${path} failed: HTTP ${retry.status}`);
      return retry.json();
    }
    if (!res.ok) throw new Error(`NSE ${path} failed: HTTP ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

// "01-Sep-2026" -> "2026-09-01"
const MON = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
export function nseDate(raw) {
  const m = String(raw || '').match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return null;
  const mm = MON[m[2].toLowerCase()];
  return mm ? `${m[3]}-${mm}-${m[1].padStart(2, '0')}` : null;
}

/** Metadata for currently-listed/upcoming mainboard IPOs. */
export async function fetchMetadata() {
  const data = await apiGet('all-upcoming-issues?category=ipo');
  if (!Array.isArray(data)) return [];
  return data
    .filter((r) => r.companyName && r.symbol)
    .map((r) => ({
      symbol: r.symbol,
      name: r.companyName,
      slug: slugify(r.companyName),
      openDate: nseDate(r.issueStartDate),
      closeDate: nseDate(r.issueEndDate),
      priceText: r.issuePrice ?? null,
      issueSizeShares: r.issueSize ?? null,
      status: r.status ?? null,
    }));
}

// Normalize NSE's verbose category labels to the primary categories users care
// about. NSE also returns granular sub-rows (Mutual funds, Corporates, Cut Off,
// Price bids, ...) that break QIB/NII down further; those return null and are
// dropped, keeping the response to the headline numbers.
export function normalizeCategory(label) {
  const s = String(label || '').toLowerCase();
  if (s === 'total') return 'Total';
  if (s.includes('qualified institutional') || /\bqibs?\b/.test(s)) return 'QIB';
  if (s.includes('non institutional') || s.includes('non-institutional') || /\bniis?\b/.test(s)) return 'NII';
  if (s.includes('retail')) return 'Retail';
  if (s.includes('employee')) return 'Employee';
  if (s.includes('shareholder')) return 'Shareholder';
  return null;
}

const toNum = (v) => {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

/**
 * Live subscription for one symbol. Returns [{ category, sharesOffered,
 * sharesBid, timesSubscribed }] plus the source's update time.
 * Empty array when NSE has no bidding data yet (issue not open).
 */
// Pure parser for the NSE ipo-active-category payload. Exported for tests.
export function parseSubscription(data) {
  const list = Array.isArray(data?.dataList) ? data.dataList : [];
  const rows = [];
  for (const row of list) {
    // The first row repeats the column titles; skip it.
    if (row.category === 'Category' || /no\.?\s*of shares/i.test(row.noOfSharesBid || '')) continue;
    const category = normalizeCategory(row.category);
    if (!category) continue; // granular sub-breakdown -> drop
    const times = toNum(row.noOfTotalMeant);
    rows.push({
      category,
      sharesOffered: toNum(row.noOfShareOffered),
      sharesBid: toNum(row.noOfSharesBid),
      timesSubscribed: times === null ? null : Math.round(times * 100) / 100,
    });
  }
  return { rows, updateTime: data?.updateTime ?? null };
}

export async function fetchSubscription(symbol) {
  const data = await apiGet(`ipo-active-category?symbol=${encodeURIComponent(symbol)}`);
  return parseSubscription(data);
}
