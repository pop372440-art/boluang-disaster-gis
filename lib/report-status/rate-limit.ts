type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function takeRateLimit(key: string, limit: number, windowMs: number, now = Date.now()) {
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0, resetAt };
  }
  if (current.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
      resetAt: current.resetAt,
    };
  }
  current.count += 1;
  return { allowed: true, remaining: limit - current.count, retryAfterSeconds: 0, resetAt: current.resetAt };
}

export function resetRateLimitsForTests() {
  buckets.clear();
}

