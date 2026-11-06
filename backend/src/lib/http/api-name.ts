/** Logical API names, used for per-route rate limits (as in continental-be). */
export enum ApiName {
  SIGN_UP = 'sign-up',
  SIGN_IN = 'sign-in',
  REFRESH = 'refresh',
  SIGN_OUT = 'sign-out',
  ME = 'me',
  PROFILE_UPDATE = 'profile-update',
  CHANGE_PASSWORD = 'change-password',
  FORGOT_PASSWORD = 'forgot-password',
  RESET_PASSWORD = 'reset-password',
  VERIFY_EMAIL = 'verify-email',
  RESEND_VERIFICATION = 'resend-verification',
  WARS_READ = 'wars-read',
  ADMIN = 'admin',
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
  [ApiName.PROFILE_UPDATE]: { limit: 20, windowMs: 15 * MINUTE },
  [ApiName.CHANGE_PASSWORD]: { limit: 5, windowMs: 15 * MINUTE },
  [ApiName.FORGOT_PASSWORD]: { limit: 5, windowMs: 15 * MINUTE },
  [ApiName.RESET_PASSWORD]: { limit: 10, windowMs: 15 * MINUTE },
  [ApiName.VERIFY_EMAIL]: { limit: 20, windowMs: 15 * MINUTE },
  [ApiName.RESEND_VERIFICATION]: { limit: 3, windowMs: 15 * MINUTE },
  [ApiName.WARS_READ]: { limit: 120, windowMs: MINUTE },
  [ApiName.ADMIN]: { limit: 120, windowMs: MINUTE },
};
