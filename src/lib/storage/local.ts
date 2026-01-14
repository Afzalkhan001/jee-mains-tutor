type Stored<T> = { value: T; savedAt: number; expiresAt?: number };

export function setStoredJson<T>(key: string, value: T, opts?: { ttlMs?: number }) {
  if (typeof window === "undefined") return;
  const now = Date.now();
  const payload: Stored<T> = {
    value,
    savedAt: now,
    expiresAt: opts?.ttlMs ? now + opts.ttlMs : undefined,
  };
  window.localStorage.setItem(key, JSON.stringify(payload));
}

export function getStoredJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Stored<T>;
    if (parsed.expiresAt && parsed.expiresAt <= Date.now()) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed.value ?? null;
  } catch {
    return null;
  }
}

