const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const MAX_ITEMS = 500;

type Entry<T> = { value: T; expiresAt: number };

const store = new Map<string, Entry<unknown>>();

function prune() {
  const now = Date.now();
  for (const [k, v] of store.entries()) {
    if (v.expiresAt <= now) store.delete(k);
  }
  while (store.size > MAX_ITEMS) {
    const firstKey = store.keys().next().value as string | undefined;
    if (!firstKey) break;
    store.delete(firstKey);
  }
}

export function cacheGet<T>(key: string): T | null {
  prune();
  const hit = store.get(key) as Entry<T> | undefined;
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  return hit.value;
}

export function cacheSet<T>(key: string, value: T, ttlMs = DEFAULT_TTL_MS) {
  prune();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

