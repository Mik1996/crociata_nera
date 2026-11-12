import { z } from 'zod';
import { ApiName } from '@/lib/http/api-name';
import { MessageKey as K } from '@/lib/http/message-key';
import { listCwlSeasonsQuerySchema } from '@/modules/cwl/cwl.schemas';
import { listDonationSeasonsQuerySchema } from '@/modules/donations/donations.schemas';
import { listRaidSeasonsQuerySchema } from '@/modules/raids/raids.schemas';
import { ClanRecords, PlayerRecord } from '../models/players';
import { CwlSeasonDetail, CwlSeasonSummary, DonationSeason, RaidSeason } from '../models/seasons';
import { ApiOperation, requestPart } from '../operation';

export const CLAN_OPERATIONS: ApiOperation[] = [
  {
    method: 'GET',
    path: '/cwl/seasons',
    operationId: 'listCwlSeasons',
    tag: 'CWL',
    summary: 'List Clan War League seasons',
    description: 'Saved Clan War League seasons, most recent first.',
    access: 'clan',
    rateLimit: ApiName.WARS_READ,
    query: requestPart(listCwlSeasonsQuerySchema, { limit: 'Most seasons returned, 1–36 (default 12).' }),
    responses: { 200: { description: 'Saved seasons.', result: z.array(CwlSeasonSummary) } },
  },
  {
    method: 'GET',
    path: '/cwl/seasons/{season}',
    operationId: 'getCwlSeason',
    tag: 'CWL',
    summary: 'Get a Clan War League season',
    description:
      'The group (8 clans, 7 rounds) and every war of a season, in the formats of the Clash of Clans API: standings and player statistics stay available after the API forgets the season.',
    access: 'clan',
    rateLimit: ApiName.WARS_READ,
    params: requestPart(z.object({ season: z.string() }), {
      season: { description: 'Season, `YYYY-MM`.', example: '2026-11' },
    }),
    responses: { 200: { description: 'The season.', result: CwlSeasonDetail } },
    errors: { 404: [K.CWL_SEASON_NOT_FOUND] },
  },
  {
    method: 'GET',
    path: '/raids/seasons',
    operationId: 'listRaidSeasons',
    tag: 'Raids',
    summary: 'List Raid Weekends',
    description:
      'Saved Raid Weekends, most recent first, in the format of `GET /clans/{tag}/capitalraidseasons`, with the members also for past weekends.',
    access: 'clan',
    rateLimit: ApiName.WARS_READ,
    query: requestPart(listRaidSeasonsQuerySchema, { limit: 'Most weekends returned, 1–52 (default 10).' }),
    responses: { 200: { description: 'Saved weekends.', result: z.array(RaidSeason) } },
  },
  {
    method: 'GET',
    path: '/donations/seasons',
    operationId: 'listDonationSeasons',
    tag: 'Donations',
    summary: 'List donations by season',
    description:
      'Game seasons, most recent first (the one in progress included), with the troops donated by each player as counted by the backend.',
    access: 'clan',
    rateLimit: ApiName.WARS_READ,
    query: requestPart(listDonationSeasonsQuerySchema, { limit: 'Most seasons returned, 1–36 (default 12).' }),
    responses: { 200: { description: 'Seasons with their donations.', result: z.array(DonationSeason) } },
  },
  {
    method: 'GET',
    path: '/players/{tag}',
    operationId: 'getPlayer',
    tag: 'Players',
    summary: 'Get a player',
    description:
      'A saved player of the clan (current or former) with the data last read from Clash of Clans and the commendations earned.',
    access: 'clan',
    rateLimit: ApiName.WARS_READ,
    params: requestPart(z.object({ tag: z.string() }), {
      tag: { description: 'Player tag with `#` encoded as `%23`.', example: '%23ABC123' },
    }),
    responses: { 200: { description: 'The player.', result: PlayerRecord } },
    errors: { 404: [K.PLAYER_NOT_FOUND] },
  },
  {
    method: 'GET',
    path: '/clan/records',
    operationId: 'getClanRecords',
    tag: 'Clan',
    summary: 'Get the clan records',
    description:
      'All-time records of the clan: perfect wars, win streak, highest Clan War League, best positions in the country rankings, most Clan Capital trophies. Public: shown on the welcome page.',
    access: 'public',
    rateLimit: ApiName.CLAN_RECORDS,
    responses: { 200: { description: 'The records.', result: ClanRecords } },
  },
];
