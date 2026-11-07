// Fixed-window rate limiter per client IP, in memory (a single proxy instance).

export class RateLimiter {
  /**
   * @param {{ max?: number, windowMs?: number, maxClients?: number, now?: () => number }} options
   * `max` requests per `windowMs` for each IP; `maxClients` caps the memory used by the counters.
   */
  constructor({ max = 60, windowMs = 60_000, maxClients = 10_000, now = Date.now } = {}) {
    this.max = max;
    this.windowMs = windowMs;
    this.maxClients = maxClients;
    this.now = now;
    /** @type {Map<string, { count: number, resetAt: number }>} */
    this.clients = new Map();
  }

  /**
   * Counts a request. Returns `0` when allowed, otherwise the seconds to wait (for `Retry-After`).
   * @param {string} ip
   */
  hit(ip) {
    const now = this.now();
    let entry = this.clients.get(ip);
    if (!entry || entry.resetAt <= now) {
      if (this.clients.size >= this.maxClients) this.prune(now);
      entry = { count: 0, resetAt: now + this.windowMs };
      this.clients.set(ip, entry);
    }
    entry.count += 1;
    return entry.count > this.max ? Math.ceil((entry.resetAt - now) / 1000) : 0;
  }

  /** Drops expired windows; if still full, the oldest clients. */
  prune(now) {
    for (const [ip, entry] of this.clients) if (entry.resetAt <= now) this.clients.delete(ip);
    while (this.clients.size >= this.maxClients) this.clients.delete(this.clients.keys().next().value);
  }
}

/**
 * Client IP. The proxy is only reachable through Caddy, which sets `X-Forwarded-For` with the
 * real client address (and replaces any value sent by the client): the last entry is used.
 * @param {import('node:http').IncomingMessage} req
 */
export function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const last = (Array.isArray(forwarded) ? forwarded.join(',') : (forwarded ?? '')).split(',').pop()?.trim();
  return last || req.socket.remoteAddress || 'unknown';
}
