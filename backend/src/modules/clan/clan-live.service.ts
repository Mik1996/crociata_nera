import { CocApiError, GLOBAL_LOCATION_ID } from '@/lib/coc/coc-client';
import { CRUSADE_CLAN_NAMES, crusadeClanTags } from '@/lib/coc/crusade-clans';
import { fromCocApi, liveClan, liveClanRank, liveCurrentWar, livePlayer, liveWarLog } from '@/lib/coc/live-coc';
import { env } from '@/lib/config/env';
import { throwException } from '@/lib/http/api-error';
import { MessageKey } from '@/lib/http/message-key';
import { cocWarFormat, toSide } from '@/modules/wars/wars.service';

/**
 * Data of the Clash of Clans API the pages read through the backend (the frontend never calls
 * the API itself): the main clan, its war in progress, its war log, player profiles, the clans an
 * account is in, and the public data of the welcome page.
 */

/** The main clan (`CLAN_TAG`); 404 when not configured. */
function mainClanTag(): string {
  const clanTag = env().CLAN_TAG;
  if (!clanTag) throwException(404, MessageKey.NOT_FOUND);
  return clanTag;
}

/** `GET /clan`: the main clan as `GET /clans/{tag}` returns it (members included). */
export function getMainClan(): Promise<Record<string, unknown>> {
  const clanTag = mainClanTag();
  return fromCocApi(() => liveClan(clanTag));
}

/**
 * `GET /wars/current`: the main clan's war in progress (or in preparation, or just ended) in the
 * `currentwar` format; `null` when the clan is not at war or its war log is private.
 */
export async function getCurrentWar(): Promise<ReturnType<typeof cocWarFormat> | null> {
  const clanTag = mainClanTag();
  const war = await fromCocApi(() => liveCurrentWar(clanTag));
  return war && cocWarFormat({ ...war, clan: toSide(war.clan), opponent: toSide(war.opponent) });
}

/** `GET /wars/warlog`: the war log of the main clan as the API lists it; empty when private. */
export function getWarLog(): Promise<Record<string, unknown>[]> {
  const clanTag = mainClanTag();
  return fromCocApi(() => liveWarLog(clanTag));
}

/** `GET /players/{tag}/profile`: a player as `GET /players/{tag}` returns it; 404 when unknown. */
export async function getPlayerProfile(tag: string): Promise<Record<string, unknown>> {
  const player = await fromCocApi(() => livePlayer(tag));
  if (!player) throwException(404, MessageKey.PLAYER_NOT_FOUND);
  return player;
}

export type MemberRole = 'leader' | 'coLeader' | 'elder' | 'member';
/** In-game roles (`admin` is the elder). */
const ROLES: Record<string, MemberRole> = { leader: 'leader', coLeader: 'coLeader', admin: 'elder', member: 'member' };

interface CocMember {
  tag?: string;
  name?: string;
  role?: string;
  townHallLevel?: number;
}

/** A linked account that is in a clan of the Crusade now. */
export interface Membership {
  tag: string;
  name: string;
  role: MemberRole;
  /** `null` when the API leaves it out. */
  townHallLevel: number | null;
  clanTag: string;
  clanName: string;
}

/**
 * `GET /auth/me/memberships`: which of the user's accounts are in a clan of the Crusade now, with
 * their name and role (a clan that cannot be read is left out).
 */
export async function getMemberships(playerTags: readonly string[]): Promise<Membership[]> {
  if (!playerTags.length) return [];
  const wanted = new Set(playerTags.map((tag) => tag.toUpperCase()));
  const clans = await Promise.all(
    crusadeClanTags().map(async (clanTag) => {
      try {
        return { clanTag, clan: await liveClan(clanTag) };
      } catch (error) {
        if (!(error instanceof CocApiError)) throw error;
        return { clanTag, clan: null };
      }
    }),
  );
  const memberships: Membership[] = [];
  for (const { clanTag, clan } of clans) {
    for (const m of ((clan?.['memberList'] ?? []) as CocMember[])) {
      if (!m.tag || !m.name || !wanted.has(m.tag.toUpperCase())) continue;
      memberships.push({
        tag: m.tag,
        name: m.name,
        role: ROLES[m.role ?? ''] ?? 'member',
        townHallLevel: m.townHallLevel ?? null,
        clanTag,
        clanName: (clan?.['name'] as string | undefined) ?? CRUSADE_CLAN_NAMES[clanTag] ?? clanTag,
      });
    }
  }
  return memberships;
}

/** Fields of `GET /clans/{tag}` the welcome page shows (members: only name and role). */
const WELCOME_CLAN_FIELDS = [
  'tag',
  'name',
  'type',
  'description',
  'location',
  'isFamilyFriendly',
  'badgeUrls',
  'clanLevel',
  'clanPoints',
  'clanCapitalPoints',
  'capitalLeague',
  'requiredTrophies',
  'requiredTownhallLevel',
  'requiredLeagueTier',
  'warFrequency',
  'warWinStreak',
  'warWins',
  'warTies',
  'warLosses',
  'isWarLogPublic',
  'warLeague',
  'members',
  'labels',
  'clanCapital',
  'chatLanguage',
] as const;

export interface WelcomeData {
  /** The clans of the Crusade, the main one first; a clan that cannot be read is left out. */
  clans: Record<string, unknown>[];
  /** Positions of the main clan in its country's and in the worldwide trophy rankings (top 200). */
  ranks: { local?: number | null; global?: number | null };
}

/** The welcome page's view of a clan: its public fields, the members by name and role only. */
function welcomeClan(clan: Record<string, unknown>): Record<string, unknown> {
  const view: Record<string, unknown> = {};
  for (const field of WELCOME_CLAN_FIELDS) if (clan[field] !== undefined) view[field] = clan[field];
  view['memberList'] = ((clan['memberList'] ?? []) as CocMember[])
    .filter((m) => m.name)
    .map((m) => ({ name: m.name, role: m.role ?? 'member' }));
  return view;
}

/** Position in a ranking, `undefined` when the ranking cannot be read. */
async function rankIn(clanTag: string, locationId: number | undefined): Promise<number | null | undefined> {
  if (!locationId) return undefined;
  try {
    return await liveClanRank(clanTag, locationId);
  } catch (error) {
    if (!(error instanceof CocApiError)) throw error;
    return undefined;
  }
}

/**
 * `GET /welcome` (public): what the welcome page, the "Join us" page and the badge in the header
 * show of the clans of the Crusade, without the member lists' details. 502 when the main clan
 * cannot be read.
 */
export async function getWelcome(): Promise<WelcomeData> {
  const [main, ...sisterTags] = crusadeClanTags();
  const clan = await fromCocApi(() => liveClan(main!));
  const [sisters, local, global] = await Promise.all([
    Promise.all(
      sisterTags.map(async (tag) => {
        try {
          return welcomeClan(await liveClan(tag));
        } catch (error) {
          if (!(error instanceof CocApiError)) throw error;
          return null;
        }
      }),
    ),
    rankIn(main!, (clan['location'] as { id?: number } | undefined)?.id),
    rankIn(main!, GLOBAL_LOCATION_ID),
  ]);
  return {
    clans: [welcomeClan(clan), ...sisters.filter((s): s is Record<string, unknown> => s !== null)],
    ranks: { ...(local !== undefined ? { local } : {}), ...(global !== undefined ? { global } : {}) },
  };
}
