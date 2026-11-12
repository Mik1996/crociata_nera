import { z } from 'zod';
import { ApiName } from '@/lib/http/api-name';
import { MessageKey as K } from '@/lib/http/message-key';
import { listArchiveQuerySchema, listWarsQuerySchema } from '@/modules/wars/wars.schemas';
import { CocWar, HistoryPeriod, MonthSummary, WarDetail, WarPage } from '../models/wars';
import { ApiOperation, requestPart } from '../operation';

const SYNC_NOTE = 'Wars are written only by the backend synchronisation, which reads the Clash of Clans API.';

export const WAR_OPERATIONS: ApiOperation[] = [
  {
    method: 'GET',
    path: '/wars',
    operationId: 'listWars',
    tag: 'Wars',
    summary: 'List wars',
    description: `Summaries of the saved wars of the clan (without players), most recent first. ${SYNC_NOTE}`,
    access: 'clan',
    rateLimit: ApiName.WARS_READ,
    query: requestPart(listWarsQuerySchema, {
      page: 'Page, from 1 (default 1).',
      limit: 'Wars per page, 1–50 (default 20).',
      state: 'Only the wars in this state: `preparation`, `inWar` or `warEnded`.',
    }),
    responses: { 200: { description: 'A page of wars.', result: WarPage } },
  },
  {
    method: 'GET',
    path: '/wars/archive',
    operationId: 'listWarArchive',
    tag: 'Wars',
    summary: 'List wars in the Clash of Clans format',
    description:
      'Saved wars with players and attacks, most recent first, in the format of `GET /clans/{tag}/currentwar` of the Clash of Clans API: the source of the war history in the frontend.',
    access: 'clan',
    rateLimit: ApiName.WARS_READ,
    query: requestPart(listArchiveQuerySchema, { limit: 'Most wars returned, 1–200 (default 60).' }),
    responses: { 200: { description: 'Saved wars.', result: z.array(CocWar) } },
  },
  {
    method: 'GET',
    path: '/wars/{warKey}',
    operationId: 'getWar',
    tag: 'Wars',
    summary: 'Get a war',
    description: `A saved war with both sides, players and attacks. ${SYNC_NOTE}`,
    access: 'clan',
    rateLimit: ApiName.WARS_READ,
    params: requestPart(z.object({ warKey: z.string() }), {
      warKey: { description: 'War id, `YYYYMMDDTHHMMSS-OPPONENTTAG` (preparation start in UTC).', example: '20261104T100000-OPP999' },
    }),
    responses: { 200: { description: 'The war.', result: WarDetail } },
    errors: { 404: [K.WAR_NOT_FOUND] },
  },
  {
    method: 'GET',
    path: '/history',
    operationId: 'listHistoryMonths',
    tag: 'History',
    summary: 'List the months with wars',
    description: 'Months with ended wars (Europe/Rome time zone), most recent first, with victories, draws and defeats.',
    access: 'clan',
    rateLimit: ApiName.WARS_READ,
    responses: { 200: { description: 'Months with wars.', result: z.array(MonthSummary) } },
  },
  {
    method: 'GET',
    path: '/history/{period}',
    operationId: 'getHistoryPeriod',
    tag: 'History',
    summary: 'Get the wars and ranking of a period',
    description:
      'Ended wars of a month (or of all time) and the ranking of the players by average stars per war, as on the Statistics page.',
    access: 'clan',
    rateLimit: ApiName.WARS_READ,
    params: requestPart(z.object({ period: z.string() }), {
      period: { description: 'A month, `YYYY-MM` (Europe/Rome time zone), or `all`.', example: '2026-10' },
    }),
    responses: { 200: { description: 'Wars and ranking of the period.', result: HistoryPeriod } },
    errors: { 400: [K.PERIOD_IS_NOT_VALID], 404: [K.HISTORY_NOT_FOUND] },
  },
];
