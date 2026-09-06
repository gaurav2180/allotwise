// Match the same IPO across sources whose names disagree, e.g. the registrar's
// "COMPLETE SPORTS AND MANAGEMENT INDIA LIMITED" vs IPO Watch's
// "Complete Sports & Management". Exact slugs miss these; token-set containment
// catches them without the false positives a substring match would produce.

// Corporate-form and filler words that carry no identifying weight. "india" is
// kept -- it is often the distinguishing token (e.g. "... (India) Ltd").
const STOP = new Set([
  'limited', 'ltd', 'private', 'pvt', 'ipo', 'sme', 'the', 'and', 'of', 'co',
  'company', 'corporation', 'corp', 'inc', 'llp',
]);

export function nameTokens(name) {
  return [
    ...new Set(
      String(name || '')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/\(([^)]*)\)/g, ' $1 ')
        .replace(/[^a-z0-9]+/g, ' ')
        .split(' ')
        .filter((t) => t && !STOP.has(t))
    ),
  ];
}

/**
 * Similarity in [0,1] between two IPO names. Uses token-set containment
 * (overlap / smaller set) so an abbreviated name still matches its fuller form,
 * with Jaccard as a tie-breaking floor.
 */
export function matchScore(a, b) {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const setB = new Set(tb);
  const shared = ta.filter((t) => setB.has(t));
  if (shared.length === 0) return 0;

  // A single shared token only counts if it is distinctive (length >= 4), so
  // "Annu Projects" and "Skyline Projects" do not collapse onto each other.
  const longestShared = Math.max(...shared.map((t) => t.length));
  if (shared.length === 1 && longestShared < 4) return 0;

  const containment = shared.length / Math.min(ta.length, tb.length);
  const union = new Set([...ta, ...tb]).size;
  const jaccard = shared.length / union;
  return Math.max(containment, jaccard);
}

const DEFAULT_THRESHOLD = 0.67;

/**
 * Best candidate for `target` from `candidates` (each `{ slug, name }`).
 * Returns { slug, name, score } or null when nothing clears the threshold.
 */
export function bestMatch(target, candidates, { threshold = DEFAULT_THRESHOLD } = {}) {
  let best = null;
  for (const c of candidates) {
    const score = matchScore(target, c.name);
    if (score >= threshold && (!best || score > best.score)) {
      best = { slug: c.slug, name: c.name, score: Number(score.toFixed(3)) };
    }
  }
  return best;
}
