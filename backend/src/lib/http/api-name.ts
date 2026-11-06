/** Logical API names, used for per-route rate limits (as in continental-be). */
export enum ApiName {
  SIGN_UP = 'sign-up',
  SIGN_IN = 'sign-in',
  REFRESH = 'refresh',
  SIGN_OUT = 'sign-out',
  ME = 'me',
  WARS_SAVE = 'wars-save',
  WARS_READ = 'wars-read',
}

export interface RateLimit {
  /** Maximum requests per window and client IP. */
  limit: number;
  windowMs: number;
}

const MINUTE = 60_000;

export const RATE_LIMITS: Record<ApiName, RateLimit> = {
  [ApiName.SIGN_UP]: { limit: 5, windowMs: 15 * MINUTE },
  [ApiName.SIGN_IN]: { limit: 10, windowMs: 15 * MINUTE },
  [ApiName.REFRESH]: { limit: 60, windowMs: 15 * MINUTE },
  [ApiName.SIGN_OUT]: { limit: 30, windowMs: 15 * MINUTE },
  [ApiName.ME]: { limit: 120, windowMs: MINUTE },
  // The frontend saves wars automatically and only when they change.
  [ApiName.WARS_SAVE]: { limit: 60, windowMs: MINUTE },
  [ApiName.WARS_READ]: { limit: 120, windowMs: MINUTE },
};
