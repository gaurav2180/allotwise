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
import { parseCompanies } from '../src/registrars/bigshare.js';
import { getRegistrar, supportedRegistrars } from '../src/registrars/index.js';
import { parseDateRange, normalizeStatus, parseRupees, parseEstListing } from '../src/lib/marketDates.js';
import { parse as parseIpoWatch, parseDetails } from '../src/gmp/ipowatch.js';
import { parse as parseIpoJiGmp, parseListing, parseDetails as parseIpoJiDetails } from '../src/gmp/ipoji.js';
const parseIpoJi = Object.assign(parseIpoJiGmp, { listing: parseListing });
import { mergeBySlug } from '../src/gmp/index.js';
import { nameTokens, matchScore, bestMatch } from '../src/lib/ipoMatch.js';
import { nseDate, normalizeCategory, parseSubscription } from '../src/market/nse.js';

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

  const bs = getRegistrar('bigshare');
  assert.equal(bs.kind, 'deeplink');
  assert.match(bs.url, /^https:\/\//);
  assert.ok(bs.label);

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

test('ipowatch.parse splits boards, avoids the Last-Updated/Date collision', () => {
  // Header order deliberately puts "Last Updated" after "Date": "updated"
  // contains the substring "date", so a naive matcher steals the date column.
  const html = `
    <h3>Mainboard IPO GMP</h3>
    <table>
      <tr><td>IPO Name</td><td>IPO GMP*</td><td>Trend</td><td>Price Band</td>
          <td>Est. Listing</td><td>Date</td><td>Status</td><td>Last Updated</td></tr>
      <tr><td>Veegaland Developers</td><td>₹18</td><td>🟢</td><td>₹140</td>
          <td>₹158 (12.86%)</td><td>10-15 Sept</td><td>Upcoming</td><td>3 Sept, 17:09</td></tr>
    </table>
    <h3>SME IPO GMP</h3>
    <table>
      <tr><td>IPO Name</td><td>IPO GMP*</td><td>Trend</td><td>Price Band</td>
          <td>Est. Listing</td><td>Date</td><td>Status</td><td>Last Updated</td></tr>
      <tr><td>Amtech Esters</td><td>₹0</td><td>🟡</td><td>₹75</td>
          <td>₹- (0.00%)</td><td>9-11 Sept</td><td>Upcoming</td><td>3 Sept, 17:09</td></tr>
    </table>
    <h3>Mainboard IPO GMP Performance</h3>
    <table>
      <tr><td>IPO Name</td><td>IPO Price</td><td>IPO GMP</td><td>Listing Price</td></tr>
      <tr><td>Old IPO</td><td>₹788</td><td>₹290</td><td>₹961</td></tr>
    </table>`;
  const recs = parseIpoWatch(html, { ref: REF });
  assert.equal(recs.length, 2, 'historical table (no Status column) must be skipped');

  const veg = recs.find((r) => r.slug === 'veegaland-developers');
  assert.equal(veg.board, 'mainboard');
  assert.equal(veg.gmp, 18);
  assert.equal(veg.openDate, '2026-09-10'); // not the "3 Sept" from Last Updated
  assert.equal(veg.closeDate, '2026-09-15');
  assert.equal(veg.estListingPrice, 158);
  assert.equal(veg.status, 'upcoming');
  assert.equal(veg.sourceUpdatedAt, '3 Sept, 17:09');

  const amt = recs.find((r) => r.slug === 'amtech-esters');
  assert.equal(amt.board, 'sme', 'row after the SME heading must be tagged sme');
});

test('ipoji.parse reads the data attributes and full offer dates', () => {
  const html = `
    <tr class="gmp-row" data-type="sme" data-status="open" data-hasgmp="true"
        data-gmp="42" data-pct="33" data-indicative="169"
        data-name="Qualiance International" data-rowurl="/ipo-gmp/qualiance-international-ipo">
      <td class="gmp-col-name" data-label="IPO"><a href="/ipo/qualiance-international-ipo">Qualiance International IPO</a></td>
      <td class="gmp-num" data-label="Price Band">&#8377;120-127</td>
      <td class="gmp-num" data-label="GMP">+&#8377;42</td>
      <td class="gmp-secondary" data-label="Open &#8211; Close"><span class="gmp-dates">Sep 4, 2026 &#8211; Sep 8, 2026</span></td>
      <td class="gmp-secondary" data-label="Last Updated">6 Sep 2026, 7:30 PM IST</td>
    </tr>
    <tr class="gmp-row" data-type="mainboard" data-status="upcoming" data-hasgmp="false"
        data-gmp="0" data-pct="0" data-indicative="0" data-name="Manika Plastech">
      <td data-label="Price Band">&#8377;-</td>
      <td data-label="Open &#8211; Close">Sep 11, 2026 &#8211; Sep 16, 2026</td>
    </tr>`;

  const [q, m] = parseIpoJi(html);
  assert.equal(q.slug, 'qualiance-international');
  assert.equal(q.board, 'sme');
  assert.equal(q.gmp, 42);
  assert.equal(q.estGainPct, 33);
  assert.equal(q.estListingPrice, 169);
  assert.equal(q.status, 'open');
  // Full dates, so unlike IPO Watch's "28-1 Sept" there is no year to infer.
  assert.equal(q.openDate, '2026-09-04');
  assert.equal(q.closeDate, '2026-09-08');
  assert.equal(q.sourceUpdatedAt, '6 Sep 2026, 7:30 PM IST');

  // Not yet quoted is not a premium of zero, even though the attributes read 0.
  assert.equal(m.gmp, null);
  assert.equal(m.estListingPrice, null);
  assert.equal(m.openDate, '2026-09-11');

  // An entity in an attribute has to decode too. The calendar card decodes its
  // text, so leaving `data-name` raw gave the two pages different names for one
  // company -- "Manipal Payment &amp; Identity Solutions" against "Manipal
  // Payment & Identity Solutions" -- and therefore different slugs, which put
  // it in the list twice from a single source.
  const [amp] = parseIpoJi(
    '<tr class="gmp-row" data-type="sme" data-status="open" data-hasgmp="false" data-name="Manipal Payment &amp; Identity Solutions"></tr>'
  );
  assert.equal(amp.name, 'Manipal Payment & Identity Solutions');
  assert.equal(amp.slug, 'manipal-payment-identity-solutions');
  assert.equal(
    amp.slug,
    parseIpoJi.listing(
      '<article class="card ipo-card" data-ipo-board="sme"><h3 class="ipo-card-name">Manipal Payment &amp; Identity Solutions</h3></article>'
    )[0].slug,
    'both pages must produce the same slug for the same company'
  );
});

test('ipoji.parseDetails prefers the fact list and falls back to the timeline', () => {
  const html = `
    <dl class="fact-item"><dt class="fact-label"><i></i> Issue size</dt><dd class="fact-value">&#8377;45.11 Cr</dd></dl>
    <dl class="fact-item"><dt class="fact-label"><i></i> Lot size</dt><dd class="fact-value">1000</dd></dl>
    <dl class="fact-item"><dt class="fact-label"><i></i> Minimum Investment</dt><dd class="fact-value">&#8377;2,54,000</dd></dl>
    <dl class="fact-item"><dt class="fact-label"><i></i> Listing At</dt><dd class="fact-value">NSE SME</dd></dl>
    <li class="step"><p class="step-date done-label">Sep 9, 2026</p><p class="step-label done-label">Allotment Date</p></li>
    <li class="step"><p class="step-date done-label">Sep 11, 2026</p><p class="step-label done-label">Listing Date</p></li>`;

  const d = parseIpoJiDetails(html);
  // A rupee amount as published, never a share count.
  assert.equal(d.issueSize, '₹45.11 Cr');
  assert.equal(d.lotSize, 1000);
  assert.equal(d.minInvestment, 254000);
  assert.equal(d.listingExchanges, 'NSE SME');
  // Absent from the fact list here, so these come from the timeline.
  assert.equal(d.allotmentDate, '2026-09-09');
  assert.equal(d.listingDate, '2026-09-11');

  // The page's own em dash for "not published yet" must not become a value.
  assert.equal(
    parseIpoJiDetails('<dl class="fact-item"><dt class="fact-label">Minimum Investment</dt><dd class="fact-value">—</dd></dl>')
      .minInvestment,
    null
  );
});

test('ipoji.parseListing reads the calendar cards and derives status from the dates', () => {
  const card = (slug, name, open, close, status, board, price, lot, size, premium) => `
    <article class="card ipo-card" data-agent-href="/ipo/${slug}" data-ipo-status="${status}" data-ipo-board="${board}">
      <h3 class="ipo-card-name" title="${name} Limited IPO">${name}</h3>
      <div class="ipo-card-date"><time datetime="${open}">x</time> – <time datetime="${close}">y</time></div>
      <div><span class="ipo-card-secondary-label">Offer Price</span><span class="ipo-card-body-value">${price}</span></div>
      <div><span class="ipo-card-secondary-label">Lot Size</span><span class="ipo-card-body-value">${lot}</span></div>
      <div><span class="ipo-card-secondary-label">Issue Size</span><span class="ipo-card-body-value">${size}</span></div>
      <div><span class="ipo-card-secondary-label">Exp. Premium</span><span class="ipo-card-body-value">${premium}</span></div>
    </article>`;

  const html =
    card('national-stock-exchange-of-india-ipo', 'National Stock Exchange of India', '2026-09-17', '2026-09-21',
         'current', 'mainboard', '₹1700-1785', '8', '₹22561.57 Cr', '₹208 <small>(12%)</small>') +
    card('open-one-ipo', 'Open One', '2026-09-10', '2026-09-14', 'current', 'sme', '₹56-59', '2000', '₹26.93 Cr', '—') +
    card('gone-by-ipo', 'Gone By', '2026-09-01', '2026-09-03', 'listed', 'sme', '₹87-92', '1600', '₹45 Cr', '-₹6 (-7%)');

  const [nse, open, listed] = parseIpoJi.listing(html, { ref: new Date('2026-09-12T00:00:00Z') });

  assert.equal(nse.slug, 'national-stock-exchange-of-india');
  assert.equal(nse.board, 'mainboard');
  assert.equal(nse.openDate, '2026-09-17');
  assert.equal(nse.closeDate, '2026-09-21');
  assert.equal(nse.priceBand, '₹1700-1785', 'the full band, not just the cap price');
  assert.equal(nse.issueSize, '₹22561.57 Cr');
  assert.equal(nse.lotSize, 8);
  assert.equal(nse.gmp, 208);
  assert.equal(nse.estGainPct, 12);
  // The card says "current" for anything not yet listed, so open vs upcoming
  // comes from the dates instead.
  assert.equal(nse.status, 'upcoming', 'opens in five days');
  assert.equal(open.status, 'open', 'reference date sits inside the window');
  assert.equal(listed.status, 'listed', 'the one status the dates cannot give');

  // An em dash is "not quoted yet", which is not a premium of zero.
  assert.equal(open.gmp, null);
  // A discount is a real, negative premium.
  assert.equal(listed.gmp, -6);
  assert.equal(listed.estGainPct, -7);
});

test('a second GMP source is what puts an IPO in the list twice', () => {
  // The bug in one assertion. IPO Watch called this issue "NSE"; IPO Ji calls it
  // "National Stock Exchange of India". They are the same company and they share
  // no slug and no name token, so nothing downstream can reconcile them --
  // mergeBySlug keys on the slug, and the fuzzy matcher used for registrar links
  // scores this pair at zero. The only fix is not to have two sources.
  assert.notEqual(slugify('NSE'), slugify('National Stock Exchange of India'));
  assert.equal(matchScore('NSE', 'National Stock Exchange of India'), 0);

  const rows = [
    { slug: 'nse', source: 'ipowatch', name: 'NSE', gmp: 218 },
    { slug: 'national-stock-exchange-of-india', source: 'ipoji', name: 'National Stock Exchange of India', gmp: 208 },
  ];
  assert.equal(mergeBySlug(rows).length, 2, 'deduplication cannot save a two-source setup');

  // Which is why the default is a single source, and why configuring a second
  // one has to be deliberate rather than a variable someone edits in passing.
  assert.deepEqual(config.gmp.sources, ['ipoji']);
});

test('a second GMP source cannot be configured by accident', async () => {
  const run = (env) =>
    new Promise((resolve) => {
      const child = spawn(
        process.execPath,
        ['-e', "import('./src/config.js').then(m => console.log(m.config.gmp.sources.join(',')))"],
        { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }
      );
      let out = '';
      let err = '';
      child.stdout.on('data', (c) => (out += c));
      child.stderr.on('data', (c) => (err += c));
      child.on('close', (code) => resolve({ code, out: out.trim(), err }));
    });

  // The process must refuse to start, and say why -- duplicated rows surfacing
  // hours after an unrelated-looking config edit is the failure being prevented.
  const refused = await run({ GMP_SOURCES: 'ipoji,ipowatch', GMP_ALLOW_MULTIPLE_SOURCES: '' });
  assert.notEqual(refused.code, 0, 'two sources must not boot');
  assert.match(refused.err, /only one is supported/);
  assert.match(refused.err, /National Stock Exchange of India/, 'the error has to explain the failure');

  // Deliberate is still allowed: the guard is a tripwire, not a wall.
  const allowed = await run({ GMP_SOURCES: 'ipoji,ipowatch', GMP_ALLOW_MULTIPLE_SOURCES: 'true' });
  assert.equal(allowed.code, 0);
  assert.equal(allowed.out, 'ipoji,ipowatch');

  const single = await run({ GMP_SOURCES: 'ipowatch', GMP_ALLOW_MULTIPLE_SOURCES: '' });
  assert.equal(single.code, 0);
  assert.equal(single.out, 'ipowatch');
});

test('mergeBySlug collapses per-source rows without mixing one quote with another', () => {
  const rows = [
    { slug: 'acme', source: 'ipowatch', gmp: 55, estListingPrice: 200, priceBand: '₹140-145', lotSize: 100 },
    { slug: 'acme', source: 'ipoji', gmp: 40, estListingPrice: 185, priceBand: null, lotSize: null },
    { slug: 'zeta', source: 'ipowatch', gmp: null, estListingPrice: null, priceBand: '₹90-95', lotSize: 50 },
    { slug: 'zeta', source: 'ipoji', gmp: 12, estListingPrice: 107, priceBand: null, lotSize: null },
  ];

  const [acme, zeta] = mergeBySlug(rows);
  assert.equal(mergeBySlug(rows).length, 2, 'one row per IPO, not one per source');

  // The configured leader wins outright, and its premium and indicative price
  // travel together -- ₹40 with ₹200 is a number neither source published.
  assert.equal(acme.source, 'ipoji');
  assert.equal(acme.gmp, 40);
  assert.equal(acme.estListingPrice, 185);
  // Descriptive gaps are still filled from the other source.
  assert.equal(acme.priceBand, '₹140-145');
  assert.equal(acme.lotSize, 100);

  // A leader with no quote at all does not outrank one that has an answer.
  assert.equal(zeta.source, 'ipoji');
  assert.equal(zeta.gmp, 12);
  assert.equal(zeta.priceBand, '₹90-95');
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

  assert.deepEqual(nameTokens('TEMPSENS INSTRUMENTS (INDIA) LIMITED'), ['tempsens', 'instruments', 'india']);

  const candidates = [
    { slug: 'purple-style-labs', name: 'Purple Style Labs' },
    { slug: 'annu-projects', name: 'Annu Projects' },
  ];
  const m = bestMatch('PURPLE STYLE LABS LIMITED', candidates);
  assert.equal(m.slug, 'purple-style-labs');
  assert.equal(bestMatch('Totally Unrelated Company', candidates), null);
});

test('ipowatch.parseDetails extracts timeline, lot size, and min investment', () => {
  const html = `
    <table>
      <tr><td>IPO Open Date:</td><td>September 10, 2026</td></tr>
      <tr><td>IPO Close Date:</td><td>September 15, 2026</td></tr>
      <tr><td>Face Value:</td><td>₹10 Per Equity Share</td></tr>
      <tr><td>Issue Size:</td><td>Approx ₹210 Crores</td></tr>
      <tr><td>Issue Type:</td><td>Book Building Issue</td></tr>
      <tr><td>IPO Listing:</td><td>BSE, NSE</td></tr>
      <tr><td>Basis of Allotment:</td><td>September 16, 2026</td></tr>
      <tr><td>Refunds:</td><td>September 17, 2026</td></tr>
      <tr><td>IPO Listing Date:</td><td>September 18, 2026</td></tr>
    </table>
    <table>
      <tr><td>Application</td><td>Lot Size</td><td>Shares</td><td>Amount</td></tr>
      <tr><td>Retail Minimum</td><td>1</td><td>107</td><td>₹14,980</td></tr>
    </table>`;
  const d = parseDetails(html);
  assert.equal(d.faceValue, '₹10 Per Equity Share');
  assert.equal(d.issueSize, 'Approx ₹210 Crores');
  assert.equal(d.listingExchanges, 'BSE, NSE');
  assert.equal(d.allotmentDate, '2026-09-16');
  assert.equal(d.refundDate, '2026-09-17');
  assert.equal(d.listingDate, '2026-09-18');
  assert.equal(d.lotSize, 107);
  assert.equal(d.minInvestment, 14980);
});

test('nse helpers parse dates, categories, and the subscription payload', () => {
  assert.equal(nseDate('01-Sep-2026'), '2026-09-01');
  assert.equal(nseDate('garbage'), null);
  assert.equal(normalizeCategory('Qualified Institutional Buyers(QIBs)'), 'QIB');
  assert.equal(normalizeCategory('Non Institutional Investors'), 'NII');
  assert.equal(normalizeCategory('Retail Individual Investors(RIIs)'), 'Retail');
  // Granular sub-rows are dropped.
  assert.equal(normalizeCategory('Mutual funds'), null);
  assert.equal(normalizeCategory('Cut Off'), null);

  const payload = {
    updateTime: 'Updated as on 03-Sep-2026 19:00:00',
    dataList: [
      { category: 'Category', noOfSharesBid: 'No. of shares bid for' },
      { category: 'Qualified Institutional Buyers(QIBs)', noOfShareOffered: '100', noOfSharesBid: '3700', noOfTotalMeant: '37.00497' },
      { category: 'Mutual funds', noOfTotalMeant: '0.0' },
      { category: 'Total', noOfShareOffered: '200', noOfSharesBid: '8500', noOfTotalMeant: '42.608' },
    ],
  };
  const { rows, updateTime } = parseSubscription(payload);
  assert.equal(rows.length, 2, 'only QIB + Total survive; header and sub-row dropped');
  assert.equal(rows[0].category, 'QIB');
  assert.equal(rows[0].timesSubscribed, 37); // rounded to 2 dp
  assert.equal(rows[1].category, 'Total');
  assert.equal(rows[1].timesSubscribed, 42.61);
  assert.equal(updateTime, 'Updated as on 03-Sep-2026 19:00:00');
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

test('unified ipo detail and subscription endpoints behave for unknown slugs', async () => {
  const unknown = await get('/ipo/definitely-not-an-ipo');
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.error.code, 'IPO_NOT_FOUND');

  assert.equal((await get('/subscription?ipo=definitely-not-an-ipo')).status, 404);
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
