import { z } from 'zod';
import { ApiName } from '@/lib/http/api-name';
import { MessageKey as K } from '@/lib/http/message-key';
import { CocClan, CocPlayer, CocWarLogEntry, Membership, Welcome } from '../models/coc';
import { CocWar } from '../models/wars';
import { ApiOperation, requestPart } from '../operation';

/**
 * Clash of Clans data the pages read through the backend: the frontend never calls the official
 * API. Responses are kept in memory for a while, so the API is not called at every request.
 */
const LIVE_NOTE = 'Read from the Clash of Clans API and kept in memory for a while';

export const COC_OPERATIONS: ApiOperation[] = [
  {
    method: 'GET',
    path: '/clan',
    operationId: 'getClan',
    tag: 'Clan',
    summary: 'Get the clan',
    description: `The clan with its members, in the format of \`GET /clans/{tag}\` of the Clash of Clans API. ${LIVE_NOTE} (1 minute).`,
    access: 'clan',
    rateLimit: ApiName.COC_READ,
    responses: { 200: { description: 'The clan.', result: CocClan } },
    errors: { 404: [K.NOT_FOUND], 502: [K.COC_API_UNAVAILABLE] },
  },
  {
    method: 'GET',
    path: '/wars/current',
    operationId: 'getCurrentWar',
    tag: 'Wars',
    summary: 'Get the war in progress',
    description: `The clan's war in progress (or in preparation, or just ended) in the \`currentwar\` format of the Clash of Clans API; \`null\` when the clan is not at war or its war log is private. ${LIVE_NOTE} (30 seconds).`,
    access: 'clan',
    rateLimit: ApiName.COC_READ,
    responses: { 200: { description: 'The war, or `null`.', result: CocWar.nullable() } },
    errors: { 404: [K.NOT_FOUND], 502: [K.COC_API_UNAVAILABLE] },
  },
  {
    method: 'GET',
    path: '/wars/warlog',
    operationId: 'getWarLog',
    tag: 'Wars',
    summary: 'Get the war log',
    description: `Summaries of the clan's wars as \`GET /clans/{tag}/warlog\` lists them (final result, stars, clan XP), also for the wars fought before the backend saved them; empty when the war log is private. ${LIVE_NOTE} (5 minutes).`,
    access: 'clan',
    rateLimit: ApiName.COC_READ,
    responses: { 200: { description: 'The war log, most recent first.', result: z.array(CocWarLogEntry) } },
    errors: { 404: [K.NOT_FOUND], 502: [K.COC_API_UNAVAILABLE] },
  },
  {
    method: 'GET',
    path: '/players/{tag}/profile',
    operationId: 'getPlayerProfile',
    tag: 'Players',
    summary: "Get a player's game profile",
    description: `Heroes, troops, spells, achievements… of a player, as \`GET /players/{tag}\` of the Clash of Clans API returns them. ${LIVE_NOTE} (10 minutes).`,
    access: 'clan',
    rateLimit: ApiName.COC_READ,
    params: requestPart(z.object({ tag: z.string() }), {
      tag: { description: 'Player tag, `#` encoded as `%23` or left out; case-insensitive.', example: '%23ABC123' },
    }),
    responses: { 200: { description: 'The player.', result: CocPlayer } },
    errors: { 400: [K.PLAYER_TAG_IS_NOT_VALID], 404: [K.PLAYER_NOT_FOUND], 502: [K.COC_API_UNAVAILABLE] },
  },
  {
    method: 'GET',
    path: '/auth/me/memberships',
    operationId: 'getMemberships',
    tag: 'Account',
    summary: "The clans the user's accounts are in",
    description: `Which of the signed-in user's linked accounts are in a clan of the Crusade now, with their name and role (a clan that cannot be read is left out). ${LIVE_NOTE} (1 minute).`,
    access: 'user',
    rateLimit: ApiName.ME,
    responses: { 200: { description: 'The accounts in a clan of the Crusade.', result: z.array(Membership) } },
  },
  {
    method: 'GET',
    path: '/welcome',
    operationId: 'getWelcome',
    tag: 'Clan',
    summary: 'Public data of the welcome page',
    description: `What the welcome page, the "Join us" page and the badge in the header show of the clans of the Crusade (members by name and role only) and the main clan's positions in the trophy rankings. ${LIVE_NOTE} (1 minute; rankings 10 minutes).`,
    access: 'public',
    rateLimit: ApiName.WELCOME,
    database: false,
    responses: { 200: { description: 'The clans of the Crusade.', result: Welcome } },
    errors: { 502: [K.COC_API_UNAVAILABLE] },
  },
];
