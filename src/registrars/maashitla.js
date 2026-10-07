import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../lib/errors.js';

// Maashitla Securities. Its public-issue page is a small React app that asks
// two endpoints, both open, neither behind a captcha:
//
//   GET {api}/company-directory      -> { companies: [{ company_slug, company_name }] }
//   GET {check}/{company_slug}?pan=X -> { name, shares_applied, shares_allotted }
//
// A PAN with no application comes back as 200 with an empty object (or 404),
// which the site itself reads as "no record" — so does this module.

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

let active = 0;
const waiters = [];
async function acquire() {
  if (active < config.maashitla.maxConcurrency) {
    active++;
    return;
  }
  await new Promise((res) => waiters.push(res));
  active++;
}
function release() {
  active--;
  waiters.shift()?.();
}

async function getJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.maashitla.timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json', Origin: 'https://maashitla.com' },
      signal: ctrl.signal,
    });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

/** The issues Maashitla currently serves allotment for. */
export async function fetchCompanies() {
  const { status, body } = await getJson(`${config.maashitla.apiBase}/company-directory`);
  if (status !== 200 || !Array.isArray(body?.companies)) {
    throw new Error(`company directory fetch failed: HTTP ${status}`);
  }
  return parseCompanies(body);
}

/** Exported for tests. */
export function parseCompanies(body) {
  return (body?.companies ?? [])
    .filter((c) => c && c.company_slug && c.company_name)
    .map((c) => ({ id: String(c.company_slug), name: String(c.company_name).replace(/\s+/g, ' ').trim() }));
}

/** Interpret one check reply. Exported for tests. */
export function interpret({ status, body }) {
  if (status === 404) return { found: false, records: [] };
  if (status === 429) throw new AppError(429, 'UPSTREAM_RATE_LIMITED', 'Maashitla is rate limiting. Try again shortly.');
  if (status !== 200) {
    throw new AppError(502, 'UPSTREAM_ERROR', 'Maashitla returned an unexpected response.', { upstreamStatus: status });
  }
  if (!body || body.name == null) return { found: false, records: [] };
  return { found: true, records: [body] };
}

export async function queryByPan({ clientId, pan }) {
  await acquire();
  try {
    let result;
    try {
      result = await getJson(`${config.maashitla.checkBase}/${encodeURIComponent(clientId)}?${new URLSearchParams({ pan })}`);
    } catch (err) {
      logger.warn('maashitla request failed', { company: clientId, reason: err.name === 'AbortError' ? 'timeout' : 'network' });
      throw new AppError(504, 'UPSTREAM_TIMEOUT', 'Maashitla did not respond in time.');
    }
    return interpret(result);
  } finally {
    release();
  }
}

const toInt = (v) => {
  const n = Number.parseInt(String(v ?? '').replace(/,/g, '').trim(), 10);
  return Number.isFinite(n) ? n : 0;
};

export function normalizeRecords(records) {
  return records.map((r) => {
    const applied = toInt(r.shares_applied);
    const allotted = toInt(r.shares_allotted);
    return {
      applicationNumber: r.application_no ?? null,
      applicantName: r.name ?? null,
      dpClientId: r.dpid_client_id ?? null,
      sharesApplied: applied,
      sharesAllotted: allotted,
      status: allotted > 0 ? (allotted < applied ? 'partially_allotted' : 'allotted') : 'not_allotted',
    };
  });
}
