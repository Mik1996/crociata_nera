import mongoose from 'mongoose';
import { afterAll, beforeEach, inject } from 'vitest';
import { resetEnvCache } from '@/lib/config/env';
import { connectToDatabase } from '@/lib/db/mongoose';
import { resetRateLimits } from '@/lib/http/rate-limit';
import { resetClanAccessCache } from '@/modules/access/clan-access.service';

process.env.DATABASE_URL = inject('databaseUrl');
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';
process.env.FRONTEND_URL = 'http://localhost:4200';
process.env.CLAN_TAG = '#2J8JVVCLC';
process.env.COC_API_TOKEN = 'test-coc-token';
process.env.COC_API_BASE_URL = 'https://coc.test/v1';
resetEnvCache();

beforeEach(async () => {
  resetRateLimits();
  resetClanAccessCache();
  await connectToDatabase();
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).syncIndexes()));
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  (globalThis as { __mongoose?: { promise: unknown } }).__mongoose!.promise = null;
});
