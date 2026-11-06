import { z } from 'zod';
import { parseDuration } from './duration';

const durationSchema = z
  .string()
  .regex(/^\d+[smhd]$/, 'expected a duration like 15m, 12h or 30d')
  .transform(parseDuration);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_EXPIRES_IN: durationSchema.default(15 * 60),
  REFRESH_TOKEN_EXPIRES_IN: durationSchema.default(30 * 24 * 60 * 60),
  FRONTEND_URL: z
    .string()
    .default('http://localhost:4200')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim().replace(/\/$/, ''))
        .filter(Boolean),
    ),
  CLAN_TAG: z
    .string()
    .optional()
    .transform((value) => value?.trim().toUpperCase() || undefined),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * Validated environment. Read lazily so that `next build` works without secrets;
 * a missing or invalid variable fails the first request with a clear message.
 */
export function env(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test helper: forget the cached configuration after changing `process.env`. */
export function resetEnvCache(): void {
  cached = undefined;
}
