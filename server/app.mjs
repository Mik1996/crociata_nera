// HTTP proxy between the frontend and the Clash of Clans API.
// The token stays on the server; the frontend only talks to this proxy.
// It is not an open relay: besides the routes of the configured clan, it only forwards the
// official GET endpoints listed in `coc-routes.mjs`, with validated parameters and a per-IP limit.

import { createServer } from 'node:http';
import { CocApiError } from './coc-client.mjs';
import { resolveCocRoute } from './coc-routes.mjs';
import { MONTH_REGEX } from './history.mjs';
import { clientIp, RateLimiter } from './rate-limit.mjs';

/**
 * Saves a `currentwar` response to the archive and, if the war has ended, to the monthly history.
 * Save errors are only logged: they must not block the response.
 */
export async function saveWar(war, { archive, history }) {
  const archived = await archive.save(war).catch((err) => {
    console.warn(`[archive] ${err.message}`);
    return false;
  });
  const recorded = await history.record(war).catch((err) => {
    console.warn(`[history] ${err.message}`);
    return false;
  });
  return { archived, recorded };
}

/**
 * @param {{ client: import('./coc-client.mjs').CocClient,
 *           archive: import('./archive.mjs').WarArchive,
 *           history: import('./history.mjs').MonthlyHistory,
 *           clanTag: string,
 *           rateLimiter?: RateLimiter }} deps
 */
export function createApp({ client, archive, history, clanTag, rateLimiter = new RateLimiter() }) {
  const encodedTag = encodeURIComponent(clanTag);

  /**
   * Routes of the configured clan, used by the site's own pages: not rate limited, and the
   * current war is archived on every read.
   */
  const routes = {
    [`/api/coc/clans/${encodedTag}`]: () => client.clan(clanTag),
    [`/api/coc/clans/${encodedTag}/currentwar`]: async () => {
      const war = await client.currentWar(clanTag);
      await saveWar(war, { archive, history });
      return war;
    },
    [`/api/coc/clans/${encodedTag}/warlog`]: () => client.warLog(clanTag),
    '/api/coc/archive/wars': () => archive.list(),
    '/api/coc/history': () => history.months(),
    '/api/coc/history/all': () => history.all(),
    '/api/health': async () => ({ status: 'ok', clanTag }),
  };

  /** Monthly history: `/api/coc/history/YYYY-MM`. */
  function historyHandler(path) {
    const month = /^\/api\/coc\/history\/(\d{4}-\d{2})$/.exec(path)?.[1];
    if (!month || !MONTH_REGEX.test(month)) return undefined;
    return async () => {
      const data = await history.month(month);
      if (!data) {
        throw new CocApiError(404, { reason: 'notFound', message: `No wars recorded in month ${month}` });
      }
      return data;
    };
  }

  /**
   * Any other official endpoint in the allowlist (`coc-routes.mjs`): validated, rate limited per
   * IP and cached by the client.
   * @returns {{ handler?: () => Promise<unknown>, status?: number, error?: string, retryAfter?: number }}
   */
  function cocHandler(req, url) {
    if (!url.pathname.startsWith('/api/coc/')) return {};
    const resolved = resolveCocRoute(url.pathname.slice('/api/coc'.length), url.searchParams);
    if ('error' in resolved) return { status: resolved.status, error: resolved.error };
    const retryAfter = rateLimiter.hit(clientIp(req));
    if (retryAfter) return { status: 429, error: 'Too many requests: try again shortly', retryAfter };
    return { handler: () => client.get(resolved.upstream, resolved.ttlMs) };
  }

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method !== 'GET') {
      return respond(res, 405, { reason: 'methodNotAllowed', message: 'Only GET requests are supported' });
    }

    let handler = routes[url.pathname] ?? historyHandler(url.pathname);
    if (!handler) {
      const coc = cocHandler(req, url);
      if (!coc.handler) {
        const reason = coc.status === 429 ? 'requestThrottled' : coc.status === 400 ? 'badRequest' : 'notFound';
        const headers = coc.retryAfter ? { 'Retry-After': String(coc.retryAfter) } : {};
        return respond(res, coc.status ?? 404, { reason, message: coc.error ?? `Route not available: ${url.pathname}` }, headers);
      }
      handler = coc.handler;
    }

    try {
      respond(res, 200, await handler());
    } catch (err) {
      if (err instanceof CocApiError) {
        console.warn(`[api] ${url.pathname} → ${err.status} ${err.body?.reason ?? ''}`);
        return respond(res, err.status, err.body ?? { reason: 'unknown', message: err.message });
      }
      console.error(err);
      respond(res, 500, { reason: 'proxy.error', message: 'Internal proxy error' });
    }
  });
}

function respond(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}
