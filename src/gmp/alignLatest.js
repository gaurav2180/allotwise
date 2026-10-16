// One current premium per issue, wherever it is shown.
//
// The source publishes the premium twice: in its live table, which the list
// reads, and in each issue's day-wise table, which the history reads. The two
// are refreshed separately and disagree for hours at a time -- HD Fire Protect
// read ₹78 (+28.78%) in the live table and ₹77 in today's day-wise row, both
// stamped "16-Oct 20:37" -- so the list and the GMP page showed different
// premiums for the same issue.
//
// The live table is the headline everywhere (and the figure IPOwiz shows), so
// the day-wise row for the day of the live reading is brought in line with it:
// its premium replaced and everything derived from it recomputed, or added if
// the source has not printed that day's row yet. The day is the one the live
// reading is stamped with, never the server's: a reading from last night is
// not today's. Earlier days are the source's record and stay as printed.

import { dayMonth } from './investorgain.js';

/** The cap of a band like "₹258 to ₹271" or "₹1,065-1,120", or null. */
function capPrice(band) {
  const nums = String(band ?? '')
    .replace(/,/g, '')
    .match(/\d+(?:\.\d+)?/g);
  return nums?.length ? Number(nums[nums.length - 1]) : null;
}

/**
 * The day-wise points, the one for the live reading's day matching it.
 *
 * Only while the live table still quotes the issue (`row.gmp` is cleared once
 * it drops off). Listed issues included: their last reading is stamped with a
 * day before listing, so this never adds a day the premium was not quoted, and
 * the "Last GMP" a listed issue shows still ends its own chart.
 */
export function alignLatest(points, row, now = new Date()) {
  if (!Array.isArray(points) || points.length === 0) return points ?? [];
  if (row?.gmp === null || row?.gmp === undefined) return points;
  // "16-Oct 20:37": the day the live figure was read. Without it there is
  // no telling which day's row it belongs to, so nothing is changed.
  const day = dayMonth(row.sourceUpdatedAt, now);
  if (!day) return points;

  const last = points[points.length - 1];
  // The day-wise table is already newer than the live reading.
  if (last.date > day) return points;
  if (last.date === day && last.gmp === row.gmp) return points;

  const issuePrice = capPrice(row.priceBand);
  const gmp = row.gmp;
  const prev = last.date === day ? points[points.length - 2] : last;
  const point = {
    date: day,
    gmp,
    // The live table's own percentage, as printed, like everywhere else.
    pct: row.estGainPct ?? (issuePrice ? Number(((gmp / issuePrice) * 100).toFixed(2)) : null),
    indicative: row.estListingPrice ?? (issuePrice ? issuePrice + gmp : null),
    profit: row.lotSize ? Math.round(row.lotSize * gmp * 100) / 100 : null,
    change: prev ? Math.round((gmp - prev.gmp) * 100) / 100 : null,
  };
  return last.date === day ? [...points.slice(0, -1), point] : [...points, point];
}
