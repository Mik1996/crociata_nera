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
  playerTag?: string;
}

export interface SignInRequest {
  /** Email or username. */
  identifier: string;
  password: string;
}
