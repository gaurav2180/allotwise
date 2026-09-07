import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { ipKey } from './ipKey.js';
import { clientIp } from './clientIp.js';
import { AppError } from './errors.js';

const handler = (req, res, next) =>
  next(new AppError(429, 'RATE_LIMITED', 'Too many requests. Please slow down.'));

// express-rate-limit keys on req.ip by default. Every limiter here goes through
// clientIp instead, so a forwarded address counts only when the caller proved it
// is our frontend -- otherwise the budgets belong to whoever opened the socket.
const base = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
  keyGenerator: (req) => ipKey(clientIp(req)),
};

export const globalLimiter = rateLimit({
  ...base,
  windowMs: config.rateLimit.globalWindowMs,
  limit: config.rateLimit.globalMax,
});

export const allotmentIpLimiter = rateLimit({
  ...base,
  windowMs: config.rateLimit.allotmentWindowMs,
  limit: config.rateLimit.allotmentMax,
});

// Caps how often any single PAN can be queried across all callers, which is
// what stops a distributed crawl from concentrating on one person.
export const panLimiter = rateLimit({
  ...base,
  windowMs: config.rateLimit.panWindowMs,
  limit: config.rateLimit.panMax,
  keyGenerator: (req) => `pan:${req.panHash}`,
  skip: (req) => !req.panHash,
});

// The important control. The endpoint returns a person's NAME for any PAN, so
// an unthrottled caller could walk the PAN space and build a PAN -> name
// directory. Volume limits alone do not stop that -- what matters is how many
// DISTINCT PANs one caller may ask about. A real user checks a handful.
const seen = new Map();

function sweep(now) {
  for (const [key, entry] of seen) {
    if (entry.resetAt <= now) seen.delete(key);
  }
}

export function distinctPanGuard(req, _res, next) {
  if (!req.panHash) return next();
  const now = Date.now();
  if (seen.size > 50_000) sweep(now);

  const key = ipKey(clientIp(req));
  let entry = seen.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { pans: new Set(), resetAt: now + config.rateLimit.distinctPanWindowMs };
    seen.set(key, entry);
  }

  if (!entry.pans.has(req.panHash) && entry.pans.size >= config.rateLimit.distinctPanMax) {
    return next(
      new AppError(
        429,
        'DISTINCT_PAN_LIMIT',
        'Too many different PANs queried from this client. Try again later.'
      )
    );
  }

  entry.pans.add(req.panHash);
  return next();
}

export function rateLimitStats() {
  return { distinctPanClients: seen.size };
}
