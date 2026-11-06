import { env } from '../config/env';

export const REFRESH_COOKIE = 'cn_refresh';
/** The cookie is sent only to the auth routes that need it. */
const COOKIE_PATH = '/api/v1/auth';

function attributes(maxAgeSeconds: number): string {
  const parts = [`Path=${COOKIE_PATH}`, 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAgeSeconds}`];
  if (env().NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

export function refreshCookie(token: string, expiresAt: Date): string {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  return `${REFRESH_COOKIE}=${token}; ${attributes(maxAge)}`;
}

export function clearedRefreshCookie(): string {
  return `${REFRESH_COOKIE}=; ${attributes(0)}`;
}

/** Reads the refresh token from the `Cookie` header. */
export function readRefreshCookie(request: Request): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === REFRESH_COOKIE) return rest.join('=') || null;
  }
  return null;
}
