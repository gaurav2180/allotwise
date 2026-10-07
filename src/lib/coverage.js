import { listMarketIpos, registrarSlugForMarket, latestSyncRuns } from '../db/index.js';
import { mergeBySlug } from '../gmp/index.js';
import { supportedRegistrars } from '../registrars/index.js';

// Which of our registrar modules a registrar's published name belongs to.
// The names come from the market source ("Kfin Technologies Ltd.", "MUFG Intime
// India Pvt.Ltd."), the module ids from src/registrars/.
const PATTERNS = [
  ['kfintech', /kfin/i],
  ['linkintime', /mufg|link\s*intime/i],
  ['bigshare', /bigshare/i],
  ['maashitla', /maashitla/i],
];

/** The in-app registrar a published name maps to, or null if we cannot query it. */
export function registrarModuleFor(name) {
  return PATTERNS.find(([, re]) => re.test(String(name ?? '')))?.[0] ?? null;
}

/**
 * Why an issue whose allotment is out is not checkable in-app.
 *   "not-in-registrar-list" -- we can query this registrar, but it has not
 *       published the issue yet (or it is named so differently that matching
 *       failed). Resolves by itself, or is a matcher bug worth looking at.
 *   "registrar-not-supported" -- a registrar we have no way to query.
 */
export function linkOutReason(registrarName) {
  return registrarModuleFor(registrarName) ? 'not-in-registrar-list' : 'registrar-not-supported';
}

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Every issue whose allotment date has arrived, and how each can be checked. */
export function coverage({ today = todayIso() } = {}) {
  const due = mergeBySlug(listMarketIpos()).filter((i) => i.allotmentDate && i.allotmentDate <= today);

  const linkOut = [];
  let inApp = 0;
  for (const i of due) {
    if (registrarSlugForMarket(i.slug)) {
      inApp++;
      continue;
    }
    linkOut.push({
      name: i.name,
      registrar: i.registrarName ?? null,
      reason: linkOutReason(i.registrarName),
      allotmentDate: i.allotmentDate,
    });
  }

  const byReason = {};
  const byRegistrar = {};
  for (const l of linkOut) {
    byReason[l.reason] = (byReason[l.reason] ?? 0) + 1;
    const key = l.registrar ?? 'unknown';
    byRegistrar[key] = (byRegistrar[key] ?? 0) + 1;
  }
  return { allotmentOut: due.length, inApp, linkOut: linkOut.length, byReason, byRegistrar, issues: linkOut };
}

// A list sync that has not succeeded for this long is stale: the hourly chain
// would have had three goes at it.
export const STALE_AFTER_MINUTES = 180;

/** The state of every registrar's list sync and self-test, and whether anything is off. */
export function registrarHealth() {
  const runs = new Map(latestSyncRuns().map((r) => [r.registrar, r]));
  const out = {};
  const problems = [];
  // The same problems with stable keys, for alerting: the text of a problem
  // changes (minutes, error messages) while its identity does not.
  const incidents = new Map();

  for (const { name, mode } of supportedRegistrars) {
    if (mode !== 'api') continue;
    const list = runs.get(name);
    const canary = runs.get(`canary:${name}`);

    const listStale = !list || list.lastOkMinutes == null || list.lastOkMinutes > STALE_AFTER_MINUTES;
    // A self-test not yet run is not a failure; one that last ran and failed is.
    const canaryFailing = Boolean(canary && !canary.ok);

    out[name] = {
      list: list ? { ok: Boolean(list.ok), companies: list.seen, lastOkMinutesAgo: list.lastOkMinutes } : null,
      selfTest: canary ? { ok: Boolean(canary.ok), minutesAgo: canary.ageMinutes, error: canary.ok ? null : canary.error } : null,
    };
    if (listStale) {
      const text = `${name}: company list has not synced successfully in ${STALE_AFTER_MINUTES}+ minutes`;
      problems.push(text);
      incidents.set(`list:${name}`, text);
    }
    if (canaryFailing) {
      const text = `${name}: self-test failing (${canary.error})`;
      problems.push(text);
      incidents.set(`selftest:${name}`, text);
    }
  }
  return { registrars: out, problems, incidents };
}

// An issue is only worth an alert once its allotment is a day old, so the
// registrar has had time to publish it, and only for a week after, so history
// the registrar has long dropped does not alert forever.
const GAP_MIN_DAYS = 1;
const GAP_MAX_DAYS = 7;

/** Issues stuck on a registrar's site that we should be able to check, as incidents. */
export function gapIncidents(report = coverage(), now = new Date()) {
  const out = new Map();
  for (const i of report.issues) {
    if (i.reason !== 'not-in-registrar-list') continue;
    const days = (now - new Date(`${i.allotmentDate}T00:00:00Z`)) / 86_400_000;
    if (days < GAP_MIN_DAYS || days > GAP_MAX_DAYS) continue;
    out.set(`gap:${i.name}`, `${i.name} is not checkable in-app: ${i.registrar} has not listed it (allotment ${i.allotmentDate})`);
  }
  return out;
}
