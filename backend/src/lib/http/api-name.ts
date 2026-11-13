/** Logical API names, used for per-route rate limits (as in continental-be). */
export enum ApiName {
  SIGN_UP = 'sign-up',
  SIGN_IN = 'sign-in',
  REFRESH = 'refresh',
  SIGN_OUT = 'sign-out',
  ME = 'me',
  PROFILE_UPDATE = 'profile-update',
  PLAYER_LINK = 'player-link',
  CHANGE_PASSWORD = 'change-password',
  FORGOT_PASSWORD = 'forgot-password',
  RESET_PASSWORD = 'reset-password',
  VERIFY_EMAIL = 'verify-email',
  RESEND_VERIFICATION = 'resend-verification',
  WARS_READ = 'wars-read',
  CLAN_RECORDS = 'clan-records',
  ADMIN = 'admin',
  BASES_READ = 'bases-read',
  BASES_WRITE = 'bases-write',
  BASE_IMAGES = 'base-images',
  API_DOCS = 'api-docs',
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
  // Every page load refreshes, and many players share an IP (home network, mobile carrier NAT).
  [ApiName.REFRESH]: { limit: 300, windowMs: 15 * MINUTE },
  [ApiName.SIGN_OUT]: { limit: 30, windowMs: 15 * MINUTE },
  [ApiName.ME]: { limit: 120, windowMs: MINUTE },
  [ApiName.PROFILE_UPDATE]: { limit: 20, windowMs: 15 * MINUTE },
  // Each attempt calls the Clash of Clans API: few tries, so tokens cannot be guessed.
  [ApiName.PLAYER_LINK]: { limit: 10, windowMs: 15 * MINUTE },
  [ApiName.CHANGE_PASSWORD]: { limit: 5, windowMs: 15 * MINUTE },
  [ApiName.FORGOT_PASSWORD]: { limit: 5, windowMs: 15 * MINUTE },
  [ApiName.RESET_PASSWORD]: { limit: 10, windowMs: 15 * MINUTE },
  [ApiName.VERIFY_EMAIL]: { limit: 20, windowMs: 15 * MINUTE },
  [ApiName.RESEND_VERIFICATION]: { limit: 3, windowMs: 15 * MINUTE },
  [ApiName.WARS_READ]: { limit: 120, windowMs: MINUTE },
  // Public (welcome page).
  [ApiName.CLAN_RECORDS]: { limit: 60, windowMs: MINUTE },
  [ApiName.ADMIN]: { limit: 120, windowMs: MINUTE },
  [ApiName.BASES_READ]: { limit: 120, windowMs: MINUTE },
  // Administrators only; each request may carry an image of up to 10 MB.
  [ApiName.BASES_WRITE]: { limit: 60, windowMs: 15 * MINUTE },
  // A page of the arsenal loads one thumbnail per base (cached by the browser afterwards).
  [ApiName.BASE_IMAGES]: { limit: 600, windowMs: MINUTE },
  // The OpenAPI document and its viewer (Swagger UI). In production a password is checked:
  // few tries, as for the sign-in (a page view makes 2 requests).
  [ApiName.API_DOCS]: { limit: 30, windowMs: 15 * MINUTE },
};
