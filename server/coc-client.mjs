// Minimal client for the official Clash of Clans API, with an in-memory cache.

const BASE_URL = 'https://api.clashofclans.com/v1';

export class CocApiError extends Error {
  constructor(status, body) {
    super(body?.message ?? `API error (${status})`);
    this.status = status;
    this.body = body;
  }
}

export class CocClient {
  /**
   * @param {{ token: string, ttlMs?: number, maxEntries?: number, fetchFn?: typeof fetch, baseUrl?: string }} options
   * `maxEntries` caps the cache: the proxy forwards arbitrary clans and players, so it must not
   * grow without limit.
   */
  constructor({ token, ttlMs = 60_000, maxEntries = 1000, fetchFn = fetch, baseUrl = BASE_URL }) {
    if (!token) throw new Error('Missing API token: set COC_API_TOKEN in the .env file');
    this.token = token;
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.fetchFn = fetchFn;
    this.baseUrl = baseUrl;
    /** @type {Map<string, { expiresAt: number, data: unknown }>} */
    this.cache = new Map();
  }

  /** GET on an API path (e.g. `/clans/%232J8JVVCLC`), cached for `ttlMs`. */
  async get(path, ttlMs = this.ttlMs) {
    const cached = this.cache.get(path);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    let response;
    try {
      response = await this.fetchFn(`${this.baseUrl}${path}`, {
        headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      throw new CocApiError(502, { reason: 'proxy.unreachable', message: `API unreachable: ${err.message}` });
    }

    const body = await response.json().catch(() => null);
    if (!response.ok) throw new CocApiError(response.status, body);

    this.remember(path, body, ttlMs);
    return body;
  }

  /** Stores a response, dropping expired entries and then the oldest ones beyond `maxEntries`. */
  remember(path, data, ttlMs) {
    const now = Date.now();
    this.cache.delete(path);
    if (this.cache.size >= this.maxEntries) {
      for (const [key, entry] of this.cache) if (entry.expiresAt <= now) this.cache.delete(key);
      while (this.cache.size >= this.maxEntries) this.cache.delete(this.cache.keys().next().value);
    }
    this.cache.set(path, { expiresAt: now + ttlMs, data });
  }

  clan(tag) {
    return this.get(`/clans/${encodeURIComponent(tag)}`);
  }

  currentWar(tag) {
    return this.get(`/clans/${encodeURIComponent(tag)}/currentwar`);
  }

  player(tag) {
    return this.get(`/players/${encodeURIComponent(tag)}`);
  }

  warLog(tag, limit = 50) {
    return this.get(`/clans/${encodeURIComponent(tag)}/warlog?limit=${limit}`);
  }
}
