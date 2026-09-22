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
    // Deep-link only: captcha is enforced on the data call. This URL is both
    // the seeding source (server-rendered company list) and the deep-link
    // target handed to users.
    statusPage: str(process.env.BIGSHARE_STATUS_PAGE, 'https://ipo.bigshareonline.com/ipo_status.html'),
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
    // WHO SUPPLIES THE ROWS. One source, and one only: it decides which IPOs
    // exist, what they are called and every published fact about them -- dates,
    // price band, lot size, issue size, minimum application, listing price,
    // logo, board. A second row source puts the same issue in the list twice
    // whenever the two name it differently ("NSE" against "National Stock
    // Exchange of India"), and nothing downstream can reconcile that.
    //
    // IPO Ji holds this job because it is the better-formed source for facts:
    // ISO dates in `<time datetime>` rather than "28-1 Sept" with a year to
    // infer, full price bands rather than a bare cap, issue size as a rupee
    // amount rather than a share count, and the prospectus application table
    // verbatim.
    calendarSource: str(process.env.GMP_CALENDAR_SOURCE, 'ipoji'),

    // WHO SUPPLIES THE PREMIUM. A separate question, and the reason this is
    // split: the source with the best facts is not the source with the best
    // grey market coverage.
    //
    // Tried in order; the first with a figure for an issue wins, whatever its
    // board. Measured over one live board, IPO Watch quoted 15 of 15 SME issues
    // and IPO Ji 2; on mainboard they tied at 11 of 25. So IPO Watch leads for
    // everything -- there is no per-board routing, which is what produced a
    // list where SME and mainboard rows were quoted by different trackers and
    // could not be compared with each other.
    //
    // These only ever fill a premium onto a row the calendar already created,
    // so the length of this list cannot affect which IPOs appear.
    sources: str(process.env.GMP_SOURCES, 'ipowatch,ipoji')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    // Max detail pages to fetch per metadata sync. Only upcoming/open IPOs need
    // fresh details, but the window has to cover all of them: an issue left
    // outside it keeps whatever it was last given, which is usually nothing,
    // and the detail page is the only source of the published minimum
    // application the estimated gain is built on. 24 covered 39 candidates,
    // which is how four open issues ended up showing a dash. At 1.2s between
    // pages, 40 is about 48s of a sync that runs hourly.
    detailFetchLimit: num(process.env.GMP_DETAIL_FETCH_LIMIT, 40),
  },

  nse: {
    apiBase: str(process.env.NSE_API_BASE, 'https://www.nseindia.com/api'),
    homepage: str(process.env.NSE_HOMEPAGE, 'https://www.nseindia.com/market-data/all-upcoming-issues-ipo'),
    timeoutMs: num(process.env.NSE_TIMEOUT_MS, 15000),
  },

  scheduler: {
    // Auto-run the sync jobs from inside the server process. Off by default so
    // `npm start` stays a pure web server; enable here or run `npm run scheduler`
    // as a separate process (the better choice at scale).
    enabled: (process.env.SCHEDULER_ENABLED ?? 'false') === 'true',
    runOnStart: (process.env.SCHEDULER_RUN_ON_START ?? 'true') === 'true',
    registrarsMs: num(process.env.SCHEDULER_REGISTRARS_MS, 60 * 60 * 1000),
    gmpMetaMs: num(process.env.SCHEDULER_GMP_MS, 30 * 60 * 1000),
    subscriptionMs: num(process.env.SCHEDULER_SUBSCRIPTION_MS, 20 * 60 * 1000),
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

// The calendar source must be exactly one, and must exist.
//
// This is the guard that used to cover GMP_SOURCES, and it moved here when the
// two were split. It was never really about premiums: what a second source
// breaks is row identity. Two trackers name the same company differently --
// "NSE" against "National Stock Exchange of India" -- and that pair shares no
// slug and no name token, so `mergeBySlug` sees two IPOs and the fuzzy matcher
// used for registrar links scores them at zero. The issue is then listed twice,
// which no deduplication downstream can fix. It shipped that way once.
//
// GMP_SOURCES is deliberately NOT guarded: those only fill a premium onto a row
// the calendar already created, so any number of them is safe.
if (!config.gmp.calendarSource) {
  throw new Error('GMP_CALENDAR_SOURCE must name exactly one source (it decides which IPOs exist).');
}
if (config.gmp.calendarSource.includes(',')) {
  throw new Error(
    `GMP_CALENDAR_SOURCE is "${config.gmp.calendarSource}", but it must name exactly one source.
  It decides which IPOs exist and what they are called. Two sources name the same
  company differently ("NSE" vs "National Stock Exchange of India") and the issue
  then appears twice, which no deduplication downstream can fix.
  To take a premium from more than one tracker, list them in GMP_SOURCES instead:
  those fill values onto rows the calendar already created and cannot duplicate one.`
  );
}

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
