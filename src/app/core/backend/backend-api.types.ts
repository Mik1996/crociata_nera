/** Types of the application backend (`backend/`). Keep in sync with `backend/src`. */

export interface BackendMessage {
  /** Translation key, e.g. `ERROR.INVALID_CREDENTIALS`. */
  key: string;
  params?: Record<string, string | number>;
  /** Request field the message refers to (validation errors). */
  field?: string;
}

/** Envelope of every backend response. */
export interface BaseResult<T> {
  result: T | null;
  messages: BackendMessage[];
  status: { code: number; name: string };
}

export interface BackendUser {
  id: string;
  email: string;
  username: string;
  roles: ('USER' | 'ADMIN')[];
  playerTag: string | null;
  /** `playerTag` proven with the in-game API token. */
  playerTagVerified: boolean;
  emailVerified: boolean;
  createdAt: string;
}

/** Result of sign-up, sign-in and refresh (the refresh token travels in an httpOnly cookie). */
export interface AuthResult {
  user: BackendUser;
  accessToken: string;
  accessTokenExpiresAt: string;
}

export interface SignUpRequest {
  email: string;
  username: string;
  password: string;
  repeatPassword: string;
  /** Language of the confirmation email. */
  language?: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  password: string;
  repeatPassword: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
  repeatPassword: string;
}

/** User as listed in the administration page. */
export interface AdminUser extends BackendUser {
  updatedAt: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface SignInRequest {
  /** Email or username. */
  identifier: string;
  password: string;
}

/**
 * A commendation earned, as saved by the backend. Translated from `type` and `tier`
 * (`commendations.<type>.<tier>`).
 */
export interface EarnedCommendation {
  /** Unique id of the commendation (backend catalogue, e.g. `95000015`). */
  id: string;
  /** `<type>-<tier>`, e.g. `capitalRaider-gold` (also the name of the medal image). */
  name: string;
  type: string;
  tier: string;
  quantity: number;
}

/** `GET /api/v1/players/{tag}`: a saved player (current or former member) and the commendations earned. */
export interface PlayerRecord {
  tag: string;
  name: string;
  role: string | null;
  townHallLevel: number | null;
  expLevel: number | null;
  trophies: number | null;
  league: { id: number; name: string; iconUrl?: string } | null;
  inClan: boolean;
  lastSeenAt: string | null;
  commendations: EarnedCommendation[];
}
