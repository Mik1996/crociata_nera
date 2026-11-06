import { ApiName, RATE_LIMITS } from './api-name';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window, in-memory rate limiter keyed by API name and client IP.
 * Per process: enough for a single instance. With several instances or a serverless
 * deployment, swap this for a shared store (e.g. Redis) behind the same function.
 */
const buckets = new Map<string, Bucket>();
let lastSweep = 0;

export interface RateLimitOutcome {
  allowed: boolean;
  /** Seconds until the window resets. */
  retryAfter: number;
}

export function consumeRateLimit(apiName: ApiName, clientKey: string, now = Date.now()): RateLimitOutcome {
  const { limit, windowMs } = RATE_LIMITS[apiName];
  sweep(now);

  const key = `${apiName}:${clientKey}`;
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count++;
  return { allowed: bucket.count <= limit, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
}

/** Test helper. */
export function resetRateLimits(): void {
  buckets.clear();
}

function sweep(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
}
