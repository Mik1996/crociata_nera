import { CwlSelectionPlayer, CwlSelectionStatus } from '../../../core/backend/backend-api.types';
import { SISTER_CLANS } from '../../../core/config/sister-clans';
import {
    ClanRole,
    CwlPlayerRow,
    MemberStatsRow,
    ParticipantsSummary,
    PeriodWarRow,
    RaidMemberRow,
    RankingRow,
    WarHistoryRow,
    WarPerformance,
} from '../../../core/models';
import { ParticipantRow } from '../../../core/utils/war-stats';
import { CLAN_ROLES, resultKey, roleKey, WAR_RESULTS } from '../../labels';
import { TableFilters } from './table-filters';

/**
 * Filters of the tables whose rows come from the backend, by table: the pages show them, the
 * backend applies them (same column ids and types as its `lib/table` definitions). The `value`
 * readers and the sort keys serve the demo data (`npm run start:mock`), filtered in the browser.
 */

type SortKey<T> = (row: T, column: string) => string | number | null | undefined;
const byColumn = <T>(row: T, column: string) =>
  (row as Record<string, unknown>)[column] as string | number;

export const WAR_HISTORY_FILTERS: TableFilters<WarHistoryRow> = {
  date: { type: 'date' },
  opponent: {
    type: 'text',
    value: (r) => [r.opponent, r.opponentTag],
    placeholder: 'history.searchPlaceholder',
  },
  teamSize: { type: 'number' },
  result: {
    type: 'select',
    options: WAR_RESULTS.map((r) => ({ value: r, label: resultKey(r) })),
  },
  stars: { type: 'number' },
  destruction: { type: 'number' },
};

const ROLE_ORDER: Record<ClanRole, number> = { leader: 0, coLeader: 1, elder: 2, member: 3 };

/** The league filter offers the leagues of the members, highest first (sent by the backend). */
export function memberStatsFilters(
  leagues: readonly { id: number; name: string }[],
): TableFilters<MemberStatsRow> {
  return {
    league: {
      type: 'select',
      value: (m) => m.league?.name,
      options: leagues.map(({ name }) => ({ value: name, label: name })),
    },
    townHall: { type: 'number' },
    name: { type: 'text', value: (m) => [m.name, m.tag], placeholder: 'common.nameOrTag' },
    role: {
      type: 'select',
      options: CLAN_ROLES.map((r) => ({ value: r, label: roleKey(r) })),
    },
    warsPlayed: { type: 'number' },
    attendance: { type: 'number' },
    attacksUsed: { type: 'number' },
    totalStars: { type: 'number' },
    averageStars: { type: 'number' },
    threeStarRate: { type: 'number' },
    averageDestruction: { type: 'number' },
    defenses: { type: 'number' },
    averageStarsConceded: { type: 'number' },
    threeStarsConcededRate: { type: 'number' },
    averageDestructionConceded: { type: 'number' },
  };
}

/**
 * League order: league ids grow from Unranked to the top Legend tier; within the same league the
 * trophies decide. Role: leader first, then the highest town hall.
 */
export const memberStatsSortKey: SortKey<MemberStatsRow> = (m, column) =>
  column === 'league'
    ? (m.league?.id ?? 0) * 1_000_000 + m.trophies
    : column === 'role'
      ? ROLE_ORDER[m.role] * 100 - m.townHall
      : byColumn(m, column);

export const PLAYER_WARS_FILTERS: TableFilters<WarPerformance> = {
  date: { type: 'date' },
  opponent: { type: 'text' },
  result: {
    type: 'select',
    options: WAR_RESULTS.map((r) => ({ value: r, label: resultKey(r) })),
  },
  attacks: { type: 'number', value: (p) => p.attacksUsed },
  stars: { type: 'number' },
  averageDestruction: {
    type: 'number',
    value: (p) => (p.attacksUsed ? p.averageDestruction : null),
  },
};

/** The town hall filter offers the town halls of the war (sent by the backend). */
export function participantFilters(
  summary: ParticipantsSummary | undefined,
): TableFilters<ParticipantRow> {
  return {
    townHall: {
      type: 'select',
      options: (summary?.townHalls ?? []).map((th) => ({
        value: th,
        label: 'common.townHallN',
        params: { n: th },
      })),
    },
    name: { type: 'text', value: (r) => [r.name, r.tag], placeholder: 'common.nameOrTag' },
    // Yes: has attacked at least once.
    attacks: { type: 'boolean', value: (r) => r.hasAttacked },
    stars: { type: 'number' },
    averageDestruction: {
      type: 'number',
      value: (r) => (r.hasAttacked ? r.averageDestruction : null),
    },
  };
}

export const participantSortKey: SortKey<ParticipantRow> = (r, column) =>
  column === 'attacks' ? r.attacksUsed : byColumn(r, column);

export const RANKING_FILTERS: TableFilters<RankingRow> = {
  townHall: { type: 'number' },
  name: { type: 'text', value: (r) => [r.name, r.tag], placeholder: 'common.nameOrTag' },
  wars: { type: 'number' },
  attacksUsed: { type: 'number' },
  stars: { type: 'number' },
  averageStarsPerWar: { type: 'number' },
  averageStarsPerAttack: { type: 'number' },
  threeStarRate: { type: 'number' },
  averageDestruction: {
    type: 'number',
    value: (r) => (r.attacksUsed ? r.averageDestruction : null),
  },
  averageStarsConceded: { type: 'number' },
};

export const PERIOD_WARS_FILTERS: TableFilters<PeriodWarRow> = {
  date: { type: 'date', value: (w) => w.endTime },
  opponent: {
    type: 'text',
    value: (w) => [w.opponent, w.opponentTag],
    placeholder: 'history.searchPlaceholder',
  },
  size: { type: 'number', value: (w) => w.teamSize },
  result: {
    type: 'select',
    options: WAR_RESULTS.map((r) => ({ value: r, label: resultKey(r) })),
  },
  stars: { type: 'number' },
  destruction: { type: 'number' },
};

export const periodWarsSortKey: SortKey<PeriodWarRow> = (w, column) =>
  column === 'date' ? w.endTime : column === 'size' ? w.teamSize : byColumn(w, column);

export const CWL_PLAYER_FILTERS: TableFilters<CwlPlayerRow> = {
  townHall: { type: 'number' },
  name: { type: 'text', value: (p) => [p.name, p.tag], placeholder: 'common.nameOrTag' },
  attacks: { type: 'number' },
  stars: { type: 'number' },
  averageStars: { type: 'number' },
  threeStars: { type: 'number' },
  destruction: { type: 'number', value: (p) => p.averageDestruction },
};

export const RAID_MEMBER_FILTERS: TableFilters<RaidMemberRow> = {
  name: { type: 'text', value: (m) => [m.name, m.tag], placeholder: 'common.nameOrTag' },
  attacks: { type: 'number' },
  looted: { type: 'number' },
};

const SELECTION_STATUSES: readonly CwlSelectionStatus[] = [
  'starter',
  'reserve',
  'bench',
  'ineligible',
  'excluded',
];

/** The text filter also finds the name of the player's clan. */
export function selectionFilters(
  clanName: (tag: string) => string,
): TableFilters<CwlSelectionPlayer> {
  return {
    townHall: { type: 'number', value: (p) => p.townHallLevel },
    name: {
      type: 'text',
      value: (p) => [p.name, p.tag, clanName(p.clanTag)],
      placeholder: 'cwlSelection.searchPlaceholder',
    },
    status: {
      type: 'select',
      options: SELECTION_STATUSES.map((s) => ({ value: s, label: `cwlSelection.statuses.${s}` })),
    },
    score: { type: 'number' },
    cwl: { type: 'boolean', value: (p) => p.cwl !== null },
    war: { type: 'number', value: (p) => (p.war.wars ? p.war.averageStarsPerAttack : null) },
    heroes: { type: 'number', value: (p) => p.heroes?.levels },
  };
}

/** Names of the clans of the Crusade by tag. */
export function crusadeClanNames(main: { tag: string; name: string }): Map<string, string> {
  return new Map<string, string>([
    [main.tag, main.name],
    ...SISTER_CLANS.map((c) => [c.tag, c.name] as [string, string]),
  ]);
}
