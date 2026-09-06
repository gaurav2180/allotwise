import { config } from '../config.js';

// Bigshare is a deep-link registrar: its data call (Data.aspx/FetchIpodetails)
// verifies a human-solved captcha answer against an HMAC in the token, so there
// is no honest way to query it server-side. This module therefore has no
// queryByPan -- only the metadata for the deep link and the parser used to seed
// the IPO list so /allotment can resolve slugs.

export const deeplink = {
  label: 'Bigshare Services',
  get url() {
    return config.bigshare.statusPage;
  },
};

// The company list is server-rendered into <select id="ddlCompany"> on the
// public status page -- reading it involves no captcha. Exported for the sync
// script and for tests.
export function parseCompanies(html) {
  const block = html.match(/<select[^>]*id="ddlCompany"[^>]*>([\s\S]*?)<\/select>/i);
  if (!block) return [];
  const out = [];
  const optRe = /<option\s+value="(\d+)"\s*>([^<]+)<\/option>/gi;
  let m;
  while ((m = optRe.exec(block[1])) !== null) {
    const id = m[1].trim();
    const name = m[2].replace(/\s+/g, ' ').trim();
    // value="0" is the "--Select Company--" placeholder.
    if (id !== '0' && name) out.push({ id, name });
  }
  return out;
}
