import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

// PANs are only ever used in memory, for the duration of one upstream call.
// Anything that outlives the request (cache keys, rate-limit keys, metrics)
// uses this keyed hash instead. Rotating PAN_HASH_SECRET invalidates every
// derived key at once.
export function panHash(pan) {
  return createHmac('sha256', config.panHashSecret).update(pan.toUpperCase()).digest('hex').slice(0, 32);
}

export function safeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
