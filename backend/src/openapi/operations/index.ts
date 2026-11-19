import { ApiOperation } from '../operation';
import { ADMIN_OPERATIONS } from './admin';
import { AUTH_OPERATIONS } from './auth';
import { BASE_OPERATIONS } from './bases';
import { CLAN_OPERATIONS } from './clan';
import { COC_OPERATIONS } from './coc';
import { SYSTEM_OPERATIONS } from './system';
import { TABLE_OPERATIONS } from './tables';
import { TELEGRAM_OPERATIONS } from './telegram';
import { WAR_OPERATIONS } from './wars';

/**
 * Every operation of `/api/v1`. A route without an entry here (or an entry without a route) fails
 * `test/openapi.test.ts`.
 */
export const API_OPERATIONS: readonly ApiOperation[] = [
  ...AUTH_OPERATIONS,
  ...ADMIN_OPERATIONS,
  ...WAR_OPERATIONS,
  ...TABLE_OPERATIONS,
  ...COC_OPERATIONS,
  ...CLAN_OPERATIONS,
  ...BASE_OPERATIONS,
  ...SYSTEM_OPERATIONS,
  ...TELEGRAM_OPERATIONS,
];
