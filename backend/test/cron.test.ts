import { afterEach, describe, expect, it } from 'vitest';
import { POST as cronSync } from '@/app/api/v1/cron/war-sync/route';
import { resetEnvCache } from '@/lib/config/env';
import { RATE_LIMITS, ApiName } from '@/lib/http/api-name';
import { call } from './helpers';

afterEach(() => {
  delete process.env.CRON_SECRET;
  resetEnvCache();
});

describe('POST /api/v1/cron/war-sync rate limit', () => {
  it('limits the attempts per IP, so the secret cannot be guessed', async () => {
    process.env.CRON_SECRET = 'x'.repeat(40);
    resetEnvCache();
    const { limit } = RATE_LIMITS[ApiName.CRON_WAR_SYNC];

    for (let i = 0; i < limit; i++) {
      expect((await call(cronSync, { body: {}, token: 'wrong', ip: '10.7.0.1' })).status).toBe(401);
    }
    const blocked = await call(cronSync, { body: {}, token: 'wrong', ip: '10.7.0.1' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.messages).toEqual([{ key: 'ERROR.TOO_MANY_REQUESTS' }]);
    expect(blocked.headers.get('retry-after')).toEqual(expect.any(String));
  });
});
