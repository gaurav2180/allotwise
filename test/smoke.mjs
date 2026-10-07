// Smoke tests. Offline by default so CI never depends on the registrar being
// up; set ALLOTWISE_LIVE=1 to include the two tests that call KFintech.
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { createApp } from '../src/app.js';
import { slugify, parsePan, parseSlug } from '../src/lib/validate.js';
import { maskPan, logger } from '../src/lib/logger.js';
import { ipKey } from '../src/lib/ipKey.js';
import { clientIp, isTrustedProxy } from '../src/lib/clientIp.js';
import { config } from '../src/config.js';
import { cacheGet, cacheSet, cacheClear } from '../src/lib/cache.js';
import { normalizeRecords } from '../src/registrars/kfintech.js';
import { normalizeRecords as normalizeLinkintime, parseTables } from '../src/registrars/linkintime.js';
import {
  parseCompanies,
  interpret as bigshareInterpret,
  normalizeRecords as normalizeBigshare,
} from '../src/registrars/bigshare.js';
import {
  parseCompanies as parseMaashitla,
  interpret as maashitlaInterpret,
  normalizeRecords as normalizeMaashitla,
} from '../src/registrars/maashitla.js';
import { getRegistrar, supportedRegistrars } from '../src/registrars/index.js';
import { parseDateRange, normalizeStatus, parseRupees, parseEstListing } from '../src/lib/marketDates.js';
import {
  parse as parseInvestorGain,
  parseHistory as parseIgHistory,
  parseIssuePage as parseIgIssuePage,
  dayMonth,
  decodeCfEmail,
} from '../src/gmp/investorgain.js';
import { mergeBySlug } from '../src/gmp/index.js';
import { nameTokens, matchScore, bestMatch } from '../src/lib/ipoMatch.js';

const REF = new Date('2026-09-04T00:00:00Z');

const LIVE = process.env.ALLOTWISE_LIVE === '1';
const REAL_PAN = process.env.ALLOTWISE_TEST_PAN;
const REAL_IPO = process.env.ALLOTWISE_TEST_IPO ?? 'tempsens-instruments-india';

let server;
let base;
test.before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server?.close());

const get = (path) => fetch(`${base}${path}`).then(async (r) => ({ status: r.status, body: await r.json() }));

// The allotment check is a POST: a PAN must not travel in a URL, where proxies
// and hosts log it verbatim.
const postAllotment = (body) =>
  fetch(`${base}/allotment`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

test('PAN validation accepts the registrar shape and rejects others', () => {
  assert.equal(parsePan('aaaaa1234a'), 'AAAAA1234A');
  for (const bad of ['', 'NOTAPAN', 'AAAAA1234', 'AAAAA12341', '12345678AB']) {
    assert.throws(() => parsePan(bad), /pan/i);
  }
});

test('slug validation rejects injection-ish input', () => {
  assert.equal(parseSlug('Tempsens-Instruments'), 'tempsens-instruments');
  assert.throws(() => parseSlug("foo' OR 1=1--"));
  assert.throws(() => parseSlug('../../etc/passwd'));
});

test('slugify strips company suffixes and punctuation', () => {
  assert.equal(slugify('TEMPSENS INSTRUMENTS (INDIA) LIMITED'), 'tempsens-instruments-india');
  assert.equal(slugify('ADON AGRO COMMODITIES LIMITED SME IPO'), 'adon-agro-commodities-sme-ipo');
});

test('PAN masking keeps only non-identifying edges', () => {
  assert.equal(maskPan('AAAAA1234A'), 'AAAA****4A');
  assert.equal(maskPan('short'), '[REDACTED]');
});

test('logger scrubs PANs even when a caller passes one by mistake', () => {
  const written = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => (written.push(String(chunk)), true);
  try {
    logger.info('lookup for AAAAA1234A', { pan: 'AAAAA1234A', nested: { note: 'ABCDE1234F applied' } });
  } finally {
    process.stdout.write = orig;
  }
  const out = written.join('');
  assert.ok(!out.includes('AAAAA1234A'), 'PAN leaked in message');
  assert.ok(!out.includes('ABCDE1234F'), 'PAN leaked in nested value');
  assert.ok(out.includes('[PAN_REDACTED]'));
});

test('ipKey collapses IPv6 to a /64 so address rotation cannot reset budgets', () => {
  assert.equal(ipKey('203.0.113.7'), '203.0.113.7');
  assert.equal(ipKey('::ffff:203.0.113.7'), '203.0.113.7');
  assert.equal(ipKey('2001:db8:1:2:3:4:5:6'), '2001:db8:1:2::/64');
  assert.equal(ipKey('2001:db8:1:2::a'), '2001:db8:1:2::/64');
  // Same /64, different hosts -> same bucket.
  assert.equal(ipKey('2001:db8:1:2::a'), ipKey('2001:db8:1:2::ffff'));
});

test('cache honours TTL', () => {
  cacheClear();
  cacheSet('k', { v: 1 }, 60);
  assert.deepEqual(cacheGet('k'), { v: 1 });
  cacheSet('expired', { v: 2 }, -1);
  assert.equal(cacheGet('expired'), undefined);
});

test('normalizeRecords maps registrar fields and derives status', () => {
  const [full] = normalizeRecords([{ All_Shares: '50', App_Shares: '50', Appln_No: 'X', Name: 'N', DP_CLID: 'D' }]);
  assert.equal(full.status, 'allotted');
  assert.equal(full.sharesAllotted, 50);
  const [partial] = normalizeRecords([{ All_Shares: '20', App_Shares: '50' }]);
  assert.equal(partial.status, 'partially_allotted');
  const [none] = normalizeRecords([{ All_Shares: '0', App_Shares: '50' }]);
  assert.equal(none.status, 'not_allotted');
  const [junk] = normalizeRecords([{ All_Shares: '', App_Shares: null }]);
  assert.equal(junk.sharesApplied, 0);
});

test('linkintime parseTables reads flat DataSet rows and handles empty results', () => {
  const xml =
    '<NewDataSet>\r\n  <Table>\r\n    <id>11927</id>\r\n    <NAME1>GAURAV YOGESH SONAWANE</NAME1>' +
    '\r\n    <DPCLITID>1208870218125953</DPCLITID>\r\n    <ALLOT>0</ALLOT>\r\n    <SHARES>34</SHARES>' +
    '\r\n  </Table>\r\n</NewDataSet>';
  const rows = parseTables(xml);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].NAME1, 'GAURAV YOGESH SONAWANE');
  assert.equal(rows[0].SHARES, '34');
  // A PAN with no application comes back as a self-closed, empty DataSet.
  assert.deepEqual(parseTables('<NewDataSet />'), []);
  assert.deepEqual(parseTables(undefined), []);
});

test('linkintime normalizeRecords maps MUFG fields onto the shared shape', () => {
  const [none] = normalizeLinkintime([
    { id: '11927', NAME1: 'A B', DPCLITID: 'D', ALLOT: '0', SHARES: '34' },
  ]);
  assert.equal(none.applicantName, 'A B');
  assert.equal(none.dpClientId, 'D');
  assert.equal(none.sharesApplied, 34);
  assert.equal(none.sharesAllotted, 0);
  assert.equal(none.status, 'not_allotted');
  const [full] = normalizeLinkintime([{ NAME1: 'X', ALLOT: '50', SHARES: '50' }]);
  assert.equal(full.status, 'allotted');
  const [partial] = normalizeLinkintime([{ NAME1: 'X', ALLOT: '10', SHARES: '50' }]);
  assert.equal(partial.status, 'partially_allotted');
  // Same key set as the kfintech normalizer -- the unified endpoint depends on it.
  assert.deepEqual(
    Object.keys(none).sort(),
    ['applicantName', 'applicationNumber', 'dpClientId', 'sharesAllotted', 'sharesApplied', 'status']
  );
});

test('registrar dispatch classifies api vs deeplink and rejects unknowns', () => {
  const kfin = getRegistrar('kfintech');
  assert.equal(kfin.kind, 'api');
  assert.equal(typeof kfin.client.queryByPan, 'function');
  assert.equal(typeof kfin.client.normalizeRecords, 'function');
  assert.equal(getRegistrar('linkintime').kind, 'api');

  // Bigshare dropped its captcha, and Maashitla never had one: both are now
  // checked in-app like the other two.
  assert.equal(getRegistrar('bigshare').kind, 'api');
  assert.equal(getRegistrar('maashitla').kind, 'api');

  assert.throws(() => getRegistrar('nonesuch'), (e) => e.code === 'REGISTRAR_UNSUPPORTED');
  // Every advertised api registrar honours the shared client contract.
  for (const r of supportedRegistrars.filter((x) => x.mode === 'api')) {
    const c = getRegistrar(r.name).client;
    assert.equal(typeof c.queryByPan, 'function', `${r.name} queryByPan`);
    assert.equal(typeof c.normalizeRecords, 'function', `${r.name} normalizeRecords`);
  }
});

test('bigshare parseCompanies reads the ddlCompany options and skips noise', () => {
  const html = `
    <select id="ddllang"><option value="en">ENGLISH</option></select>
    <select id="ddlCompany">
      <option>--Select Company--</option>
      <option value="592">PALUCK TECHNOLOGIES LIMITED</option>
      <option value="9047">LUMINO INDUSTRIES LIMITED</option>
    </select>
    <select id="SelectionType"><option value="0">Select</option><option value="PN">PAN</option></select>`;
  const companies = parseCompanies(html);
  assert.deepEqual(companies, [
    { id: '592', name: 'PALUCK TECHNOLOGIES LIMITED' },
    { id: '9047', name: 'LUMINO INDUSTRIES LIMITED' },
  ]);
  // No dropdown / empty markup -> no rows, no throw.
  assert.deepEqual(parseCompanies('<html></html>'), []);
});

test('marketDates parses ranges, cross-month, and junk', () => {
  assert.deepEqual(parseDateRange('10-15 Sept', REF), { openDate: '2026-09-10', closeDate: '2026-09-15' });
  // Open day > close day => open is in the previous month.
  assert.deepEqual(parseDateRange('28-1 Sept', REF), { openDate: '2026-08-28', closeDate: '2026-09-01' });
  assert.deepEqual(parseDateRange('TBA', REF), { openDate: null, closeDate: null });
  assert.deepEqual(parseDateRange('', REF), { openDate: null, closeDate: null });
});

test('marketDates helpers normalize status, rupees, and est listing', () => {
  assert.equal(normalizeStatus('Upcoming'), 'upcoming');
  assert.equal(normalizeStatus('Open'), 'open');
  assert.equal(normalizeStatus('Closed'), 'closed');
  assert.equal(normalizeStatus('anything else'), 'unknown');
  assert.equal(parseRupees('₹18'), 18);
  assert.equal(parseRupees('₹-'), null);
  assert.equal(parseRupees(''), null);
  assert.deepEqual(parseEstListing('₹158 (12.86%)'), { price: 158, gainPct: 12.86 });
  assert.deepEqual(parseEstListing('₹- (0.00%)'), { price: null, gainPct: 0 });
});

// A row of InvestorGain's live table, verbatim in shape: cells are found by
// `data-label`, the debut price is Cloudflare-obfuscated, "--" is unquoted.
const igRow = ({ name, path, badges, gmp, pct = "0.00", sub = '-', price, size, lot, open, close, boa, listing, extra = '' }) => `
  <tr><td data-label="Name"><div class="report-td"><div class="mono-num"><a href="${path}" title="${name}" target="_parent">${name}</a> ${badges
    .map((b) => `<span class="badge rounded-pill bg-secondary d-inline ms-2">${b}</span>`)
    .join('')}${extra}</div></div></td>
  <td data-label="GMP"><div class="report-td"><div class="mono-num">&#8377;<b>${gmp}</b> (${pct}%)<br><small><b>0 ↓ / 0 ↑</b></small></div></div></td>
  <td data-label="Rating"><div>&#128293;</div></td>
  <td data-label="Sub"><div class="mono-num">${sub}</div></td>
  <td data-label="Price (₹)"><div class="mono-num">${price}</div></td>
  <td data-label="IPO Size"><div class="mono-num">&#8377;${size} Cr</div></td>
  <td data-label="Lot"><div class="mono-num">${lot}</div></td>
  <td data-label="Open"><div class="mono-num">${open}</div></td>
  <td data-label="Close"><div class="mono-num">${close}</div></td>
  <td data-label="BoA Dt"><div class="mono-num">${boa}</div></td>
  <td data-label="Listing"><div class="mono-num">${listing}</div></td>
  <td data-label="Updated-On"><div class="mono-num"><small><b>2-Oct 11:37</b></small></div></td>
  <td data-label="Anchor"><div>✅</div></td></tr>`;

// "L@455.00" under Cloudflare's address obfuscation (key 0x6d).
const CF_L455 = '<span class="text-success"><small><b><a href="/cdn-cgi/l/email-protection" class="__cf_email__" data-cfemail="6d212d595858435d5d">[email&#160;protected]</a> (12.35%)</b></small></span>';

const IG_TABLE = `<table><tr><th>Name</th><th>GMP</th></tr>${[
  igRow({ name: 'Nityas Gems &amp; Jewellery', path: '/gmp/nityas-gems-jewellery-ipo/2235/', badges: ['IPO', 'O'], gmp: '3', pct: '4.00', sub: '0.69x', price: '75', size: '108.35', lot: '200', open: '30-Sep<br><small><b>GMP: 5</b></small>', close: '5-Oct', boa: '6-Oct', listing: '8-Oct' }),
  igRow({ name: 'TNA Solutions', path: '/gmp/tna-solutions-ipo/2370/', badges: ['BSE SME', 'O'], gmp: '6', pct: '8.57', sub: '1.71x', price: '70', size: '37.86', lot: '2,000', open: '30-Sep', close: '6-Oct', boa: '7-Oct', listing: '9-Oct' }),
  igRow({ name: 'Runwal Enterprises', path: '/gmp/runwal-enterprises-ipo/1711/', badges: ['IPO', 'C'], gmp: '-5', pct: '-1.64', sub: '2.64x', price: '305', size: '500.00', lot: '49', open: '25-Sep', close: '29-Sep', boa: '30-Sep', listing: '5-Oct' }),
  igRow({ name: 'R.K.Fashion Accessories', path: '/gmp/rk-fashion-ipo/2400/', badges: ['NSE SME', 'U'], gmp: '--', price: '82', size: '34.99', lot: '1,600', open: '5-Oct', close: '7-Oct', boa: '8-Oct', listing: '12-Oct' }),
  igRow({ name: 'A-One Steels', path: '/gmp/a-one-steels-ipo/1611/', badges: ['IPO'], extra: CF_L455, gmp: '46', sub: '12.23x', price: '405', size: '405.00', lot: '37', open: '24-Sep', close: '28-Sep', boa: '29-Sep', listing: '1-Oct' }),
].join('')}</table>`;

const IG_REF = new Date('2026-10-02T08:00:00Z');

test('investorgain.parse reads every field the list shows, from one table', () => {
  const rows = parseInvestorGain(IG_TABLE, { ref: IG_REF });
  assert.equal(rows.length, 5);
  const by = Object.fromEntries(rows.map((r) => [r.slug, r]));

  const nityas = by['nityas-gems-jewellery'];
  assert.equal(nityas.name, 'Nityas Gems & Jewellery', 'entities decoded before the slug is made');
  assert.equal(nityas.board, 'mainboard');
  assert.equal(nityas.status, 'open');
  assert.equal(nityas.gmp, 3);
  assert.equal(nityas.priceBand, '₹75');
  assert.equal(nityas.estListingPrice, 78);
  assert.equal(nityas.estGainPct, 4);
  assert.equal(nityas.lotSize, 200);
  assert.equal(nityas.issueSize, '₹108.35 Cr');
  assert.equal(nityas.subscription, 0.69);
  assert.equal(nityas.openDate, '2026-09-30', 'the "GMP: 5" note under the date is ignored');
  assert.equal(nityas.closeDate, '2026-10-05');
  assert.equal(nityas.allotmentDate, '2026-10-06');
  assert.equal(nityas.listingDate, '2026-10-08');
  assert.equal(nityas.sourcePath, '/gmp/nityas-gems-jewellery-ipo/2235/');
  assert.equal(nityas.source, 'investorgain');

  const tna = by['tna-solutions'];
  assert.equal(tna.board, 'sme', 'an exchange badge naming SME is the board');
  assert.equal(tna.listingExchanges, 'BSE SME');
  assert.equal(tna.lotSize, 2000);

  assert.equal(by['runwal-enterprises'].gmp, -5, 'a negative premium keeps its sign');
  assert.equal(by['runwal-enterprises'].status, 'closed');
  assert.equal(by['runwal-enterprises'].estGainPct, -1.64);

  const rk = by['r-k-fashion-accessories'];
  assert.equal(rk.gmp, 0, '"₹ -- (0.00%)" is how the source writes a zero premium');
  assert.equal(rk.estGainPct, 0);
  assert.equal(rk.estListingPrice, 82);
  assert.equal(rk.subscription, null);
  assert.equal(rk.status, 'upcoming');

  const aone = by['a-one-steels'];
  assert.equal(aone.listingPrice, 455, 'the obfuscated debut price is decoded');
  assert.equal(aone.status, 'listed');
});

test('investorgain dates take the year nearest the reading', () => {
  assert.equal(decodeCfEmail('6d212d595858435d5d'), 'L@455.00');
  assert.equal(dayMonth('30-Sep', IG_REF), '2026-09-30');
  // Across the turn of the year, both ways.
  assert.equal(dayMonth('2-Jan', new Date('2026-12-30T00:00:00Z')), '2027-01-02');
  assert.equal(dayMonth('28-Dec', new Date('2027-01-03T00:00:00Z')), '2026-12-28');
  assert.equal(dayMonth('--', IG_REF), null);
  assert.equal(dayMonth('31-Feb', IG_REF), null);
});

test('investorgain day-wise history is one point per day, oldest first, with change', () => {
  const r = (when, gmp, pct, est, profit) => `
    <tr class="">
      <td class="col-sticky" data-title="GMP Date & Time">${when}<br> <span class="gmp-badge badge-open">O</span></td>
      <td data-title="GMP" class="pos">₹${gmp} <span class="pos">(${pct}%)</span> <span class="trend-pill">─</span></td>
      <td data-title="Est. Listing Price">₹${est}</td>
      <td data-title="Est. Profit" class="pos">₹${profit}</td>
      <td data-title="Trend">Stable</td>
    </tr>`;
  const html = `<table><tr><th>GMP Date</th><th>GMP</th></tr>
    ${r('2-Oct 12:37', 3, '4.00', 78, 600)}
    ${r('1-Oct 23:37', 3, '4.00', 78, 600)}
    ${r('1-Oct 09:02', 4, '5.33', 79, 800)}
    ${r('30-Sep 23:37', 5, '6.67', 80, '1,000')}
    ${r('29-Sep 23:37', 5, '6.67', 80, '1,000')}
    ${r('28-Sep 23:37', 9, '12.00', 84, '1,800')}</table>`;

  const points = parseIgHistory(html, { ref: IG_REF });
  // IPOwiz's screen for this issue: 9, 5, 5, 3, 3.
  assert.deepEqual(points.map((p) => p.gmp), [9, 5, 5, 3, 3]);
  assert.deepEqual(points.map((p) => p.change), [null, -4, 0, -2, 0]);
  assert.equal(points[0].date, '2026-09-28');
  assert.equal(points[3].gmp, 3, "a day's latest reading wins over its earlier one");
  assert.equal(points[0].profit, 1800);
  assert.equal(points[4].indicative, 78);
  assert.equal(points[4].pct, 4);
});

test('investorgain issue page yields the band, exchanges and logo', () => {
  const html = `<script>self.__next_f.push([1,"is set issue \\\\u003ca href=\\\\\\"/keyword/price-band/280\\\\\\"\\\\u003eprice band\\\\u003c/a\\\\u003e at ₹70 to ₹75 per share. It will list on NSE and BSE with a date."])</script>
    <script>self.__next_f.push([1,"[\\"$\\",\\"meta\\",\\"7\\",{\\"property\\":\\"og:image\\",\\"content\\":\\"https://www.chittorgarh.net/images/ipo/nityas-logo.jpg\\"}]"])</script>`;
  const page = parseIgIssuePage(html);
  assert.equal(page.priceBand, '₹70 to ₹75');
  assert.equal(page.listingExchanges, 'NSE, BSE');
  assert.equal(page.logo, 'https://www.chittorgarh.net/images/ipo/nityas-logo.jpg');

  // The site's own card is not the company's logo.
  const generic = parseIgIssuePage('<meta property="og:image" content="https://www.chittorgarh.net/ig/images/logo/investorgain-og-logo.png">');
  assert.equal(generic.logo, null);
});

test('mergeBySlug keeps one row per IPO and prefers the live source', () => {
  const rows = [
    { slug: 'acme', source: 'ipoji', gmp: 40 },
    { slug: 'acme', source: 'investorgain', gmp: 55 },
    { slug: 'zeta', source: 'investorgain', gmp: 12 },
  ];
  const merged = mergeBySlug(rows);
  assert.equal(merged.length, 2);
  assert.equal(merged.find((r) => r.slug === 'acme').gmp, 55);
});



test('ipoMatch links names that differ across sources, without false positives', () => {
  // Real cross-source pairs seen in the data.
  assert.equal(matchScore('COMPLETE SPORTS AND MANAGEMENT INDIA LIMITED', 'Complete Sports & Management'), 1);
  assert.equal(matchScore('TEMPSENS INSTRUMENTS (INDIA) LIMITED', 'Tempsens Instruments'), 1);
  assert.ok(matchScore('ESDS Software Solution Limited - IPO', 'ESDS Software') >= 0.67);

  // Different IPOs that share one filler word stay below the link threshold.
  assert.ok(matchScore('Annu Projects Limited', 'Skyline Projects Limited') < 0.67);
  // A single short shared token is not enough signal.
  assert.equal(matchScore('NSE Limited', 'NSDL Limited'), 0);

  // Plurals fold to one form on both sides, so a brand ending in "s" folds too
  // — harmless, since every name being compared goes through the same rule.
  assert.deepEqual(nameTokens('TEMPSENS INSTRUMENTS (INDIA) LIMITED'), ['tempsen', 'instrument', 'india']);

  // Singular and plural are one company.
  assert.equal(matchScore('Runwal Enterprise Limited - IPO', 'Runwal Enterprises'), 1);
  // Two different companies sharing only generic words must never link: this
  // pair scored exactly the threshold and could have pointed one company's
  // allotment check at the other's registrar entry.
  assert.equal(matchScore('ADROIT INDUSTRIES INDIA LTD', 'Acme India Industries'), 0);
  assert.equal(matchScore('ADROIT INDUSTRIES INDIA LTD', 'Adroit Industries'), 1);

  const candidates = [
    { slug: 'purple-style-labs', name: 'Purple Style Labs' },
    { slug: 'annu-projects', name: 'Annu Projects' },
  ];
  const m = bestMatch('PURPLE STYLE LABS LIMITED', candidates);
  assert.equal(m.slug, 'purple-style-labs');
  assert.equal(bestMatch('Totally Unrelated Company', candidates), null);
});

test('x-forwarded-for is only believed from the frontend proxy', async (t) => {
  const original = config.proxySecret;
  t.after(() => {
    config.proxySecret = original;
  });

  const req = (headers) => ({
    ip: '203.0.113.9',
    get: (name) => headers[name.toLowerCase()],
  });

  // No secret configured: behaviour is the old one -- Express has already
  // resolved req.ip from the trusted hop count, and it is used as-is.
  config.proxySecret = undefined;
  assert.equal(clientIp(req({ 'x-forwarded-for': '198.51.100.4' })), '203.0.113.9');

  config.proxySecret = 'shared-secret';

  // The frontend proves itself, so the address it forwards is the real client.
  assert.equal(
    clientIp(req({ 'x-forwarded-for': '198.51.100.4', 'x-allotwise-proxy': 'shared-secret' })),
    '198.51.100.4'
  );
  // Leftmost entry is the original client; the rest are proxies it passed through.
  assert.equal(
    clientIp(req({ 'x-forwarded-for': '198.51.100.4, 10.0.0.1', 'x-allotwise-proxy': 'shared-secret' })),
    '198.51.100.4'
  );

  // The attack this exists to stop: a caller reaching the backend directly and
  // asserting a fresh address per request to reset its per-IP budget. Without
  // the secret the header is ignored entirely and every request keys on the
  // socket address, so the budget follows them.
  for (const spoofed of ['198.51.100.4', '198.51.100.5', '198.51.100.6']) {
    assert.equal(clientIp(req({ 'x-forwarded-for': spoofed })), '203.0.113.9');
  }
  // A wrong or partial secret is no better than none.
  assert.equal(
    clientIp(req({ 'x-forwarded-for': '198.51.100.4', 'x-allotwise-proxy': 'shared-secre' })),
    '203.0.113.9'
  );
  assert.equal(
    clientIp(req({ 'x-forwarded-for': '198.51.100.4', 'x-allotwise-proxy': 'wrong-secret!' })),
    '203.0.113.9'
  );
  assert.equal(isTrustedProxy(req({ 'x-allotwise-proxy': 'shared-secret' })), true);
  assert.equal(isTrustedProxy(req({})), false);
});

test('rejects bad requests before contacting the registrar', async () => {
  assert.equal((await postAllotment({})).status, 400);
  assert.equal((await postAllotment({ ipo: 'tempsens-instruments-india' })).status, 400);
  assert.equal((await postAllotment({ ipo: 'x', pan: 'NOTAPAN' })).status, 400);
  const unknown = await postAllotment({ ipo: 'definitely-not-an-ipo', pan: 'AAAAA1234A' });
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.error.code, 'IPO_NOT_FOUND');
});

test('error responses never echo the submitted PAN', async () => {
  const r = await postAllotment({ ipo: 'definitely-not-an-ipo', pan: 'AAAAA1234A' });
  assert.ok(!JSON.stringify(r.body).includes('AAAAA1234A'));
});

test('health reports db and cache state', async () => {
  const r = await get('/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
});

test('calendar and gmp endpoints validate filters and carry attribution', async () => {
  const cal = await get('/calendar');
  assert.equal(cal.status, 200);
  assert.ok(Array.isArray(cal.body.ipos));
  assert.ok(cal.body.attribution.length > 0, 'GMP data must be attributed');

  assert.equal((await get('/calendar?status=bogus')).status, 400);
  assert.equal((await get('/calendar?board=nope')).status, 400);
  assert.equal((await get('/calendar?status=open')).status, 200);

  const gmp = await get('/gmp?board=sme');
  assert.equal(gmp.status, 200);
  assert.ok(Array.isArray(gmp.body.gmp));

  // Single-IPO GMP for an unknown slug is a clean 404, not a crash.
  assert.equal((await get('/gmp?ipo=definitely-not-listed')).status, 404);
});

test('unified ipo detail endpoint behaves for unknown slugs', async () => {
  const unknown = await get('/ipo/definitely-not-an-ipo');
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.error.code, 'IPO_NOT_FOUND');

  // Bad slug shape is a 400 before any lookup.
  assert.equal((await get('/ipo/Bad_Slug!')).status, 400);
});

test('live: real lookup returns a normalized payload', { skip: !LIVE || !REAL_PAN }, async () => {
  const r = await postAllotment({ ipo: REAL_IPO, pan: REAL_PAN });
  assert.equal(r.status, 200);
  assert.equal(r.body.found, true);
  assert.ok(r.body.applications.length > 0);
  assert.ok(!('All_Shares' in r.body.applications[0]), 'raw registrar field names leaked');
  assert.match(r.body.pan, /^\w{4}\*{4}\w{2}$/);
});

test('live: second call is served from cache', { skip: !LIVE || !REAL_PAN }, async () => {
  const first = await postAllotment({ ipo: REAL_IPO, pan: REAL_PAN });
  const second = await postAllotment({ ipo: REAL_IPO, pan: REAL_PAN });
  assert.equal(second.body.meta.cached, true);
  assert.equal(second.body.meta.checkedAt, first.body.meta.checkedAt);
});

test('investorgain percentage is taken as printed, never re-rounded', () => {
  const html = `<table>${igRow({ name: 'Roopa Screen', path: '/gmp/roopa-screen-ipo/1/', badges: ['BSE SME'], gmp: '42', pct: '65.62', price: '64', size: '19.20', lot: '2,000', open: '24-Sep', close: '28-Sep', boa: '29-Sep', listing: '1-Oct' })}</table>`;
  const [row] = parseInvestorGain(html, { ref: IG_REF });
  // 42 / 64 = 65.625; toFixed(2) would print 65.63 against the source's 65.62.
  assert.equal(row.estGainPct, 65.62);
  assert.equal(row.estListingPrice, 106);
});

test('investorgain gives no percentage when no price is announced', () => {
  const html = `<table>${igRow({ name: 'Jio Platforms', path: '/gmp/jio-ipo/9/', badges: ['IPO', 'U'], gmp: '177', pct: '0.00', price: '', size: '0', lot: '', open: '', close: '', boa: '', listing: '' })}</table>`;
  const [row] = parseInvestorGain(html, { ref: IG_REF });
  assert.equal(row.gmp, 177);
  assert.equal(row.estGainPct, null, 'a printed 0.00% with no price is not a zero gain');
  assert.equal(row.estListingPrice, null);
});

test('bigshare lookup: not found, one application, several, and throttling', () => {
  // Shapes recorded from Bigshare's FetchIpodetails reply.
  const notFound = { d: { Status: 'NOTFOUND', Message: 'No data found', DPID: 'No data found', Records: [], MatchCount: 0 } };
  assert.deepEqual(bigshareInterpret({ status: 200, body: notFound }), { found: false, records: [] });

  const one = { d: { Status: 'OK', APPLICATION_NO: '1234567', DPID: 'IN30000011112222', Name: 'A KUMAR', APPLIED: '2,000', ALLOTED: '2,000', Records: [], MatchCount: 1 } };
  const r1 = bigshareInterpret({ status: 200, body: one });
  assert.equal(r1.found, true);
  const [app] = normalizeBigshare(r1.records);
  assert.equal(app.sharesApplied, 2000, 'Indian digit grouping is parsed');
  assert.equal(app.sharesAllotted, 2000);
  assert.equal(app.status, 'allotted');
  assert.equal(app.applicantName, 'A KUMAR');

  const many = {
    d: {
      Status: 'OK', Name: 'A KUMAR', APPLICATION_NO: '1', APPLIED: '2000', ALLOTED: '0', MatchCount: 2,
      Records: [
        { Name: 'A KUMAR', APPLICATION_NO: '1', APPLIED: '2000', ALLOTED: '0' },
        { Name: 'A KUMAR', APPLICATION_NO: '2', APPLIED: '2000', ALLOTED: '2000' },
      ],
    },
  };
  const apps = normalizeBigshare(bigshareInterpret({ status: 200, body: many }).records);
  assert.deepEqual(apps.map((a) => a.status), ['not_allotted', 'allotted']);

  for (const s of ['RATELIMIT', 'WARMING']) {
    assert.throws(() => bigshareInterpret({ status: 200, body: { d: { Status: s, Message: 'wait' } } }), (e) => e.code === 'UPSTREAM_RATE_LIMITED');
  }
  assert.throws(() => bigshareInterpret({ status: 429, body: null }), (e) => e.code === 'UPSTREAM_RATE_LIMITED');
  assert.throws(() => bigshareInterpret({ status: 500, body: null }), (e) => e.code === 'UPSTREAM_ERROR');
});

test('maashitla lookup: directory, not found, and an allotment', () => {
  const companies = parseMaashitla({
    companies: [
      { company_name: 'TNA SOLUTIONS LIMITED', company_slug: 'tna-solutions-limited' },
      { company_name: '  SJP  ULTRASONICS LIMITED ', company_slug: 'sjp-ultrasonics-limited' },
      { company_name: '', company_slug: 'broken' },
    ],
  });
  assert.deepEqual(companies, [
    { id: 'tna-solutions-limited', name: 'TNA SOLUTIONS LIMITED' },
    { id: 'sjp-ultrasonics-limited', name: 'SJP ULTRASONICS LIMITED' },
  ]);

  // The site's own reading: an empty object, or a 404, is "no record".
  assert.deepEqual(maashitlaInterpret({ status: 200, body: {} }), { found: false, records: [] });
  assert.deepEqual(maashitlaInterpret({ status: 404, body: null }), { found: false, records: [] });

  const hit = maashitlaInterpret({ status: 200, body: { name: 'B SHARMA', shares_applied: '2000', shares_allotted: '0' } });
  assert.equal(hit.found, true);
  const [app] = normalizeMaashitla(hit.records);
  assert.equal(app.status, 'not_allotted');
  assert.equal(app.sharesApplied, 2000);

  assert.throws(() => maashitlaInterpret({ status: 500, body: null }), (e) => e.code === 'UPSTREAM_ERROR');
});

test('coverage maps a registrar name to the module that can query it', async () => {
  const { registrarModuleFor, linkOutReason } = await import('../src/lib/coverage.js');
  assert.equal(registrarModuleFor('Kfin Technologies Ltd.'), 'kfintech');
  assert.equal(registrarModuleFor('MUFG Intime India Pvt.Ltd.'), 'linkintime');
  assert.equal(registrarModuleFor('Link Intime India Pvt Ltd'), 'linkintime');
  assert.equal(registrarModuleFor('Bigshare Services Pvt.Ltd.'), 'bigshare');
  assert.equal(registrarModuleFor('Maashitla Securities Pvt.Ltd.'), 'maashitla');
  assert.equal(registrarModuleFor('Cameo Corporate Services Ltd.'), null);
  assert.equal(registrarModuleFor(null), null);

  // One we can query but which has not listed the issue is a gap worth
  // watching; one we cannot query at all is a different, standing kind.
  assert.equal(linkOutReason('Bigshare Services Pvt.Ltd.'), 'not-in-registrar-list');
  assert.equal(linkOutReason('Cameo Corporate Services Ltd.'), 'registrar-not-supported');
});

test('alerts: errors are described, repeats are throttled, incidents report once and resolve', async () => {
  const { describeError, claim, reportIncidents, sendTelegram, alertsEnabled } = await import('../src/lib/alerts.js');
  const { gapIncidents } = await import('../src/lib/coverage.js');

  // The text names what failed and carries the useful fields, not the noise.
  const text = describeError({ ts: 'x', level: 'error', msg: 'gmp sync failed', message: 'HTTP 503', source: 'investorgain' });
  assert.match(text, /^ERROR: gmp sync failed\n/);
  assert.match(text, /message: HTTP 503/);
  assert.doesNotMatch(text, /\bts:|\blevel:/);

  // Off without credentials: sending is a harmless no-op.
  const was = { ...config.alerts };
  Object.assign(config.alerts, { telegramToken: '', telegramChatId: '', dryRun: false });
  assert.equal(alertsEnabled(), false);
  assert.equal(await sendTelegram('nothing'), false);

  // The same key is claimed once per window.
  const key = `test:${Date.now()}:${Math.random()}`;
  assert.equal(await claim(key, 60), true);
  assert.equal(await claim(key, 60), false);

  // Incidents: reported when they appear, silent while they persist, then
  // reported again as resolved. A failed send records nothing, so it retries.
  config.alerts.dryRun = true;
  const sent = [];
  const stateKey = `test-incidents:${Date.now()}:${Math.random()}`;
  const send = async (m) => (sent.push(m), true);
  const run = (map, s = send) => reportIncidents(new Map(Object.entries(map)), { send: s, stateKey });

  assert.equal((await run({ 'selftest:kfintech': 'kfintech: self-test failing' })).added, 1);
  assert.match(sent[0], /^ALERT \(1 new\)\n- kfintech: self-test failing/);
  assert.equal((await run({ 'selftest:kfintech': 'kfintech: self-test failing' })).sent, false, 'a persisting problem is not repeated');
  const resolved = await run({});
  assert.equal(resolved.cleared, 1);
  assert.match(sent[1], /^RESOLVED \(1\)/);

  const failing = async () => false;
  await run({ 'list:bigshare': 'bigshare: list stale' }, failing);
  assert.equal((await run({ 'list:bigshare': 'bigshare: list stale' })).added, 1, 'a failed send is retried next run');

  // Gaps: only issues a day past allotment (the registrar has had time) and
  // within a week (older history is not worth alerting on forever).
  const day = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
  const issue = (name, d, reason = 'not-in-registrar-list') => ({ name, registrar: 'Bigshare', reason, allotmentDate: d });
  const gaps = gapIncidents({ issues: [issue('Fresh', day(0)), issue('Due', day(2)), issue('Ancient', day(20)), issue('Elsewhere', day(2), 'registrar-not-supported')] });
  assert.deepEqual([...gaps.keys()], ['gap:Due']);

  Object.assign(config.alerts, was);
});
