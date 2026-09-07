import { timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

// Who the caller actually is, for rate-limit purposes.
//
// `X-Forwarded-For` is a claim by whoever connected, not a fact. Trusting it by
// hop count (`trust proxy: 1`) is right only while every request arrives through
// our own proxy -- the moment the service is reachable directly, any caller can
// assert a different address on each request and walk straight through the
// per-IP budgets. Those budgets are the control that stops a bulk PAN crawl, so
// they must not rest on the deployment topology staying as intended.
//
// So the header is honoured only when the caller proves it is the frontend, by
// presenting the shared secret both services are given. Anything else is keyed
// on the socket address, which cannot be forged. With no secret configured
// (local development, and any deployment that has not adopted it) the old
// hop-count behaviour is left exactly as it was.

const PROXY_HEADER = 'x-allotwise-proxy';

function secretMatches(presented) {
  if (typeof presented !== 'string' || !config.proxySecret) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(config.proxySecret);
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length; compare lengths first and always run the constant-time compare.
  return a.length === b.length && timingSafeEqual(a, b);
}

/** True when this request came from our own frontend proxy. */
export function isTrustedProxy(req) {
  return secretMatches(req.get(PROXY_HEADER));
}

/**
 * Client address to bill this request to.
 *
 * The leftmost `X-Forwarded-For` entry is the original client; later entries are
 * the proxies it passed through.
 */
export function clientIp(req) {
  if (isTrustedProxy(req)) {
    const forwarded = req.get('x-forwarded-for');
    if (forwarded) {
      const first = forwarded.split(',')[0].trim();
      if (first) return first;
    }
  }
  return req.ip;
}

export const PROXY_SECRET_HEADER = PROXY_HEADER;
