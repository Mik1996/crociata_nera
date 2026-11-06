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
  /** Clan whose wars are synchronised (required by the war sync). */
  CLAN_TAG: z
    .string()
    .optional()
    .transform((value) => value?.trim().toUpperCase() || undefined),
  /** Clash of Clans API key (developer.clashofclans.com), bound to the server's public IP. */
  COC_API_TOKEN: z
    .string()
    .optional()
    .transform((value) => value?.trim() || undefined),
  COC_API_BASE_URL: z.url().default('https://api.clashofclans.com/v1'),
  /** Minutes between two reads of the current war; `0` disables the built-in scheduler. */
  WAR_SYNC_INTERVAL_MINUTES: z.coerce.number().int().min(0).max(1440).default(10),
  /** Secret for `POST /api/v1/cron/war-sync` (external schedulers); unset = endpoint disabled. */
  CRON_SECRET: z
    .string()
    .optional()
    .transform((value) => value?.trim() || undefined)
    .refine((value) => value === undefined || value.length >= 32, 'CRON_SECRET must be at least 32 characters'),
  /** Public URL of the site, used in email links (default: the first FRONTEND_URL). */
  APP_URL: z
    .string()
    .optional()
    .transform((value) => value?.trim().replace(/\/$/, '') || undefined),
  /** Emails that are given the ADMIN role when they sign up or sign in (comma-separated). */
  ADMIN_EMAILS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  // Outgoing email (password reset, email verification). Any SMTP provider: Brevo, Resend…
  SMTP_HOST: z
    .string()
    .optional()
    .transform((value) => value?.trim() || undefined),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_USER: z
    .string()
    .optional()
    .transform((value) => value?.trim() || undefined),
  SMTP_PASS: z
    .string()
    .optional()
    .transform((value) => value?.trim() || undefined),
  /** Sender, e.g. `Crociata Nera <no-reply@crociatanera.it>`. */
  MAIL_FROM: z
    .string()
    .optional()
    .transform((value) => value?.trim() || undefined),
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
