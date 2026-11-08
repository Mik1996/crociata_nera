import { env } from '../config/env';

/** Error of the Clash of Clans API, with Supercell's `reason` (e.g. `accessDenied.invalidIp`). */
export class CocApiError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string,
    message: string,
  ) {
    super(message);
    this.name = 'CocApiError';
  }

  /** The clan war log is private: current war and war log are not readable. */
  get isPrivateWarLog(): boolean {
    return this.status === 403 && this.reason === 'accessDenied';
  }
}

const TIMEOUT_MS = 10_000;

/**
 * Minimal server-side client of the official API. The token is read from the environment
 * and never leaves the backend. Responses are returned as `unknown`: callers validate them.
 */
export function cocGet(path: string): Promise<unknown> {
  return cocRequest(path);
}

/** `POST` with a JSON body (only `verifytoken` needs it). */
export function cocPost(path: string, body: unknown): Promise<unknown> {
  return cocRequest(path, body);
}

async function cocRequest(path: string, body?: unknown): Promise<unknown> {
  const { COC_API_TOKEN, COC_API_BASE_URL } = env();
  if (!COC_API_TOKEN) throw new CocApiError(0, 'config.missingToken', 'COC_API_TOKEN is not set');

  let response: Response;
  try {
    response = await fetch(`${COC_API_BASE_URL}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${COC_API_TOKEN}`,
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (error) {
    throw new CocApiError(0, 'network', `Clash of Clans API unreachable: ${(error as Error).message}`);
  }

  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const { reason = 'unknown', message = response.statusText } = (result ?? {}) as { reason?: string; message?: string };
    throw new CocApiError(response.status, reason, message);
  }
  return result;
}

const clanPath = (clanTag: string) => `/clans/${encodeURIComponent(clanTag)}`;

/** `GET /clans/{tag}`: clan details and member list. */
export function fetchClan(clanTag: string): Promise<unknown> {
  return cocGet(clanPath(clanTag));
}

/** `GET /clans/{tag}/currentwar`. */
export function fetchCurrentWar(clanTag: string): Promise<unknown> {
  return cocGet(`${clanPath(clanTag)}/currentwar`);
}

/** `GET /clans/{tag}/warlog`: summaries of the latest wars (final result, stars, XP). */
export function fetchWarLog(clanTag: string, limit = 10): Promise<unknown> {
  return cocGet(`${clanPath(clanTag)}/warlog?limit=${limit}`);
}

/** `GET /clans/{tag}/currentwar/leaguegroup`: the Clan War League group of the season (404 outside CWL). */
export function fetchLeagueGroup(clanTag: string): Promise<unknown> {
  return cocGet(`${clanPath(clanTag)}/currentwar/leaguegroup`);
}

/** `GET /clanwarleagues/wars/{warTag}`: one war of the Clan War League. */
export function fetchLeagueWar(warTag: string): Promise<unknown> {
  return cocGet(`/clanwarleagues/wars/${encodeURIComponent(warTag)}`);
}

/**
 * `GET /clans/{tag}/capitalraidseasons`: Raid Weekends, most recent first. The API includes the
 * members (attacks, Capital Gold) only for the weekend in progress: the backend saves them.
 */
export function fetchRaidSeasons(clanTag: string, limit = 5): Promise<unknown> {
  return cocGet(`${clanPath(clanTag)}/capitalraidseasons?limit=${limit}`);
}

/**
 * `POST /players/{tag}/verifytoken`: checks the player's API token, shown in the game under
 * Settings → More Settings. Only the owner of the account can read it, and it changes
 * regularly, so a match proves ownership. Throws {@link CocApiError} (404: unknown player).
 */
export async function verifyPlayerToken(playerTag: string, token: string): Promise<boolean> {
  const result = (await cocPost(`/players/${encodeURIComponent(playerTag)}/verifytoken`, { token })) as {
    status?: string;
  } | null;
  return result?.status === 'ok';
}
