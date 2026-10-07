import 'dotenv/config';

const num = (v, d) => (v === undefined || v === '' ? d : Number(v));
const str = (v, d) => (v === undefined || v === '' ? d : v);

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  isProd,
  port: num(process.env.PORT, 3000),
  dbPath: str(process.env.DB_PATH, './data/allotwise.db'),

  panHashSecret: str(process.env.PAN_HASH_SECRET, isProd ? undefined : 'dev-insecure-secret'),

  // Shared with the frontend so the backend can tell its own proxy from a direct
  // caller, and only believe X-Forwarded-For from the former. Optional: unset,
  // the older `trust proxy` hop count applies unchanged. See lib/clientIp.js.
  proxySecret: str(process.env.PROXY_SHARED_SECRET, undefined),

  kfintech: {
    apiBase: str(
      process.env.KFINTECH_API_BASE,
      'https://0uz601ms56.execute-api.ap-south-1.amazonaws.com/prod/api/query'
    ),
    bundleIndex: str(process.env.KFINTECH_BUNDLE_INDEX, 'https://ipostatus.kfintech.com/'),
    timeoutMs: num(process.env.KFINTECH_TIMEOUT_MS, 8000),
    maxRetries: num(process.env.KFINTECH_MAX_RETRIES, 3),
    maxConcurrency: num(process.env.KFINTECH_MAX_CONCURRENCY, 4),
  },

  linkintime: {
    apiBase: str(process.env.LINKINTIME_API_BASE, 'https://in.mpms.mufg.com/Initial_Offer'),
    timeoutMs: num(process.env.LINKINTIME_TIMEOUT_MS, 8000),
    maxRetries: num(process.env.LINKINTIME_MAX_RETRIES, 3),
    maxConcurrency: num(process.env.LINKINTIME_MAX_CONCURRENCY, 4),
  },

  bigshare: {
    // Both the seeding source (server-rendered company list) and the base the
    // FetchIpodetails lookup is resolved against.
    statusPage: str(process.env.BIGSHARE_STATUS_PAGE, 'https://ipo.bigshareonline.com/ipo_status.html'),
    timeoutMs: num(process.env.BIGSHARE_TIMEOUT_MS, 10000),
    maxConcurrency: num(process.env.BIGSHARE_MAX_CONCURRENCY, 2),
  },

  maashitla: {
    apiBase: str(process.env.MAASHITLA_API_BASE, 'https://api.maashitla.com/api'),
    checkBase: str(process.env.MAASHITLA_CHECK_BASE, 'https://pnjbvxj6md.execute-api.ap-south-1.amazonaws.com/prod/check'),
    timeoutMs: num(process.env.MAASHITLA_TIMEOUT_MS, 10000),
    maxConcurrency: num(process.env.MAASHITLA_MAX_CONCURRENCY, 2),
  },

  gmp: {
    // GMP sources are public web pages, not APIs. robots.txt allows `/` and the
    // content-signal permits reference use, but the sites sit behind Cloudflare,
    // which serves empty bodies to non-browser user agents. So we present a
    // realistic browser UA to get past that blunt default filter, and stay a
    // good citizen the ways that actually matter: fetch infrequently (GMP moves
    // a few times a day, not in real time), cache hard, and attribute.
    userAgent: str(
      process.env.GMP_USER_AGENT,
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
    ),
    timeoutMs: num(process.env.GMP_TIMEOUT_MS, 20000),
    // Max issue pages fetched per metadata sync (price band, exchanges, logo).
    // At 1.2s between pages, 40 is about 48s of a sync that runs hourly.
    detailFetchLimit: num(process.env.GMP_DETAIL_FETCH_LIMIT, 40),
  },

  scheduler: {
    // Auto-run the sync jobs from inside the server process. Off by default so
    // `npm start` stays a pure web server; enable here or run `npm run scheduler`
    // as a separate process (the better choice at scale).
    enabled: (process.env.SCHEDULER_ENABLED ?? 'false') === 'true',
    runOnStart: (process.env.SCHEDULER_RUN_ON_START ?? 'true') === 'true',
    registrarsMs: num(process.env.SCHEDULER_REGISTRARS_MS, 60 * 60 * 1000),
    gmpMetaMs: num(process.env.SCHEDULER_GMP_MS, 30 * 60 * 1000),
  },

  cache: {
    ttlFinalized: num(process.env.CACHE_TTL_FINALIZED, 604800),
    ttlPending: num(process.env.CACHE_TTL_PENDING, 120),
    ttlNotFound: num(process.env.CACHE_TTL_NOT_FOUND, 300),
    maxEntries: num(process.env.CACHE_MAX_ENTRIES, 20000),
  },

  rateLimit: {
    globalWindowMs: num(process.env.RL_GLOBAL_WINDOW_MS, 15 * 60 * 1000),
    globalMax: num(process.env.RL_GLOBAL_MAX, 200),
    allotmentWindowMs: num(process.env.RL_ALLOTMENT_WINDOW_MS, 15 * 60 * 1000),
    allotmentMax: num(process.env.RL_ALLOTMENT_MAX, 20),
    panWindowMs: num(process.env.RL_PAN_WINDOW_MS, 60 * 60 * 1000),
    panMax: num(process.env.RL_PAN_MAX, 30),
    distinctPanWindowMs: num(process.env.RL_DISTINCT_PAN_WINDOW_MS, 60 * 60 * 1000),
    distinctPanMax: num(process.env.RL_DISTINCT_PAN_MAX, 10),
  },
};

if (isProd && !config.panHashSecret) {
  // Say what the process can actually see. "Must be set" is true but useless
  // when it *was* set — on another service, in another environment, or after
  // the deploy that is running. Names only: never log a secret's value.
  // App variables only: the platform's own RAILWAY_*/NODE_ENV/PORT are always
  // present and drown out the answer.
  const appVars = Object.keys(process.env)
    .filter((k) => /^(PAN_|DB_PATH|TRUST_PROXY|SCHEDULER_|KFINTECH_|LINKINTIME_|BIGSHARE_|GMP_|NSE_|CACHE_|RL_)/.test(k))
    .sort();

  // Naming the service and environment removes the guesswork about *where* the
  // variable needs to go. Neither is a secret; both are set by the platform.
  const where = [
    process.env.RAILWAY_SERVICE_NAME && `service "${process.env.RAILWAY_SERVICE_NAME}"`,
    process.env.RAILWAY_ENVIRONMENT_NAME && `environment "${process.env.RAILWAY_ENVIRONMENT_NAME}"`,
  ]
    .filter(Boolean)
    .join(', ');

  throw new Error(
    'PAN_HASH_SECRET must be set in production.\n' +
      (where ? `  This process is running in ${where}.\n` : '') +
      `  App variables it can see: ${appVars.length ? appVars.join(', ') : '(none — no app variables reached this service)'}\n` +
      '  Set PAN_HASH_SECRET on exactly that service and environment. Variables set on a\n' +
      '  different service, or in a different environment, are not visible here.'
  );
}
