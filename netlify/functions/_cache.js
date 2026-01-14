// Tiny in-memory cache (best-effort) for warm Netlify Function instances.
// Note: serverless instances are ephemeral; client-side caching is also implemented in the app.

const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const MAX_ITEMS = 500;

/** @type {Map<string, {expiresAt: number, value: any}>} */
const store = new Map();

function prune() {
  const now = Date.now();
  for (const [k, v] of store.entries()) {
    if (v.expiresAt <= now) store.delete(k);
  }
  // Very small LRU-ish: if still too big, delete oldest by iteration order.
  while (store.size > MAX_ITEMS) {
    const firstKey = store.keys().next().value;
    store.delete(firstKey);
  }
}

module.exports.cacheGet = function cacheGet(key) {
  prune();
  const hit = store.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  return hit.value;
};

module.exports.cacheSet = function cacheSet(key, value, ttlMs = DEFAULT_TTL_MS) {
  prune();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
};

