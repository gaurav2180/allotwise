import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../lib/errors.js';

// Bigshare's status page posts JSON to Data.aspx/FetchIpodetails. It used to
// verify a human-solved captcha there, which is why this registrar was a deep
// link; the captcha has since been removed from the lookup (the page's own
// script now says so), and Bigshare throttles with explicit RATELIMIT /
// WARMING statuses and 429s instead. Those are honoured here rather than
// retried through.

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

export const deeplink = {
  label: 'Bigshare Services',
  get url() {
    return config.bigshare.statusPage;
  },
};

// The company list is server-rendered into <select id="ddlCompany"> on the
// public status page. Exported for the sync script and for tests.
export function parseCompanies(html) {
  const block = html.match(/<select[^>]*id="ddlCompany"[^>]*>([\s\S]*?)<\/select>/i);
  if (!block) return [];
  const out = [];
  const optRe = /<option\s+value="(\d+)"\s*>([^<]+)<\/option>/gi;
  let m;
  while ((m = optRe.exec(block[1])) !== null) {
    const id = m[1].trim();
    const name = m[2].replace(/\s+/g, ' ').trim();
    if (id !== '0' && name) out.push({ id, name });
  }
  return out;
}

// Bigshare is a small registrar; never fan a burst of checks out at it.
let active = 0;
const waiters = [];
async function acquire() {
  if (active < config.bigshare.maxConcurrency) {
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

const dataUrl = () => new URL('Data.aspx/FetchIpodetails', config.bigshare.statusPage).toString();

async function fetchOnce(companyId, pan) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.bigshare.timeoutMs);
  try {
    const res = await fetch(dataUrl(), {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/json; charset=utf-8',
        Accept: 'application/json',
        Origin: new URL(config.bigshare.statusPage).origin,
        Referer: config.bigshare.statusPage,
        'X-Requested-With': 'XMLHttpRequest',
      },
      // SelectionType "PN" is the page's "search by PAN".
      body: JSON.stringify({
        Applicationno: '',
        Company: String(companyId),
        SelectionType: 'PN',
        PanNo: pan,
        txtcsdl: '',
        txtDPID: '',
        txtClId: '',
        ddlType: '',
        lang: 'en',
      }),
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

/** Interpret one FetchIpodetails reply. Exported for tests. */
export function interpret({ status, body }) {
  if (status === 429 || status === 503) {
    throw new AppError(429, 'UPSTREAM_RATE_LIMITED', 'Bigshare is rate limiting. Try again shortly.');
  }
  const comp = body?.d;
  if (status !== 200 || !comp) {
    throw new AppError(502, 'UPSTREAM_ERROR', 'Bigshare returned an unexpected response.', { upstreamStatus: status });
  }
  if (comp.Status === 'RATELIMIT' || comp.Status === 'WARMING') {
    throw new AppError(429, 'UPSTREAM_RATE_LIMITED', comp.Message || 'Bigshare asked to wait. Try again shortly.');
  }
  if (comp.Status === 'NOTFOUND') return { found: false, records: [] };
  if (comp.Status && comp.Status !== 'OK') {
    throw new AppError(502, 'UPSTREAM_ERROR', comp.Message || 'Bigshare rejected the request.');
  }
  // One PAN can have several applications; they arrive in Records with the
  // first one also flattened onto the reply itself.
  const records = Array.isArray(comp.Records) && comp.Records.length ? comp.Records : [comp];
  const real = records.filter((r) => r && (r.Name || r.APPLICATION_NO));
  return { found: real.length > 0, records: real };
}

export async function queryByPan({ clientId, pan }) {
  await acquire();
  try {
    let result;
    try {
      result = await fetchOnce(clientId, pan);
    } catch (err) {
      logger.warn('bigshare request failed', { companyId: clientId, reason: err.name === 'AbortError' ? 'timeout' : 'network' });
      throw new AppError(504, 'UPSTREAM_TIMEOUT', 'Bigshare did not respond in time.');
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

/** Map Bigshare's field names onto Allotwise's normalized shape. */
export function normalizeRecords(records) {
  return records.map((r) => {
    const applied = toInt(r.APPLIED);
    const allotted = toInt(r.ALLOTED);
    return {
      applicationNumber: r.APPLICATION_NO || null,
      applicantName: r.Name || null,
      dpClientId: r.DPID || null,
      sharesApplied: applied,
      sharesAllotted: allotted,
      status: allotted > 0 ? (allotted < applied ? 'partially_allotted' : 'allotted') : 'not_allotted',
    };
  });
}
