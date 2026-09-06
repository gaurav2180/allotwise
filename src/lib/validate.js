import { badRequest } from './errors.js';

// Same shape KFintech's own frontend enforces: 5 alpha, 4 digit, 1 alpha.
const PAN_RE = /^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parsePan(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw badRequest('PAN_REQUIRED', 'Query parameter "pan" is required.');
  }
  const pan = raw.trim().toUpperCase();
  if (!PAN_RE.test(pan)) {
    // Deliberately does not echo the offending value -- it would land in logs.
    throw badRequest('PAN_INVALID', 'PAN must be 5 letters, 4 digits, then 1 letter.');
  }
  return pan;
}

export function parseSlug(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw badRequest('IPO_REQUIRED', 'Query parameter "ipo" is required.');
  }
  const slug = raw.trim().toLowerCase();
  if (!SLUG_RE.test(slug) || slug.length > 100) {
    throw badRequest('IPO_INVALID', 'IPO slug must be lowercase alphanumeric words separated by hyphens.');
  }
  return slug;
}

export function slugify(name) {
  return name
    .toLowerCase()
    .replace(/\((.*?)\)/g, ' $1 ')
    .replace(/\b(limited|ltd|private|pvt)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}
