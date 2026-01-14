// Best-effort in-memory rate limiting per IP (works for warm instances).
// This is NOT a substitute for WAF, but it materially reduces accidental cost spikes.

const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 20;

/** @type {Map<string, {resetAt: number, count: number}>} */
const buckets = new Map();

module.exports.checkRateLimit = function checkRateLimit(ip) {
  const now = Date.now();
  const key = ip || "unknown";
  const cur = buckets.get(key);
  if (!cur || cur.resetAt <= now) {
    buckets.set(key, { resetAt: now + WINDOW_MS, count: 1 });
    return { ok: true, remaining: MAX_PER_WINDOW - 1, resetAt: now + WINDOW_MS };
  }
  if (cur.count >= MAX_PER_WINDOW) {
    return { ok: false, remaining: 0, resetAt: cur.resetAt };
  }
  cur.count += 1;
  buckets.set(key, cur);
  return { ok: true, remaining: MAX_PER_WINDOW - cur.count, resetAt: cur.resetAt };
};

