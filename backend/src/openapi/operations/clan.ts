import { z } from 'zod';
import { ApiName } from '@/lib/http/api-name';
import { MessageKey as K } from '@/lib/http/message-key';
import { listCwlSeasonsQuerySchema } from '@/modules/cwl/cwl.schemas';
import { listDonationSeasonsQuerySchema } from '@/modules/donations/donations.schemas';
import { listRaidSeasonsQuerySchema } from '@/modules/raids/raids.schemas';
import { ClanRecords, PlayerRecord } from '../models/players';
import { CwlSeasonDetail, CwlSeasonSummary, DonationSeason, RaidSeason } from '../models/seasons';
import { excludePlayerSchema } from '@/modules/cwl/cwl-selection.schemas';
import { CwlExclusionResult, CwlSelection } from '../models/selection';
import { ApiOperation, requestPart } from '../operation';

const exclusionPath = requestPart(z.object({ tag: z.string() }), {
  tag: { description: 'Player tag without `#` (or with `#` encoded as `%23`).', example: 'ABC123' },
});

export const CLAN_OPERATIONS: ApiOperation[] = [
  {
    method: 'GET',
    path: '/cwl/selection',
    operationId: 'getCwlSelection',
    tag: 'CWL',
    summary: 'Rank the members for the Clan War League line-up',
    description:
      'Current members of the main clan ranked to pick the Clan War League line-up (on equal score: higher town hall, then higher role): 15 starters and 3 reserves among the eligible players (town hall at most one level below the highest of the clan, not excluded by an administrator). Score out of 100: last CWL, fought in any clan of the Crusade (commendations up to 12, stars and destruction up to 13); regular wars of the last 90 days in any clan of the Crusade (up to 40, or 65 for who was not in the last CWL); hero levels and equipment (up to 25); highest town hall (10). Penalties for league attacks missed in the last CWL (up to -15) and new arrivals (-5). Excluded players keep their place and take no slot.',
    access: 'leader',
    rateLimit: ApiName.WARS_READ,
    responses: { 200: { description: 'The ranking.', result: CwlSelection } },
  },
  {
    method: 'PUT',
    path: '/cwl/selection/exclusions/{tag}',
    operationId: 'excludeCwlPlayer',
    tag: 'CWL',
    summary: 'Exclude a player from the CWL line-up',
    description:
      'Excludes a current member of the clan from the Clan War League line-up, with an optional reason (excluding again replaces it). The player stays in the ranking, marked as excluded, and takes no slot.',
    access: 'admin',
    rateLimit: ApiName.ADMIN,
    params: exclusionPath,
    body: requestPart(excludePlayerSchema, { reason: { description: 'Why the player is excluded (at most 200 characters).', example: 'Away for the whole season' } }),
    responses: { 200: { description: 'The exclusion.', result: CwlExclusionResult, messages: [K.PLAYER_EXCLUDED] } },
    errors: { 400: [K.PLAYER_TAG_IS_NOT_VALID, K.EXCLUSION_REASON_IS_TOO_LONG], 404: [K.PLAYER_NOT_FOUND] },
  },
  {
    method: 'DELETE',
    path: '/cwl/selection/exclusions/{tag}',
    operationId: 'readmitCwlPlayer',
    tag: 'CWL',
    summary: 'Take a player back into the CWL line-up',
    description: 'Removes the exclusion of a player; nothing changes if the player was not excluded.',
    access: 'admin',
    rateLimit: ApiName.ADMIN,
    params: exclusionPath,
    responses: { 200: { description: 'The player is no longer excluded.', result: null, messages: [K.PLAYER_READMITTED] } },
    errors: { 400: [K.PLAYER_TAG_IS_NOT_VALID] },
  },
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
