import { env } from '@/lib/config/env';
import { throwException } from '@/lib/http/api-error';
import { MessageKey } from '@/lib/http/message-key';
import { defineTable, queryTable, TablePage, TableQuery } from '@/lib/table/table-query';
import { CwlSeasonModel } from './cwl.model';

/**
 * Players of the main clan in a Clan War League season (`GET /cwl/seasons/{season}/players`),
 * over the clan's war of each round: same rules as the frontend's CWL page (`buildCwlSeason`).
 */

export interface CwlPlayerRow {
  /** Position in the whole list (most stars first, then average stars). */
  index: number;
  tag: string;
  name: string;
  townHall: number;
  /** Wars in the line-up already started (= attacks available so far). */
  wars: number;
  attacks: number;
  stars: number;
  threeStars: number;
  /** Stars per attack used. */
  averageStars: number;
  /** Average destruction per attack used. */
  averageDestruction: number;
}

export const CWL_PLAYERS_TABLE = defineTable<CwlPlayerRow>(
  {
    index: { label: 'position in the list', sort: true },
    townHall: { label: 'town hall level', filter: 'number', sort: true },
    name: { label: "the player's name or tag", filter: 'text', value: (p) => [p.name, p.tag], sort: (p) => p.name },
    attacks: { label: 'attacks', filter: 'number', sort: true },
    stars: { label: 'stars', filter: 'number', sort: true },
    averageStars: { label: 'average stars per attack', filter: 'number', sort: true },
    threeStars: { label: '3-star attacks', filter: 'number', sort: true },
    destruction: { label: 'average destruction (%)', filter: 'number', value: (p) => p.averageDestruction, sort: (p) => p.averageDestruction },
  },
  { sort: 'index', order: 'asc' },
);

/** Placeholder of the API for wars not scheduled yet. */
const UNSCHEDULED = '#0';

interface LeagueWarMember {
  tag: string;
  name: string;
  townhallLevel?: number;
  attacks?: { stars: number; destructionPercentage: number }[];
}
interface LeagueWarSide {
  tag: string;
  members?: LeagueWarMember[];
}
interface LeagueWar {
  state?: string;
  clan?: LeagueWarSide;
  opponent?: LeagueWarSide;
}

const round = (value: number, decimals = 1) => Math.round(value * 10 ** decimals) / 10 ** decimals;

/** The players of the clan in a season, most stars first. */
export function cwlPlayerRows(
  season: { clanTag: string; rounds: { warTags: string[] }[]; wars: { warTag: string; war: unknown }[] },
): CwlPlayerRow[] {
  const wars = new Map(season.wars.map((w) => [w.warTag, w.war as LeagueWar]));
  const players = new Map<string, Omit<CwlPlayerRow, 'index' | 'averageStars' | 'averageDestruction'> & { destruction: number }>();
  for (const round of season.rounds) {
    const war = round.warTags
      .filter((tag) => tag !== UNSCHEDULED)
      .map((tag) => wars.get(tag))
      .find((w) => w?.clan?.tag === season.clanTag || w?.opponent?.tag === season.clanTag);
    // In preparation nobody can attack yet: the war is not an attack available.
    if (!war || war.state === 'preparation') continue;
    const side = war.clan?.tag === season.clanTag ? war.clan : war.opponent;
    for (const m of side?.members ?? []) {
      const p = players.get(m.tag) ?? { tag: m.tag, name: m.name, townHall: 0, wars: 0, attacks: 0, stars: 0, threeStars: 0, destruction: 0 };
      p.name = m.name;
      p.townHall = m.townhallLevel ?? 0;
      p.wars += 1;
      for (const a of m.attacks ?? []) {
        p.attacks += 1;
        p.stars += a.stars;
        p.destruction += a.destructionPercentage;
        if (a.stars === 3) p.threeStars += 1;
      }
      players.set(m.tag, p);
    }
  }
  return [...players.values()]
    .map(({ destruction, ...p }) => ({
      ...p,
      averageStars: p.attacks ? round(p.stars / p.attacks, 2) : 0,
      averageDestruction: p.attacks ? round(destruction / p.attacks, 1) : 0,
    }))
    .sort((a, b) => b.stars - a.stars || b.averageStars - a.averageStars)
    .map((p, i) => ({ index: i + 1, ...p }));
}

/** `GET /cwl/seasons/{season}/players`: a page of the clan's players in a season; 404 for a season not saved. */
export async function listCwlPlayers(season: string, query: TableQuery): Promise<TablePage<CwlPlayerRow>> {
  const clanTag = env().CLAN_TAG;
  const doc = await CwlSeasonModel.findOne({ ...(clanTag ? { clanTag } : {}), season }).lean();
  if (!doc) throwException(404, MessageKey.CWL_SEASON_NOT_FOUND);
  return queryTable(cwlPlayerRows(doc), CWL_PLAYERS_TABLE, query);
}
