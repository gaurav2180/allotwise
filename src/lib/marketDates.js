// Parse IPO Watch's compact date ranges into ISO open/close dates.
//
// The site prints ranges like "10-15 Sept" (open 10th, close 15th) and
// "28-1 Sept" (open 28th of the PREVIOUS month, close 1st Sept -- the month
// label always belongs to the close date). No year is given, so it is inferred
// from the reference date, rolling the year when the month sits far in the past
// or future. Anything unparseable (e.g. "TBA") returns nulls rather than a guess.

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6,
  aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

const iso = (y, mIdx, d) => {
  const dt = new Date(Date.UTC(y, mIdx, d));
  if (dt.getUTCMonth() !== ((mIdx % 12) + 12) % 12 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
};

function inferYear(closeMonthIdx, ref) {
  const refMonth = ref.getUTCMonth();
  const refYear = ref.getUTCFullYear();
  let year = refYear;
  const delta = closeMonthIdx - refMonth;
  // A month more than 6 back is next year's (upcoming); more than 6 ahead is
  // last year's (a just-closed IPO seen early in January).
  if (delta < -6) year += 1;
  else if (delta > 6) year -= 1;
  return year;
}

export function parseDateRange(raw, ref = new Date()) {
  const empty = { openDate: null, closeDate: null };
  if (typeof raw !== 'string') return empty;
  const text = raw.replace(/\s+/g, ' ').trim();

  // "10-15 Sept" or "28-1 Sept" (also tolerates en-dash and "to").
  const m = text.match(/^(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s+([A-Za-z]+)/);
  if (!m) return empty;

  const openDay = Number(m[1]);
  const closeDay = Number(m[2]);
  const closeMonthIdx = MONTHS[m[3].toLowerCase()];
  if (closeMonthIdx === undefined) return empty;

  const year = inferYear(closeMonthIdx, ref);
  const closeDate = iso(year, closeMonthIdx, closeDay);

  // If the open day is greater than the close day, the range crosses a month
  // boundary and the open date is in the previous month.
  const openMonthIdx = openDay > closeDay ? closeMonthIdx - 1 : closeMonthIdx;
  const openYear = openMonthIdx < 0 ? year - 1 : year;
  const openDate = iso(openYear, openMonthIdx, openDay);

  return { openDate, closeDate };
}

// Normalize the site's status text to a small fixed vocabulary.
export function normalizeStatus(raw) {
  const s = String(raw || '').toLowerCase();
  if (s.includes('open') || s.includes('live')) return 'open';
  if (s.includes('upcoming')) return 'upcoming';
  if (s.includes('close')) return 'closed';
  if (s.includes('list')) return 'listed';
  return 'unknown';
}

// "₹18" -> 18, "₹-" / "" -> null, "-₹5" -> -5.
export function parseRupees(raw) {
  if (raw == null) return null;
  const s = String(raw).replace(/[,\s]/g, '');
  const m = s.match(/(-?)₹?(-?)(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const neg = m[1] === '-' || m[2] === '-';
  const n = Number(m[3]);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

// "₹158 (12.86%)" -> { price: 158, gainPct: 12.86 }
// The price lives before the parenthesis; parsing the whole string would let the
// percentage's digits ("0.00%") masquerade as a price when the price is "₹-".
export function parseEstListing(raw) {
  const s = String(raw || '');
  const price = parseRupees(s.split('(')[0]);
  const pct = s.match(/(-?\d+(?:\.\d+)?)\s*%/);
  return { price, gainPct: pct ? Number(pct[1]) : null };
}
