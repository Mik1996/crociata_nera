import { CRUSADE_CLAN_NAMES } from '@/lib/coc/crusade-clans';
import { defineTable, queryTable, TablePage, TableQuery } from '@/lib/table/table-query';
import { SelectionRow, SelectionStatus } from './cwl-selection.rules';
import { getCwlSelection } from './cwl-selection.service';

/** Ranking of the CWL line-up as a table (`GET /cwl/selection/players`). */

export const SELECTION_STATUSES: readonly SelectionStatus[] = ['starter', 'reserve', 'bench', 'ineligible', 'excluded'];

export const CWL_SELECTION_TABLE = defineTable<SelectionRow>(
  {
    rank: { label: 'position in the ranking', sort: true },
    townHall: { label: 'town hall level', filter: 'number', value: (p) => p.townHallLevel, sort: (p) => p.townHallLevel },
    name: {
      label: "the player's name or tag, or the name of their clan",
      filter: 'text',
      value: (p) => [p.name, p.tag, CRUSADE_CLAN_NAMES[p.clanTag] ?? p.clanTag],
      sort: (p) => p.name,
    },
    status: { label: 'the place in the line-up', filter: 'select', options: SELECTION_STATUSES, sort: true },
    score: { label: 'score', filter: 'number', sort: true },
    cwl: { label: 'the player was in the line-up of the last CWL', filter: 'boolean', value: (p) => p.cwl !== null },
    war: {
      label: 'average stars per attack in the regular wars',
      filter: 'number',
      value: (p) => (p.war.wars ? p.war.averageStarsPerAttack : null),
      sort: (p) => (p.war.wars ? p.war.averageStarsPerAttack : null),
    },
    heroes: { label: 'hero levels (% of the highest)', filter: 'number', value: (p) => p.heroes?.levels, sort: (p) => p.heroes?.levels },
  },
  { sort: 'rank', order: 'asc' },
);

/** `GET /cwl/selection/players`: a page of the ranking of a selection (the open one by default). */
export async function listSelectionPlayers(query: TableQuery, season?: string): Promise<TablePage<SelectionRow>> {
  return queryTable((await getCwlSelection(season)).players, CWL_SELECTION_TABLE, query);
}
