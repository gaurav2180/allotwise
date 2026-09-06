import { config } from '../config.js';

// In-memory only, deliberately. Allotment results contain the applicant's name
// and demat ID, so persisting them to disk would undo the pass-through posture
// even though the PAN itself is only ever present as an HMAC in the key.
// A restart drops the cache; that is the intended trade.

const store = new Map();

function evictIfNeeded() {
  if (store.size <= config.cache.maxEntries) return;
  // Map preserves insertion order, so the oldest key is the first one.
  const overflow = store.size - config.cache.maxEntries;
  let i = 0;
  for (const key of store.keys()) {
    store.delete(key);
    if (++i >= overflow) break;
  }
}

export function cacheGet(key) {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  // Refresh recency for LRU-ish eviction.
  store.delete(key);
  store.set(key, hit);
  return hit.value;
}

export function cacheSet(key, value, ttlSeconds) {
  if (ttlSeconds <= 0) return;
  store.delete(key);
  store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  evictIfNeeded();
}

export function cacheStats() {
  return { entries: store.size, maxEntries: config.cache.maxEntries };
}

export function cacheClear() {
  store.clear();
}

// Periodic sweep so expired entries holding PII do not linger in memory
// until they happen to be read again.
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, hit] of store) if (hit.expiresAt <= now) store.delete(key);
}, 60_000);
sweeper.unref();
