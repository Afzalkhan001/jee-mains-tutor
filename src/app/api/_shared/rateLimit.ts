type Bucket = { resetAt: number; count: number };

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;

const buckets = new Map<string, Bucket>();

export function checkRateLimit(ip: string | null | undefined) {
  const key = ip || "unknown";
  const now = Date.now();
  const cur = buckets.get(key);

  if (!cur || cur.resetAt <= now) {
    const next: Bucket = { resetAt: now + WINDOW_MS, count: 1 };
    buckets.set(key, next);
    return { ok: true as const, remaining: MAX_PER_WINDOW - 1, resetAt: next.resetAt };
  }

  if (cur.count >= MAX_PER_WINDOW) {
    return { ok: false as const, remaining: 0, resetAt: cur.resetAt };
  }

  cur.count += 1;
  buckets.set(key, cur);
  return { ok: true as const, remaining: MAX_PER_WINDOW - cur.count, resetAt: cur.resetAt };
}

