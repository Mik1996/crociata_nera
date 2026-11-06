// HTTP proxy between the frontend and the Clash of Clans API.
// The token stays on the server; the frontend only talks to this proxy.

import { createServer } from 'node:http';
import { CocApiError } from './coc-client.mjs';
import { MONTH_REGEX } from './history.mjs';

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
 *           clanTag: string }} deps
 */
export function createApp({ client, archive, history, clanTag }) {
  const encodedTag = encodeURIComponent(clanTag);

  /** Allowed routes: only the configured clan (the proxy is not an open relay). */
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

  /**
   * Player profile, only for current members of the clan (checked against the cached member list),
   * so the proxy cannot be used to look up arbitrary players.
   */
  async function memberProfile(playerTag) {
    const clan = await client.clan(clanTag);
    if (!clan.memberList?.some((m) => m.tag === playerTag)) {
      throw new CocApiError(404, { reason: 'notFound', message: `Player ${playerTag} is not a member of the clan` });
    }
    return client.player(playerTag);
  }

  /** Parameterised routes: `/api/coc/history/YYYY-MM` and `/api/coc/players/{tag}`. */
  function dynamicHandler(path) {
    const playerTag = /^\/api\/coc\/players\/(%23[0-9A-Z]{1,15})$/i.exec(path)?.[1];
    if (playerTag) return () => memberProfile(decodeURIComponent(playerTag).toUpperCase());

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

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const handler =
      req.method === 'GET' ? (routes[url.pathname] ?? dynamicHandler(url.pathname)) : undefined;

    if (!handler) {
      return respond(res, 404, { reason: 'notFound', message: `Route not available: ${url.pathname}` });
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

function respond(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
