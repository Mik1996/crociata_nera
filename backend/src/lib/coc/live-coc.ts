import { cocWarLogSchema, cocWarSchema, CocWar } from '@/modules/wars/wars.schemas';
import { throwException } from '../http/api-error';
import { MessageKey } from '../http/message-key';
import { CocApiError, fetchClan, fetchClanRankings, fetchCurrentWar, fetchPlayer, fetchRaidSeasons, fetchWarLog } from './coc-client';
import { cachedRead } from './live-cache';

/**
 * Reads of the Clash of Clans API made on a page request (the frontend never calls the API: every
 * read goes through the backend). Each response is kept in memory for a while
 * ({@link cachedRead}), so pages and the filters of their tables do not call the API every time;
 * while the API is unavailable the last response is served for a while.
 */

/** How long each kind of response is kept. */
export const LIVE_TTL_MS = {
  /** Member list, league, capital: changes slowly. */
  clan: 60_000,
  /** Attacks arrive continuously on the battle day. */
  currentWar: 30_000,
  warLog: 5 * 60_000,
  /** A profile changes with upgrades, rarely within minutes. */
  player: 10 * 60_000,
  raids: 60_000,
  rankings: 10 * 60_000,
} as const;

/** `GET /clans/{tag}` as the API returns it. */
export function liveClan(clanTag: string): Promise<Record<string, unknown>> {
  return cachedRead(`clan:${clanTag}`, LIVE_TTL_MS.clan, async () => (await fetchClan(clanTag)) as Record<string, unknown>);
}

/**
 * The clan's war in progress (or in preparation, or just ended); `null` when the clan is not at
 * war or its war log is private. Other errors of the API are thrown ({@link CocApiError}).
 */
export async function liveCurrentWar(clanTag: string): Promise<CocWar | null> {
  try {
    return await cachedRead(`currentwar:${clanTag}`, LIVE_TTL_MS.currentWar, async () => {
      const parsed = cocWarSchema.safeParse(await fetchCurrentWar(clanTag));
      // `notInWar` (or an unexpected payload): no war to show.
      return parsed.success ? parsed.data : null;
    });
  } catch (error) {
    if (error instanceof CocApiError && error.isPrivateWarLog) return null;
    throw error;
  }
}

/** Entries of the war log as the API returns them (every war it lists); empty when the war log is private. */
export async function liveWarLog(clanTag: string): Promise<Record<string, unknown>[]> {
  try {
    return await cachedRead(`warlog:${clanTag}`, LIVE_TTL_MS.warLog, async () => {
      const log = (await fetchWarLog(clanTag, null)) as { items?: unknown } | null;
      return Array.isArray(log?.items) ? (log.items as Record<string, unknown>[]) : [];
    });
  } catch (error) {
    if (error instanceof CocApiError && error.isPrivateWarLog) return [];
    throw error;
  }
}

/** {@link liveWarLog}, validated: dates as `Date`, entries that are not readable left out. */
export async function liveWarLogEntries(clanTag: string) {
  return cocWarLogSchema.parse({ items: await liveWarLog(clanTag) }).items;
}

/** `GET /players/{tag}` as the API returns it; `null` when the player does not exist. */
export async function livePlayer(playerTag: string): Promise<Record<string, unknown> | null> {
  try {
    return await cachedRead(`player:${playerTag}`, LIVE_TTL_MS.player, async () => (await fetchPlayer(playerTag)) as Record<string, unknown>);
  } catch (error) {
    if (error instanceof CocApiError && error.status === 404) return null;
    throw error;
  }
}

/** Items of `GET /clans/{tag}/capitalraidseasons` (the latest `limit` weekends). */
export function liveRaidSeasons(clanTag: string, limit: number): Promise<Record<string, unknown>[]> {
  return cachedRead(`raids:${clanTag}:${limit}`, LIVE_TTL_MS.raids, async () => {
    const list = (await fetchRaidSeasons(clanTag, limit)) as { items?: unknown } | null;
    return Array.isArray(list?.items) ? (list.items as Record<string, unknown>[]) : [];
  });
}

/** Position of a clan in the trophy ranking of a location (top 200); `null` beyond it. */
export async function liveClanRank(clanTag: string, locationId: number): Promise<number | null> {
  const ranking = await cachedRead(`rankings:${locationId}`, LIVE_TTL_MS.rankings, async () => {
    const list = (await fetchClanRankings(locationId, 200)) as { items?: { tag?: string; rank?: number }[] } | null;
    return list?.items ?? [];
  });
  return ranking.find((c) => c.tag === clanTag)?.rank ?? null;
}

/**
 * Runs a read of the API for a route: when the API cannot answer, the route answers 502
 * `ERROR.COC_API_UNAVAILABLE` (logged with Supercell's reason).
 */
export async function fromCocApi<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (!(error instanceof CocApiError)) throw error;
    console.warn(`[coc] ${error.status} ${error.reason}: ${error.message}`);
    throwException(502, MessageKey.COC_API_UNAVAILABLE);
  }
}
