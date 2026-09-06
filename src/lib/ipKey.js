// Rate-limit key for a client address.
//
// IPv6 clients are routinely handed a whole /64, so keying on the full address
// would let one host rotate through addresses and reset its budget at will.
// Collapse to the /64 prefix; leave IPv4 as-is.
export function ipKey(ip) {
  if (!ip) return 'unknown';
  let addr = ip;
  if (addr.startsWith('::ffff:')) addr = addr.slice(7); // IPv4-mapped IPv6
  if (!addr.includes(':')) return addr;

  const [head] = addr.split('%'); // strip zone id
  const parts = head.split(':');
  const idx = parts.indexOf('');
  if (idx !== -1) {
    // Expand the :: shorthand so the first four groups are the real ones.
    const left = parts.slice(0, idx).filter(Boolean);
    const right = parts.slice(idx + 1).filter(Boolean);
    const fill = Array(Math.max(0, 8 - left.length - right.length)).fill('0');
    return [...left, ...fill, ...right].slice(0, 4).join(':') + '::/64';
  }
  return parts.slice(0, 4).join(':') + '::/64';
}
