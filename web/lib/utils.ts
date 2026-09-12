import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Indian grouping: 1,23,456 rather than 123,456. */
export function inr(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN");
}

export function signedPct(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n) || n === 0) return "0.00%";
  return `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
}

/**
 * The registrar reports subscription as a multiple. Below 10x two decimals are
 * meaningful; above it they are noise on a number people read at a glance.
 */
export function times(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n < 10 ? `${n.toFixed(2)}x` : `${Math.round(n)}x`;
}

/**
 * Issue price for a narrow column: "₹408 to ₹429 Per Share" -> "₹408–₹429".
 *
 * Both ends carry the rupee sign — dropping the second one saved a few pixels
 * but read as a range of bare numbers, and the detail panel spells it out in
 * full, so the two views disagreed. The dash stays unspaced to keep it inside
 * the ~96px column; the widest real band is nine characters. A fixed-price
 * issue carries one figure and renders as-is. Null when the source holds no
 * real number (the calendar writes a bare "₹-" for an unannounced band), so the
 * caller can fall back rather than print a dash with a currency sign glued to
 * it.
 */
/** Highest number in a price band string — the cap, which applications are priced at. */
export function capPrice(band: string | null | undefined): number | null {
  if (!band) return null;
  const nums = [...String(band).matchAll(/([\d,]+(?:\.\d+)?)/g)]
    .map((m) => Number(m[1].replace(/,/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);
  return nums.length ? Math.max(...nums) : null;
}

/**
 * Shares in the smallest application a retail investor can actually make, and
 * the premium that would be earned on it.
 *
 * The obvious formula — premium times lot size — is wrong for SME, where the
 * minimum application is **two** lots, not one. Qualiance has a 1,000-share lot
 * and a ₹2,54,000 minimum, which is 2,000 shares: showing "₹42,000" beside
 * "Min investment ₹2,54,000" describes half the investment the cell above it
 * names, and the real figure is ₹84,000. Mainboard is unaffected (its minimum is
 * one lot), which is why this went unnoticed.
 *
 * The multiple is derived from the two published figures rather than assumed, so
 * it stays right if an issue uses some other minimum. Null unless everything
 * needed is present and reconciles — a missing row is better than a wrong
 * number, and this one is about money.
 */
export function minApplication(
  lotSize: number | null | undefined,
  minInvestment: number | null | undefined,
  priceBand: string | null | undefined
): { shares: number; lots: number } | null {
  const cap = capPrice(priceBand);
  if (!lotSize || lotSize <= 0 || !minInvestment || minInvestment <= 0 || !cap) return null;

  const lots = Math.round(minInvestment / (lotSize * cap));
  if (lots < 1) return null;

  // The derived multiple has to reproduce the published minimum exactly, give or
  // take a rupee of rounding. Every issue checked does: 2,000 × ₹127 = ₹2,54,000,
  // 178 × ₹84 = ₹14,952, 8 × ₹1,785 = ₹14,280. A proportional tolerance is far
  // too loose here — at 2% a ₹16,000 discrepancy on a ₹10 lakh minimum passes,
  // and the whole point of this check is that the three figures describe one
  // issue. If they do not, show nothing.
  const implied = lots * lotSize * cap;
  if (Math.abs(implied - minInvestment) > 1) return null;

  return { shares: lots * lotSize, lots };
}

export function formatPriceBand(band: string | null | undefined): string | null {
  if (!band) return null;
  const nums = [...band.matchAll(/([\d,]+(?:\.\d+)?)/g)].map((m) => Number(m[1].replace(/,/g, "")));
  const valid = nums.filter((n) => Number.isFinite(n) && n > 0);
  if (!valid.length) return null;

  const lo = valid[0];
  const hi = valid[valid.length - 1];
  return hi === lo ? `₹${inr(lo)}` : `₹${inr(lo)}–₹${inr(hi)}`;
}

/**
 * Issue size as a rupee amount in crores, or null.
 *
 * Only ever the amount a source actually published — never one derived from a
 * share count. The two are not interchangeable: Kanohar is "1,69,49,595 shares"
 * on IPO Watch and "₹1055.74 Crores" on IPO Ji, but multiplying that count by
 * the ₹632 cap gives ₹1071 Cr. The gap is real (anchor and reserved portions
 * price differently), so a computed figure would be quietly wrong on every row.
 *
 * Null when no source published an amount, so the caller shows a dash rather
 * than a share count dressed up as money.
 */
export function formatIssueSize(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = String(raw)
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^approx\.?\s*/i, "");

  // A composite issue ("₹92.5 Cr Fresh + 76.74 Lakh OFS") quotes an amount for
  // the fresh leg only — the offer-for-sale leg is in shares, priced at
  // whatever the book discovers. Reducing that to "₹92.5 Cr" would understate
  // the issue, so the composition is kept instead of a wrong single figure.
  if (/\+/.test(text) && /\bOFS\b|offer for sale/i.test(text)) {
    return text.replace(/crores?/gi, "Cr").replace(/\blakh\b/gi, "L");
  }

  const crore = text.match(/₹\s*([\d,]+(?:\.\d+)?)\s*(?:cr|crore|crores)\b/i)?.[1];
  return crore ? `₹${crore} Cr` : null;
}

/** Whether a raw issue-size string carries a published rupee amount. */
export const hasIssueAmount = (v: unknown): boolean =>
  /₹\s*[\d,]+(?:\.\d+)?\s*(?:cr|crore|crores)\b/i.test(String(v ?? ""));

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

export type Phase = "upcoming" | "open" | "closed";

/**
 * The phase an issue is actually in, derived from its dates.
 *
 * The scraped `status` is only as fresh as the last sync, so an issue that
 * closed overnight still arrives marked "open" — which renders as the nonsense
 * "Closes yesterday". Dates do not go stale, so they win wherever they exist,
 * and `status` is the fallback when they are missing.
 */
export function derivePhase(
  ipo: { openDate?: string | null; closeDate?: string | null; status?: string },
  now = new Date()
): Phase {
  const today = now.toISOString().slice(0, 10);
  if (ipo.closeDate && ipo.closeDate < today) return "closed";
  if (ipo.openDate && ipo.openDate > today) return "upcoming";
  if (ipo.openDate && ipo.openDate <= today) return "open";
  if (ipo.status === "upcoming" || ipo.status === "open" || ipo.status === "closed") {
    return ipo.status;
  }
  return "closed";
}

/** Whole days from today to an ISO date; negative once it is past. */
export function daysUntil(iso: string | null | undefined, now = new Date()): number | null {
  if (!iso) return null;
  const target = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(target)) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - today) / 86_400_000);
}

/**
 * "Opens in 3d" reads faster than "Opens 7 Sept" when the decision is whether
 * to act today. Falls back to the absolute date past a week, where a countdown
 * stops being the more useful form.
 */
export function relativeDay(iso: string | null | undefined, now = new Date()): string | null {
  const d = daysUntil(iso, now);
  if (d === null) return null;
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d > 1 && d <= 7) return `in ${d}d`;
  if (d === -1) return "yesterday";
  return null;
}
