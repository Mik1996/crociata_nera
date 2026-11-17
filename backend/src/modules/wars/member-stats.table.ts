import { liveClan } from '@/lib/coc/live-coc';
import { env } from '@/lib/config/env';
import { defineTable, filterRows, queryTable, TablePage, TableQuery } from '@/lib/table/table-query';
import { PlayerModel } from '@/modules/commendations/player.model';
import { outcome, WAR_RESULTS, WarOutcome } from './war-history.table';
import { War, WarModel } from './war.model';

/**
 * War statistics of the members of the main clan over its last {@link STATS_WINDOW} wars with
 * players and attacks (`GET /players`), and the wars of one player (`GET /players/{tag}/wars`).
 * Same rules as the frontend's player pages (`computePlayerStats`).
 */

/** Wars the statistics look back on (the frontend's `statsWindow`). */
export const STATS_WINDOW = 20;

export type ClanRole = 'leader' | 'coLeader' | 'elder' | 'member';
export const CLAN_ROLES: readonly ClanRole[] = ['leader', 'coLeader', 'elder', 'member'];
/** In-game roles (`admin` is the elder). */
const ROLES: Record<string, ClanRole> = { leader: 'leader', coLeader: 'coLeader', admin: 'elder', member: 'member' };
const ROLE_ORDER: Record<ClanRole, number> = { leader: 0, coLeader: 1, elder: 2, member: 3 };

export interface MemberLeague {
  id: number;
  name: string;
  iconUrl: string | null;
}

interface ClanMember {
  tag: string;
  name: string;
  role: ClanRole;
  townHall: number;
  trophies: number;
  league: MemberLeague | null;
}

export interface MemberStatsRow {
  tag: string;
  name: string;
  role: ClanRole;
  townHall: number;
  league: MemberLeague | null;
  trophies: number;
  /** Wars in which the player was lined up. */
  warsPlayed: number;
  /** Wars looked at. */
  warsTotal: number;
  /** `warsPlayed / warsTotal` (%). */
  attendance: number;
  attacksAvailable: number;
  attacksUsed: number;
  totalStars: number;
  averageStars: number;
  /** 3-star attacks out of the attacks used (%). */
  threeStarRate: number;
  averageDestruction: number;
}

/** Averages over the matching members, for the footer of the table. */
export interface MemberStatsAverages {
  townHall: number;
  warsPlayed: number;
  attendance: number;
  attacksUsed: number;
  attacksAvailable: number;
  totalStars: number;
  averageStars: number;
  threeStarRate: number;
  averageDestruction: number;
}

export interface MemberStatsSummary {
  /** Members of the clan (all, not only the matching ones). */
  members: number;
  /** Wars looked at (`0`: no war with players saved yet). */
  warsTotal: number;
  /** Leagues of the members, highest first (the options of the league filter). */
  leagues: { id: number; name: string }[];
  /** Averages over the matching members; `null` when none matches. */
  averages: MemberStatsAverages | null;
}

export type MemberStatsPage = TablePage<MemberStatsRow> & { summary: MemberStatsSummary };

/** A player's performance in one war. */
export interface PlayerWarRow {
  warId: string;
  date: string;
  opponent: string;
  result: WarOutcome;
  townHall: number;
  mapPosition: number;
  attacksUsed: number;
  attacksAvailable: number;
  stars: number;
  averageDestruction: number;
}

/** Higher leagues first, then trophies; players without a league last. */
const leagueKey = (m: MemberStatsRow) => (m.league?.id ?? 0) * 1_000_000 + m.trophies;

export const MEMBER_STATS_TABLE = defineTable<MemberStatsRow>(
  {
    league: { label: 'the name of the league', filter: 'select', value: (m) => m.league?.name, sort: leagueKey },
    townHall: { label: 'town hall level', filter: 'number', sort: true },
    name: { label: "the player's name or tag", filter: 'text', value: (m) => [m.name, m.tag], sort: (m) => m.name },
    role: { label: 'the clan role', filter: 'select', options: CLAN_ROLES, sort: (m) => ROLE_ORDER[m.role] * 100 - m.townHall },
    warsPlayed: { label: 'wars played', filter: 'number', sort: true },
    attendance: { label: 'attendance (%)', filter: 'number', sort: true },
    attacksUsed: { label: 'attacks used', filter: 'number', sort: true },
    totalStars: { label: 'stars', filter: 'number', sort: true },
    averageStars: { label: 'average stars per attack', filter: 'number', sort: true },
    threeStarRate: { label: '3-star attacks (%)', filter: 'number', sort: true },
    averageDestruction: { label: 'average destruction (%)', filter: 'number', sort: true },
  },
  { sort: 'league', order: 'desc' },
);

export const PLAYER_WARS_TABLE = defineTable<PlayerWarRow>(
  {
    date: { label: 'the end of the war', filter: 'date', sort: true },
    opponent: { label: "the opponent's name", filter: 'text', sort: true },
    result: { label: 'the result', filter: 'select', options: WAR_RESULTS, sort: true },
    mapPosition: { label: 'position in the line-up', sort: true },
    attacks: { label: 'attacks used', filter: 'number', value: (p) => p.attacksUsed, sort: (p) => p.attacksUsed },
    stars: { label: 'stars', filter: 'number', sort: true },
    averageDestruction: {
      label: 'average destruction (%) of the attacks',
      filter: 'number',
      value: (p) => (p.attacksUsed ? p.averageDestruction : null),
      sort: true,
    },
  },
  { sort: 'date', order: 'desc' },
);

const round = (value: number, decimals = 1) => Math.round(value * 10 ** decimals) / 10 ** decimals;
const percentage = (part: number, total: number) => (total > 0 ? round((part / total) * 100) : 0);
const average = (values: number[]) => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0);

interface CocMember {
  tag?: string;
  name?: string;
  role?: string;
  townHallLevel?: number;
  trophies?: number;
  leagueTier?: { id?: number; name?: string; iconUrls?: { small?: string; large?: string } };
}

/**
 * Current members of the main clan, from the Clash of Clans API (kept a minute); from the saved
 * players when the API cannot be read.
 */
async function clanMembers(): Promise<ClanMember[]> {
  const clanTag = env().CLAN_TAG;
  if (!clanTag) return [];
  try {
    const clan = (await liveClan(clanTag)) as { memberList?: CocMember[] } | null;
    const list = (clan?.memberList ?? []).filter((m) => m.tag && m.name);
    return list.map((m) => ({
        tag: m.tag!,
        name: m.name!,
        role: ROLES[m.role ?? ''] ?? 'member',
        townHall: m.townHallLevel ?? 0,
        trophies: m.trophies ?? 0,
        league:
          m.leagueTier?.id && m.leagueTier.name
            ? { id: m.leagueTier.id, name: m.leagueTier.name, iconUrl: m.leagueTier.iconUrls?.large ?? m.leagueTier.iconUrls?.small ?? null }
            : null,
    }));
  } catch (error) {
    console.warn(`[players] member list read from the saved players: ${(error as Error).message}`);
    const saved = await PlayerModel.find({ inClan: true, clanTag: { $in: [clanTag, null] } }).lean();
    return saved.map((p) => ({
      tag: p.tag,
      name: p.name,
      role: ROLES[p.role ?? ''] ?? 'member',
      townHall: p.townHallLevel ?? 0,
      trophies: p.trophies ?? 0,
      league: p.league?.id && p.league.name ? { id: p.league.id, name: p.league.name, iconUrl: p.league.iconUrl ?? null } : null,
    }));
  }
}

/** The last {@link STATS_WINDOW} ended wars of the main clan with players, most recent first. */
export async function statsWindowWars(now = new Date()): Promise<War[]> {
  const clanTag = env().CLAN_TAG;
  return WarModel.find({
    ...(clanTag ? { clanTag } : {}),
    $or: [{ state: 'warEnded' }, { endTime: { $lt: now } }],
    'clan.members.0': { $exists: true },
  })
    .sort({ endTime: -1 })
    .limit(STATS_WINDOW)
    .lean();
}

function warOutcome(war: War): WarOutcome {
  return outcome(
    { stars: war.clan.stars, destruction: war.clan.destructionPercentage },
    { stars: war.opponent.stars, destruction: war.opponent.destructionPercentage },
  );
}

/** The wars of a player among `wars` (most recent first). */
export function playerWars(tag: string, wars: War[]): PlayerWarRow[] {
  const rows: PlayerWarRow[] = [];
  for (const war of wars) {
    const p = war.clan.members.find((m) => m.tag === tag);
    if (!p) continue;
    rows.push({
      warId: war.warKey,
      date: war.endTime.toISOString(),
      opponent: war.opponent.name,
      result: warOutcome(war),
      townHall: p.townhallLevel,
      mapPosition: p.mapPosition,
      attacksUsed: p.attacks.length,
      attacksAvailable: war.attacksPerMember,
      stars: p.attacks.reduce((sum, a) => sum + a.stars, 0),
      averageDestruction: round(average(p.attacks.map((a) => a.destructionPercentage))),
    });
  }
  return rows;
}

function memberStats(member: ClanMember, wars: War[]): MemberStatsRow {
  const played = playerWars(member.tag, wars);
  const attacks = wars.flatMap((w) => w.clan.members.filter((m) => m.tag === member.tag)).flatMap((m) => m.attacks);
  return {
    ...member,
    warsPlayed: played.length,
    warsTotal: wars.length,
    attendance: percentage(played.length, wars.length),
    attacksAvailable: played.reduce((sum, w) => sum + w.attacksAvailable, 0),
    attacksUsed: attacks.length,
    totalStars: attacks.reduce((sum, a) => sum + a.stars, 0),
    averageStars: round(average(attacks.map((a) => a.stars)), 2),
    threeStarRate: percentage(attacks.filter((a) => a.stars === 3).length, attacks.length),
    averageDestruction: round(average(attacks.map((a) => a.destructionPercentage))),
  };
}

function averages(rows: MemberStatsRow[]): MemberStatsAverages | null {
  if (!rows.length) return null;
  const mean = (field: keyof MemberStatsAverages) => average(rows.map((r) => r[field]));
  return {
    townHall: mean('townHall'),
    warsPlayed: mean('warsPlayed'),
    attendance: mean('attendance'),
    attacksUsed: mean('attacksUsed'),
    attacksAvailable: mean('attacksAvailable'),
    totalStars: mean('totalStars'),
    averageStars: mean('averageStars'),
    threeStarRate: mean('threeStarRate'),
    averageDestruction: mean('averageDestruction'),
  };
}

/** `GET /players`: a page of the members with their war statistics. */
export async function listMemberStats(query: TableQuery, now = new Date()): Promise<MemberStatsPage> {
  const [members, wars] = await Promise.all([clanMembers(), statsWindowWars(now)]);
  const rows = members.map((m) => memberStats(m, wars));
  const leagues = new Map<number, string>();
  for (const m of rows) if (m.league) leagues.set(m.league.id, m.league.name);
  return {
    ...queryTable(rows, MEMBER_STATS_TABLE, query),
    summary: {
      members: rows.length,
      warsTotal: wars.length,
      leagues: [...leagues].sort((a, b) => b[0] - a[0]).map(([id, name]) => ({ id, name })),
      averages: averages(filterRows(rows, MEMBER_STATS_TABLE.columns, query.filters)),
    },
  };
}

/** `GET /players/{tag}/wars`: a page of the wars of a player among the last {@link STATS_WINDOW}. */
export async function listPlayerWars(tag: string, query: TableQuery, now = new Date()): Promise<TablePage<PlayerWarRow>> {
  return queryTable(playerWars(tag, await statsWindowWars(now)), PLAYER_WARS_TABLE, query);
}
