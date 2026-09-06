import express from 'express';
import { allotmentRouter } from './routes/allotment.js';
import { metaRouter } from './routes/meta.js';
import { marketRouter } from './routes/market.js';
import { globalLimiter } from './lib/rateLimit.js';
import { AppError } from './lib/errors.js';
import { logger } from './lib/logger.js';

export function createApp() {
  const app = express();

  // Behind a proxy/load balancer this must be accurate or every caller shares
  // one rate-limit bucket. Set to the number of trusted hops in production.
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 0));
  app.disable('x-powered-by');

  // Express 4 parses query strings with `qs`, which carries a moderate DoS and
  // an array-limit bypass that no non-breaking upgrade currently fixes. Nothing
  // here needs qs's nested-object syntax — every parameter is a flat scalar
  // (ipo, pan, status, board, source) — so Node's own parser removes the
  // vulnerable path entirely rather than waiting on Express 5.
  app.set('query parser', 'simple');

  // No cookies, no sessions and no embedding, so these are cheap to set and
  // there is nothing they can break. CSP is deliberately strict: this origin
  // serves JSON only — it has no HTML, scripts or styles of its own.
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), interest-cohort=()');
    res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    // Only meaningful over TLS, and asserting it on plain http in development
    // would pin a browser to https://localhost.
    if (req.secure) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  // Query strings carry PANs, so the default request logger is not safe here.
  // Route handlers log deliberately, with hashes instead of values.
  app.use(globalLimiter);
  app.use(metaRouter);
  app.use(marketRouter);
  app.use(allotmentRouter);

  app.use((req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err instanceof AppError) {
      if (err.status >= 500) logger.error('request failed', { code: err.code, status: err.status });
      return res.status(err.status).json({
        error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
      });
    }
    logger.error('unhandled error', { name: err?.name, message: err?.message });
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error.' } });
  });

  return app;
}
