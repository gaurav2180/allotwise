// Fetches KFintech's IPO status site from India, for the Allotwise backend.
//
// KFintech serves ipostatus.kfintech.com only to visitors in India; from
// anywhere else its code file comes back as a placeholder page, with no IPO
// list in it. The Allotwise backend runs outside India, so it asks this
// function -- deployed to Vercel's Mumbai region -- to fetch the two public
// files it reads: the homepage, and the code file the homepage names.
//
// It is not a general proxy: it fetches those two kinds of path on that one
// host and nothing else, and only for a caller holding RELAY_SECRET. No PAN
// ever passes through here; PAN lookups go straight to KFintech's own API,
// which is not restricted.

const HOST = 'https://ipostatus.kfintech.com/';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
// "" for the homepage, or the content-hashed main bundle it points at.
const ALLOWED = /^(|static\/js\/main\.[a-f0-9]{6,20}\.js)$/;

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-relay-region', process.env.VERCEL_REGION ?? 'unknown');

  const secret = process.env.RELAY_SECRET;
  if (!secret || req.headers['x-relay-secret'] !== secret) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const path = typeof req.query.path === 'string' ? req.query.path : '';
  if (!ALLOWED.test(path)) {
    return res.status(400).json({ error: 'path not allowed' });
  }

  try {
    const upstream = await fetch(HOST + path, {
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: '*/*' },
      signal: AbortSignal.timeout(15_000),
    });
    const body = await upstream.text();
    res.setHeader('content-type', path ? 'application/javascript; charset=utf-8' : 'text/html; charset=utf-8');
    return res.status(upstream.status).send(body);
  } catch (err) {
    return res.status(502).json({ error: `fetch failed: ${err.message}` });
  }
}
