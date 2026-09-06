/**
 * Fuzzy company-name matching across sources.
 *
 * The same issue is written differently everywhere — "ESDS Software Solution
 * Limited - IPO", "ESDS Software", "esds-solution-logo". Token-set containment
 * matches an abbreviated name to its fuller form, with a guard so a single
 * short shared word ("Projects") cannot join two unrelated companies.
 */

const STOP = new Set([
  "limited", "ltd", "private", "pvt", "ipo", "sme", "logo", "the", "and", "of",
  "png", "jpg", "jpeg", "webp", "svg", "india", "inc", "corp", "co", "company",
]);

export function nameTokens(value: string): string[] {
  return [
    ...new Set(
      String(value)
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, " ")
        .split(" ")
        .filter((t) => t && !STOP.has(t))
    ),
  ];
}

/** Levenshtein, bailing out once the distance exceeds `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Two tokens naming the same thing.
 *
 * Sources disagree in small ways that are not real differences:
 * "construction" vs "constructions" (plural) and "chemicals" vs "checmicals"
 * (a typo at the source). Both are treated as equal; the length floors keep
 * short words from collapsing into each other.
 */
export function tokensEqual(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= 5 && long.startsWith(short)) return true;
  if (short.length >= 6 && editDistance(a, b, 1) <= 1) return true;
  return false;
}

function sharedTokens(ta: string[], tb: string[]): string[] {
  return ta.filter((t) => tb.some((u) => tokensEqual(t, u)));
}

/**
 * True when `short` is the opening run of `long`, word for word. Requires at
 * least two words so a single shared first name ("Bajaj", "Tata") cannot
 * qualify on its own.
 */
function isPrefixSequence(short: string[], long: string[]): boolean {
  if (short.length < 2 || short.length >= long.length) return false;
  return short.every((t, i) => tokensEqual(t, long[i]));
}

/** Similarity in [0,1]. 0 when there is no defensible overlap. */
export function matchScore(a: string, b: string): number {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return 0;
  const shared = sharedTokens(ta, tb);
  if (!shared.length) return 0;

  // Identical token sets are the same name however short — "NSE" against
  // "nse-ipo-logo" reduces to {nse} on both sides.
  const sameSet = shared.length === ta.length && sharedTokens(tb, ta).length === tb.length;
  if (sameSet) return 1;

  // One name being the other's opening words is how companies extend their own
  // name: "ESDS Software" -> "ESDS Software Solution". A word inserted in the
  // middle is a different company: "Bajaj Finance" is not "Bajaj Housing
  // Finance". Both score the same by token overlap, so order decides.
  if (isPrefixSequence(ta, tb) || isPrefixSequence(tb, ta)) return 1;

  // Otherwise one short shared token is coincidence, not a match.
  if (shared.length === 1 && Math.max(...shared.map((t) => t.length)) < 4) return 0;

  // Containment ("shared / smaller set") treats an abbreviated name as equal to
  // its fuller form, which is what makes "Amtech Esters" match "amtech". But it
  // also makes "Bajaj Finance" a perfect match for "Bajaj Housing Finance" —
  // two different companies. So containment is only allowed to rescue the case
  // it exists for: a candidate reduced to a single distinctive word. Once both
  // sides carry two or more words, the extra words are meaningful and Jaccard
  // (which counts them against the match) decides.
  const smaller = Math.min(ta.length, tb.length);
  if (smaller === 1) return shared.length / smaller;
  return shared.length / (ta.length + tb.length - shared.length);
}

/**
 * A single distinctive token is enough evidence only when it is unambiguous —
 * it must identify exactly one candidate. "esds" picks out one company;
 * "bajaj" or "tata" would not, and those must never collapse together.
 */
export function uniqueTokenMatch<T>(
  target: string,
  candidates: T[],
  nameOf: (c: T) => string,
  minLength = 3
): T | null {
  const ta = nameTokens(target).filter((t) => t.length >= minLength);
  if (!ta.length) return null;

  for (const token of ta) {
    const hits = candidates.filter((c) => nameTokens(nameOf(c)).some((u) => tokensEqual(token, u)));
    if (hits.length === 1) return hits[0];
  }
  return null;
}

/**
 * 0.7, not 0.67. A two-of-three token overlap — "Bajaj Finance" inside "Bajaj
 * Housing Finance" — scores 0.667, and rejecting it by three thousandths is not
 * a margin worth trusting. Genuine matches in this data score 1.0, so the
 * higher bar costs nothing.
 */
export const MATCH_THRESHOLD = 0.7;

/** Highest-scoring candidate above the threshold, or null. */
export function bestMatch<T>(
  target: string,
  candidates: T[],
  nameOf: (c: T) => string,
  threshold = MATCH_THRESHOLD
): T | null {
  let best: { item: T; score: number } | null = null;
  for (const c of candidates) {
    const score = matchScore(target, nameOf(c));
    if (score >= threshold && (!best || score > best.score)) best = { item: c, score };
  }
  return best?.item ?? null;
}
