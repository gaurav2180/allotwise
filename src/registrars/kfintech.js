import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../lib/errors.js';

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

// Small semaphore so a burst of user requests cannot fan out into a burst
// against KFintech. Their own frontend backs off on 429, so they do throttle.
let active = 0;
const waiters = [];

async function acquire() {
  if (active < config.kfintech.maxConcurrency) {
    active++;
    return;
  }
  await new Promise((res) => waiters.push(res));
  active++;
}

function release() {
  active--;
  const next = waiters.shift();
  if (next) next();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchOnce(clientId, pan) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.kfintech.timeoutMs);
  try {
    const res = await fetch(`${config.kfintech.apiBase}?type=pan`, {
      method: 'GET',
      headers: {
        // reqparam carries the PAN. Never log this object.
        reqparam: pan,
        client_id: String(clientId),
        accept: 'application/json',
      },
      signal: ctrl.signal,
    });
    const text = await res.text();
    let body;
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

/**
 * Query KFintech for one PAN against one IPO's client_id.
 * Returns { found, records } -- never throws for "no application found".
 */
export async function queryByPan({ clientId, pan }) {
  await acquire();
  try {
    let lastStatus = 0;
    for (let attempt = 0; attempt <= config.kfintech.maxRetries; attempt++) {
      let result;
      try {
        result = await fetchOnce(clientId, pan);
      } catch (err) {
        // Network error or timeout -- retryable.
        lastStatus = 0;
        logger.warn('kfintech request failed', {
          attempt,
          clientId,
          reason: err.name === 'AbortError' ? 'timeout' : 'network',
        });
        if (attempt === config.kfintech.maxRetries) {
          throw new AppError(504, 'UPSTREAM_TIMEOUT', 'Registrar did not respond in time.');
        }
        await sleep(2 ** attempt * 300);
        continue;
      }

      const { status, body } = result;
      lastStatus = status;

      if (status === 200 && body && Array.isArray(body.data)) {
        return { found: body.data.length > 0, records: body.data };
      }

      // Registrar returns 404 with {"error":"Record Not Found"} when the PAN
      // has no application in this IPO. That is a valid answer, not a failure.
      if (status === 404) return { found: false, records: [] };

      if (RETRYABLE.has(status) && attempt < config.kfintech.maxRetries) {
        logger.warn('kfintech retryable status', { attempt, status, clientId });
        await sleep(2 ** attempt * 300 + Math.floor(Math.random() * 200));
        continue;
      }

      break;
    }

    if (lastStatus === 429) {
      throw new AppError(429, 'UPSTREAM_RATE_LIMITED', 'Registrar is rate limiting. Try again shortly.');
    }
    // A bad client_id surfaces as a 500 from the registrar, which usually means
    // our mapping row is stale rather than that the registrar is broken.
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

/** Map KFintech's raw field names onto Allotwise's normalized shape. */
export function normalizeRecords(records) {
  return records.map((r) => {
    const applied = toInt(r.App_Shares);
    const allotted = toInt(r.All_Shares);
    return {
      applicationNumber: r.Appln_No ?? null,
      applicantName: r.Name ?? null,
      dpClientId: r.DP_CLID ?? null,
      sharesApplied: applied,
      sharesAllotted: allotted,
      status: allotted > 0 ? (allotted < applied ? 'partially_allotted' : 'allotted') : 'not_allotted',
    };
  });
}
