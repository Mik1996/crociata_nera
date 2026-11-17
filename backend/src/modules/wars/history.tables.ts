import { z } from 'zod';
import { defineTable, queryTable, TablePage, TableQuery } from '@/lib/table/table-query';
import { crusadeMemberTags } from '@/modules/access/clan-access.service';
import { getPeriod, HistoryPlayerStats, HistoryWar } from './history.service';
import { WAR_RESULTS } from './war-history.table';

/**
 * Tables of the Statistics page: the ranking of the players of a period
 * (`GET /history/{period}/ranking`) and its wars (`GET /history/{period}/wars`).
 */

/** Ranking row: the player's stats, the position in the whole ranking and current membership. */
export interface RankingRow extends HistoryPlayerStats {
  rank: number;
  /** In a clan of the Crusade now (always `true` when the member lists cannot be read). */
  isCurrentMember: boolean;
}

/** A war of the period, without its players. */
export type PeriodWarRow = Omit<HistoryWar, 'players'>;

export const RANKING_TABLE = defineTable<RankingRow>(
  {
    rank: { label: 'position in the ranking', sort: true },
    townHall: { label: 'town hall level', filter: 'number', sort: true },
    name: { label: "the player's name or tag", filter: 'text', value: (r) => [r.name, r.tag], sort: (r) => r.name },
    wars: { label: 'wars played', filter: 'number', sort: true },
    attacksUsed: { label: 'attacks used', filter: 'number', sort: true },
    stars: { label: 'stars', filter: 'number', sort: true },
    averageStarsPerWar: { label: 'average stars per war', filter: 'number', sort: true },
    averageStarsPerAttack: { label: 'average stars per attack', filter: 'number', sort: true },
    threeStarRate: { label: '3-star attacks (%)', filter: 'number', sort: true },
    averageDestruction: {
      label: 'average destruction (%) of the attacks',
      filter: 'number',
      value: (r) => (r.attacksUsed ? r.averageDestruction : null),
      sort: true,
    },
    averageStarsConceded: { label: 'average stars conceded per war', filter: 'number', sort: true },
  },
  { sort: 'averageStarsPerWar', order: 'desc' },
);

/** Parameters of the ranking besides the table's: they change who is ranked, so the positions too. */
export const rankingOptionsSchema = z.object({
  minWars: z.coerce.number().int().min(1).max(100).default(1),
  currentMembersOnly: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export const PERIOD_WARS_TABLE = defineTable<PeriodWarRow>(
  {
    date: { label: 'the end of the war', filter: 'date', value: (w) => w.endTime, sort: (w) => w.endTime },
    opponent: { label: "the opponent's name or tag", filter: 'text', value: (w) => [w.opponent, w.opponentTag], sort: (w) => w.opponent },
    size: { label: 'players per side', filter: 'number', value: (w) => w.teamSize, sort: (w) => w.teamSize },
    result: { label: 'the result', filter: 'select', options: WAR_RESULTS, sort: true },
    stars: { label: 'stars of the clan', filter: 'number', sort: true },
    destruction: { label: 'destruction by the clan (%)', filter: 'number', sort: true },
  },
  { sort: 'date', order: 'desc' },
);

/** Current members of the clans of the Crusade; `null` when the lists cannot be read. */
async function memberTags(): Promise<Set<string> | null> {
  try {
    return await crusadeMemberTags();
  } catch {
    return null;
  }
}

/**
 * `GET /history/{period}/ranking`: a page of the ranking of a period, among the players with at
 * least `minWars` wars (and in a clan of the Crusade now, with `currentMembersOnly`).
 */
export async function listRanking(
  period: string,
  options: { minWars: number; currentMembersOnly: boolean },
  query: TableQuery,
): Promise<TablePage<RankingRow>> {
  const [{ players }, members] = await Promise.all([getPeriod(period), memberTags()]);
  const isMember = (tag: string) => !members || members.has(tag.toUpperCase());
  const rows = players
    .filter((p) => p.wars >= options.minWars)
    .filter((p) => !options.currentMembersOnly || isMember(p.tag))
    .map((p, i) => ({ ...p, rank: i + 1, isCurrentMember: isMember(p.tag) }));
  return queryTable(rows, RANKING_TABLE, query);
}

/** `GET /history/{period}/wars`: a page of the wars of a period. */
export async function listPeriodWars(period: string, query: TableQuery): Promise<TablePage<PeriodWarRow>> {
  const { wars } = await getPeriod(period);
  const rows = wars.map(({ players: _players, ...war }) => war);
  return queryTable(rows, PERIOD_WARS_TABLE, query);
}
