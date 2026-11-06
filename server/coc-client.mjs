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
   * @param {{ token: string, ttlMs?: number, fetchFn?: typeof fetch, baseUrl?: string }} options
   */
  constructor({ token, ttlMs = 60_000, fetchFn = fetch, baseUrl = BASE_URL }) {
    if (!token) throw new Error('Missing API token: set COC_API_TOKEN in the .env file');
    this.token = token;
    this.ttlMs = ttlMs;
    this.fetchFn = fetchFn;
    this.baseUrl = baseUrl;
    /** @type {Map<string, { expiresAt: number, data: unknown }>} */
    this.cache = new Map();
  }

  /** GET on an API path (e.g. `/clans/%232J8JVVCLC`). */
  async get(path) {
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

    this.cache.set(path, { expiresAt: Date.now() + this.ttlMs, data: body });
    return body;
  }

  clan(tag) {
    return this.get(`/clans/${encodeURIComponent(tag)}`);
  }

  currentWar(tag) {
    return this.get(`/clans/${encodeURIComponent(tag)}/currentwar`);
  }

  warLog(tag, limit = 50) {
    return this.get(`/clans/${encodeURIComponent(tag)}/warlog?limit=${limit}`);
  }
}
