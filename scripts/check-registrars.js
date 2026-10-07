#!/usr/bin/env node
// Proactive health check, run on a schedule.
//
//   1. Self-test: ask every registrar we query about a PAN that cannot exist,
//      against its newest issue. A healthy registrar answers "no record"; a
//      changed endpoint, a new User-Agent rule or a dead host answers with an
//      error instead. That is how KFintech broke -- its list sync returned
//      nothing for days and the only symptom was missing buttons.
//   2. Coverage: which issues with allotment out are still on the registrar's
//      own site, and why -- "not in registrar list" resolves by itself or
//      points at a matching bug; "registrar not supported" needs new code.
//
// Results go to sync_runs (shown on /health) and to the log, where a failure is
// an error line so a log alert can key on "registrar self-test failing".

import { listIpos, findIpoBySlug, recordSyncRun } from '../src/db/index.js';
import { getRegistrar, supportedRegistrars } from '../src/registrars/index.js';
import { coverage, registrarHealth, gapIncidents } from '../src/lib/coverage.js';
import { reportIncidents } from '../src/lib/alerts.js';
import { logger } from '../src/lib/logger.js';

// Well-formed and matching nobody. Not the obvious "AAAAA0000A": registrars
// hold that exact value as a placeholder on real applicants' records (MUFG
// returns one person's name and demat account for it), so it is not "no
// record" and it should never be put in a request just to see what comes back.
const DUMMY_PAN = 'ZZZZZ9999Z';

async function selfTest(name) {
  const [newest] = listIpos({ registrar: name, limit: 1 });
  const ref = newest ? findIpoBySlug(newest.slug)?.registrar_ref : null;
  if (!ref) {
    // Nothing to ask about is itself a finding: the list sync found no issues.
    return { ok: false, error: 'no issues in the registrar list to test against' };
  }
  try {
    const { client } = getRegistrar(name);
    const { found } = await client.queryByPan({ clientId: ref, pan: DUMMY_PAN });
    return { ok: true, note: found ? 'answered with a record' : 'answered "no record"' };
  } catch (err) {
    // The registrar telling us to slow down means it is up and answering.
    if (err.code === 'UPSTREAM_RATE_LIMITED') return { ok: true, note: 'rate limited (reachable)' };
    return { ok: false, error: `${err.code ?? err.name}: ${err.message}` };
  }
}

async function main() {
  const failing = [];
  for (const { name, mode } of supportedRegistrars) {
    if (mode !== 'api') continue;
    const r = await selfTest(name);
    recordSyncRun({ registrar: `canary:${name}`, source: 'self-test', ok: r.ok, error: r.ok ? null : r.error });
    if (r.ok) {
      logger.info('registrar self-test ok', { registrar: name, note: r.note });
    } else {
      failing.push(name);
      // alert:false -- the incident report below says it once, and says when it clears.
      logger.error('registrar self-test failing', { registrar: name, error: r.error, alert: false });
    }
  }

  const c = coverage();
  const logFn = c.byReason['not-in-registrar-list'] || c.byReason['registrar-not-supported'] ? logger.warn : logger.info;
  logFn.call(logger, 'allotment coverage', {
    allotmentOut: c.allotmentOut,
    inApp: c.inApp,
    onRegistrarSite: c.linkOut,
    byReason: c.byReason,
    byRegistrar: c.byRegistrar,
  });
  // Name the issues behind the numbers, so the log says what to look at.
  for (const i of c.issues.filter((x) => x.reason === 'not-in-registrar-list')) {
    logger.warn('issue missing from its registrar list', { issue: i.name, registrar: i.registrar, allotmentDate: i.allotmentDate });
  }

  // Tell Telegram what is newly wrong and what has cleared since last time.
  const { incidents } = registrarHealth();
  for (const [k, v] of gapIncidents(c)) incidents.set(k, v);
  const report = await reportIncidents(incidents);
  if (report.sent) logger.info('alert sent', { new: report.added, resolved: report.cleared });

  if (failing.length) process.exitCode = 1;
}

main().catch((err) => {
  logger.error('registrar check failed', { message: err.message });
  process.exitCode = 1;
});
