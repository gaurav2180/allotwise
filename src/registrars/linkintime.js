import { createCipheriv } from 'node:crypto';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../lib/errors.js';

// Link Intime is now MUFG Intime. Its status page is ASP.NET WebForms with an
// image captcha, but the captcha is dead code -- the client-side validation is
// commented out and the server does not check the token that nominally gates
// the data call (verified: a garbage token still returns real data; only an
// absent field errors). So this is a queryable API, not a captcha wall.
//
// We still perform the real token handshake (generateToken -> AES -> echo) so
// that if MUFG ever re-enables server-side validation, this keeps working
// without a code change. If they additionally re-enable the captcha, the route
// falls back to the deep link -- see registrars/index.js.

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

// Fixed key+iv shipped to every browser in the page's encVal(). Reproducing it
// is not a bypass of anything -- it is the same value every client uses.
const TOKEN_KEY = Buffer.from('8080808080808080', 'utf8');

function encVal(plain) {
  const c = createCipheriv('aes-128-cbc', TOKEN_KEY, TOKEN_KEY);
  return Buffer.concat([c.update(String(plain), 'utf8'), c.final()]).toString('base64');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let active = 0;
const waiters = [];
async function acquire() {
  if (active < config.linkintime.maxConcurrency) return void active++;
  await new Promise((res) => waiters.push(res));
  active++;
}
function release() {
  active--;
  waiters.shift()?.();
}

async function postJson(path, body, { timeoutMs } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs ?? config.linkintime.timeoutMs);
  try {
    const res = await fetch(`${config.linkintime.apiBase}/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: `${config.linkintime.apiBase}/public-issues.html`,
        Accept: 'application/json, text/javascript, */*; q=0.01',
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: res.status, d: json?.d };
  } finally {
    clearTimeout(timer);
  }
}

// MUFG returns a DataSet serialized as XML inside the JSON "d" field. The rows
// are flat <Table> elements, so a dependency-free extractor is enough.
// Exported for tests.
export function parseTables(xml) {
  if (typeof xml !== 'string') return [];
  const rows = [];
  const tableRe = /<Table>([\s\S]*?)<\/Table>/g;
  let m;
  while ((m = tableRe.exec(xml)) !== null) {
    const fields = {};
    const fieldRe = /<([A-Za-z0-9_]+)>([\s\S]*?)<\/\1>/g;
    let f;
    while ((f = fieldRe.exec(m[1])) !== null) fields[f[1]] = f[2].trim();
    rows.push(fields);
  }
  return rows;
}

async function getToken() {
  const res = await postJson('IPO.aspx/generateToken', {});
  if (res.status !== 200 || res.d == null) return null;
  return encVal(res.d);
}

/** Query MUFG for one PAN against one company_id. Mirrors kfintech.queryByPan. */
export async function queryByPan({ clientId, pan }) {
  await acquire();
  try {
    let lastStatus = 0;
    for (let attempt = 0; attempt <= config.linkintime.maxRetries; attempt++) {
      try {
        const token = (await getToken()) ?? '';
        const res = await postJson('IPO.aspx/SearchOnPan', {
          clientid: String(clientId),
          PAN: pan,
          IFSC: '',
          CHKVAL: '1', // 1 = PAN mode
          token,
        });
        lastStatus = res.status;

        if (res.status === 200) {
          const rows = parseTables(res.d);
          // An empty <NewDataSet /> means the PAN has no application here.
          return { found: rows.length > 0, records: rows };
        }

        if (RETRYABLE.has(res.status) && attempt < config.linkintime.maxRetries) {
          logger.warn('linkintime retryable status', { attempt, status: res.status, clientId });
          await sleep(2 ** attempt * 300 + Math.floor(Math.random() * 200));
          continue;
        }
        break;
      } catch (err) {
        lastStatus = 0;
        logger.warn('linkintime request failed', {
          attempt,
          clientId,
          reason: err.name === 'AbortError' ? 'timeout' : 'network',
        });
        if (attempt === config.linkintime.maxRetries) {
          throw new AppError(504, 'UPSTREAM_TIMEOUT', 'Registrar did not respond in time.');
        }
        await sleep(2 ** attempt * 300);
      }
    }

    if (lastStatus === 429) {
      throw new AppError(429, 'UPSTREAM_RATE_LIMITED', 'Registrar is rate limiting. Try again shortly.');
    }
    throw new AppError(502, 'UPSTREAM_ERROR', 'Registrar returned an unexpected response.', {
      upstreamStatus: lastStatus,
    });
  } finally {
    release();
  }
}

const toInt = (v) => {
  const n = Number.parseInt(String(v ?? '').trim(), 10);
  return Number.isFinite(n) ? n : 0;
};

/** Map MUFG's field names onto the same normalized shape kfintech uses. */
export function normalizeRecords(records) {
  return records.map((r) => {
    const applied = toInt(r.SHARES);
    const allotted = toInt(r.ALLOT);
    return {
      applicationNumber: r.APPLNO ?? r.APPNO ?? null, // absent in PAN mode
      applicantName: r.NAME1 ?? null,
      dpClientId: r.DPCLITID ?? null,
      sharesApplied: applied,
      sharesAllotted: allotted,
      status: allotted > 0 ? (allotted < applied ? 'partially_allotted' : 'allotted') : 'not_allotted',
    };
  });
}
