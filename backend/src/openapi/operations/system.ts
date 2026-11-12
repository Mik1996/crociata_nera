import { ApiName } from '@/lib/http/api-name';
import { MessageKey as K } from '@/lib/http/message-key';
import { Health, WarSyncReport } from '../models/system';
import { ApiOperation } from '../operation';

export const SYSTEM_OPERATIONS: ApiOperation[] = [
  {
    method: 'GET',
    path: '/health',
    operationId: 'getHealth',
    tag: 'System',
    summary: 'Check the service',
    description:
      'Status of the service, MongoDB and the war synchronisation, for monitoring. Answers 503 (with the same body) when MongoDB is unreachable.',
    access: 'public',
    database: false,
    responses: {
      200: { description: 'Service and database up.', result: Health },
      503: { description: 'MongoDB unreachable (`status: degraded`).', result: Health },
    },
  },
  {
    method: 'POST',
    path: '/cron/war-sync',
    operationId: 'runWarSync',
    tag: 'System',
    summary: 'Run the synchronisation',
    description:
      'Runs the synchronisation once (wars, Clan War League, Raid Weekends, records, commendations), for deployments without the built-in scheduler (an external cron job). Disabled (404) while `CRON_SECRET` is not set. The result is `null` when a run was already in progress.',
    access: 'cron',
    database: false,
    responses: {
      200: { description: 'Run completed (or skipped: `result` is `null`).', result: WarSyncReport.nullable() },
      502: {
        description: 'The Clash of Clans API failed: the report has the error.',
        result: WarSyncReport,
        messages: [K.WAR_SYNC_FAILED],
      },
    },
    errors: { 401: [K.UNAUTHORIZED], 404: [K.NOT_FOUND] },
  },
  {
    method: 'GET',
    path: '/openapi.json',
    operationId: 'getOpenApiDocument',
    tag: 'System',
    summary: 'Get this OpenAPI document',
    description: 'The OpenAPI 3.1 description of the API (this document).',
    access: 'adminInProduction',
    rateLimit: ApiName.API_DOCS,
    database: false,
    responses: { 200: { description: 'The OpenAPI document.', result: null, raw: true } },
    errors: { 401: [K.UNAUTHORIZED, K.INVALID_CREDENTIALS], 403: [K.FORBIDDEN] },
  },
  {
    method: 'GET',
    path: '/docs',
    operationId: 'getApiDocsPage',
    tag: 'System',
    summary: 'Browse this documentation',
    description: 'This page: Swagger UI showing the OpenAPI document. Open it in the browser.',
    access: 'adminInProduction',
    rateLimit: ApiName.API_DOCS,
    database: false,
    responses: { 200: { description: 'The Swagger UI page.', result: null, binary: 'text/html' } },
    errors: { 401: [K.UNAUTHORIZED, K.INVALID_CREDENTIALS], 403: [K.FORBIDDEN] },
  },
];
