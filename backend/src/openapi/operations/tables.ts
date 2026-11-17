import { z } from 'zod';
import { ApiName } from '@/lib/http/api-name';
import { MessageKey as K } from '@/lib/http/message-key';
import { CWL_PLAYERS_TABLE } from '@/modules/cwl/cwl-players.table';
import { CWL_SELECTION_TABLE } from '@/modules/cwl/cwl-selection.table';
import { RAID_MEMBERS_TABLE } from '@/modules/raids/raid-members.table';
import { PERIOD_WARS_TABLE, RANKING_TABLE, rankingOptionsSchema } from '@/modules/wars/history.tables';
import { MEMBER_STATS_TABLE, PLAYER_WARS_TABLE } from '@/modules/wars/member-stats.table';
import { WAR_HISTORY_TABLE } from '@/modules/wars/war-history.table';
import { PARTICIPANTS_TABLE } from '@/modules/wars/war-participants.table';
import {
  CwlPlayersPage,
  MemberStatsPage,
  ParticipantsPage,
  PeriodWarsPage,
  PlayerWarsPage,
  RaidMembersPage,
  RankingPage,
  SelectionPlayersPage,
  WarHistoryPage,
} from '../models/tables';
import { ApiOperation, requestPart } from '../operation';
import { tableQueryPart } from '../table';

/**
 * Tables of the pages, filtered, sorted and paged by the backend. They share the query string
 * described in `src/lib/table/table-query.ts`.
 */
const TABLE_NOTE =
  'Filtered, sorted and paged by the backend: `page` and `limit` (left out: every row), `sort` and `order`, one parameter per filter (all together).';

const periodPath = requestPart(z.object({ period: z.string() }), {
  period: { description: 'Month `YYYY-MM` (Europe/Rome time zone) or `all`.', example: '2026-11' },
});

export const TABLE_OPERATIONS: ApiOperation[] = [
  {
    method: 'GET',
    path: '/wars/history',
    operationId: 'listWarHistory',
    tag: 'Wars',
    summary: 'War history',
    description: `Ended wars of the clan: the saved ones, completed by the summaries of the Clash of Clans war log (read every 5 minutes; its final numbers replace those of the matching saved war). Most recent first by default. ${TABLE_NOTE}`,
    access: 'clan',
    rateLimit: ApiName.TABLES_READ,
    query: tableQueryPart(WAR_HISTORY_TABLE, 'Wars'),
    responses: { 200: { description: 'A page of the history.', result: WarHistoryPage } },
    errors: { 400: [K.INVALID_FIELD] },
  },
  {
    method: 'GET',
    path: '/wars/{warKey}/participants',
    operationId: 'listWarParticipants',
    tag: 'Wars',
    summary: 'Players of a war',
    description: `The clan's players in a war with their attacks. A war not ended yet is read from the Clash of Clans API (every 30 seconds at most) while it is the clan's current war. By map position by default. ${TABLE_NOTE}`,
    access: 'clan',
    rateLimit: ApiName.TABLES_READ,
    params: requestPart(z.object({ warKey: z.string() }), {
      warKey: { description: 'War id, `YYYYMMDDTHHMMSS-OPPONENTTAG` (preparation start in UTC).', example: '20261104T100000-OPP999' },
    }),
    query: tableQueryPart(PARTICIPANTS_TABLE, 'Players'),
    responses: { 200: { description: 'A page of the players of the war.', result: ParticipantsPage } },
    errors: { 400: [K.INVALID_FIELD], 404: [K.WAR_NOT_FOUND] },
  },
  {
    method: 'GET',
    path: '/players',
    operationId: 'listMemberStats',
    tag: 'Players',
    summary: 'Members and their war statistics',
    description: `Current members of the clan (from the Clash of Clans API, read every minute at most; from the saved players when it cannot be reached) with their statistics over the last 20 wars with players. Highest league first by default. ${TABLE_NOTE}`,
    access: 'clan',
    rateLimit: ApiName.TABLES_READ,
    query: tableQueryPart(MEMBER_STATS_TABLE, 'Members'),
    responses: { 200: { description: 'A page of the members.', result: MemberStatsPage } },
    errors: { 400: [K.INVALID_FIELD] },
  },
  {
    method: 'GET',
    path: '/players/{tag}/wars',
    operationId: 'listPlayerWars',
    tag: 'Players',
    summary: 'Wars of a player',
    description: `A player's performance in each of the last 20 wars of the clan with players in which they were lined up. Most recent first by default. ${TABLE_NOTE}`,
    access: 'clan',
    rateLimit: ApiName.TABLES_READ,
    params: requestPart(z.object({ tag: z.string() }), {
      tag: { description: 'Player tag, `#` encoded as `%23` or left out; case-insensitive.', example: '%23ABC123' },
    }),
    query: tableQueryPart(PLAYER_WARS_TABLE, 'Wars'),
    responses: { 200: { description: 'A page of the wars of the player.', result: PlayerWarsPage } },
    errors: { 400: [K.INVALID_FIELD, K.PLAYER_TAG_IS_NOT_VALID] },
  },
  {
    method: 'GET',
    path: '/history/{period}/ranking',
    operationId: 'listHistoryRanking',
    tag: 'History',
    summary: 'Ranking of a period',
    description: `Players of the wars of a period, by average stars per war (then average destruction, participation and wars played): \`rank\` is the position in the whole ranking of the players chosen by \`minWars\` and \`currentMembersOnly\`, before the filters. ${TABLE_NOTE}`,
    access: 'clan',
    rateLimit: ApiName.TABLES_READ,
    params: periodPath,
    query: tableQueryPart(RANKING_TABLE, 'Players', {
      schema: RANKING_TABLE.schema.extend(rankingOptionsSchema.shape),
      fields: {
        minWars: { description: 'Only the players with at least this many wars in the period (default 1).', example: 3 },
        currentMembersOnly: '`true`: only the players now in a clan of the Crusade (default `false`).',
      },
    }),
    responses: { 200: { description: 'A page of the ranking.', result: RankingPage } },
    errors: { 400: [K.INVALID_FIELD, K.PERIOD_IS_NOT_VALID], 404: [K.HISTORY_NOT_FOUND] },
  },
  {
    method: 'GET',
    path: '/history/{period}/wars',
    operationId: 'listHistoryWars',
    tag: 'History',
    summary: 'Wars of a period',
    description: `Ended wars of a period, without their players. Most recent first by default. ${TABLE_NOTE}`,
    access: 'clan',
    rateLimit: ApiName.TABLES_READ,
    params: periodPath,
    query: tableQueryPart(PERIOD_WARS_TABLE, 'Wars'),
    responses: { 200: { description: 'A page of the wars of the period.', result: PeriodWarsPage } },
    errors: { 400: [K.INVALID_FIELD, K.PERIOD_IS_NOT_VALID], 404: [K.HISTORY_NOT_FOUND] },
  },
  {
    method: 'GET',
    path: '/cwl/seasons/{season}/players',
    operationId: 'listCwlSeasonPlayers',
    tag: 'CWL',
    summary: 'Players of a CWL season',
    description: `The clan's players in a Clan War League season, over the clan's war of each round (a war in preparation does not count). Most stars first by default. ${TABLE_NOTE}`,
    access: 'clan',
    rateLimit: ApiName.TABLES_READ,
    params: requestPart(z.object({ season: z.string() }), { season: { description: 'Season, `YYYY-MM`.', example: '2026-11' } }),
    query: tableQueryPart(CWL_PLAYERS_TABLE, 'Players'),
    responses: { 200: { description: 'A page of the players of the season.', result: CwlPlayersPage } },
    errors: { 400: [K.INVALID_FIELD], 404: [K.CWL_SEASON_NOT_FOUND] },
  },
  {
    method: 'GET',
    path: '/cwl/selection/players',
    operationId: 'listCwlSelectionPlayers',
    tag: 'CWL',
    summary: 'Ranking of the CWL line-up',
    description: `The players of \`GET /cwl/selection\` as a table. Best first by default. ${TABLE_NOTE}`,
    access: 'leader',
    rateLimit: ApiName.TABLES_READ,
    query: tableQueryPart(CWL_SELECTION_TABLE, 'Players'),
    responses: { 200: { description: 'A page of the ranking.', result: SelectionPlayersPage } },
    errors: { 400: [K.INVALID_FIELD] },
  },
  {
    method: 'GET',
    path: '/raids/seasons/{startTime}/members',
    operationId: 'listRaidMembers',
    tag: 'Raids',
    summary: 'Members of a Raid Weekend',
    description: `Members of the clan who attacked in a Raid Weekend: from the saved weekend, or from the Clash of Clans API when it was not saved. Most Capital Gold looted first by default. ${TABLE_NOTE}`,
    access: 'clan',
    rateLimit: ApiName.TABLES_READ,
    params: requestPart(z.object({ startTime: z.string() }), {
      startTime: { description: 'Start of the weekend (ISO 8601), URL-encoded.', example: '2026-11-06T07:00:00.000Z' },
    }),
    query: tableQueryPart(RAID_MEMBERS_TABLE, 'Members'),
    responses: { 200: { description: 'A page of the members of the weekend.', result: RaidMembersPage } },
    errors: { 400: [K.INVALID_FIELD], 404: [K.RAID_SEASON_NOT_FOUND] },
  },
];
