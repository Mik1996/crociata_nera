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
export async function cocGet(path: string): Promise<unknown> {
  const { COC_API_TOKEN, COC_API_BASE_URL } = env();
  if (!COC_API_TOKEN) throw new CocApiError(0, 'config.missingToken', 'COC_API_TOKEN is not set');

  let response: Response;
  try {
    response = await fetch(`${COC_API_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${COC_API_TOKEN}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (error) {
    throw new CocApiError(0, 'network', `Clash of Clans API unreachable: ${(error as Error).message}`);
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const { reason = 'unknown', message = response.statusText } = (body ?? {}) as { reason?: string; message?: string };
    throw new CocApiError(response.status, reason, message);
  }
  return body;
}

const clanPath = (clanTag: string) => `/clans/${encodeURIComponent(clanTag)}`;

/** `GET /clans/{tag}/currentwar`. */
export function fetchCurrentWar(clanTag: string): Promise<unknown> {
  return cocGet(`${clanPath(clanTag)}/currentwar`);
}

/** `GET /clans/{tag}/warlog`: summaries of the latest wars (final result, stars, XP). */
export function fetchWarLog(clanTag: string, limit = 10): Promise<unknown> {
  return cocGet(`${clanPath(clanTag)}/warlog?limit=${limit}`);
}
