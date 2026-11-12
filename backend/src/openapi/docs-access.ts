import { verifyPassword } from '@/lib/auth/password';
import { UserRole } from '@/lib/auth/user-role';
import { env } from '@/lib/config/env';
import { connectToDatabase } from '@/lib/db/mongoose';
import { throwException } from '@/lib/http/api-error';
import type { AuthUser } from '@/lib/http/api-handler';
import { MessageKey } from '@/lib/http/message-key';
import { UserModel } from '@/modules/auth/user.model';

/** Makes the browser ask for a username and password (its own login dialog). */
const ASK_FOR_LOGIN = { 'WWW-Authenticate': 'Basic realm="Crociata Nera API", charset="UTF-8"' };

/**
 * Access to the API documentation (`/docs`, `/openapi.json`): open outside production. In
 * production only administrators, either with an access token (`Authorization: Bearer`, for tools)
 * or, from the browser address bar, with the credentials of their account on the site: the browser
 * shows its login dialog (HTTP Basic, over HTTPS) and sends them with every request to `/api/v1`.
 */
export async function assertDocsAccess(request: Request, user: AuthUser | null): Promise<void> {
  if (env().NODE_ENV !== 'production') return;
  if (user) {
    if (!user.roles.includes(UserRole.ADMIN)) throwException(403, MessageKey.FORBIDDEN);
    return;
  }

  const credentials = basicCredentials(request);
  if (!credentials) throwException(401, MessageKey.UNAUTHORIZED, ASK_FOR_LOGIN);

  await connectToDatabase();
  // Same lookup as the sign-in: email or username, case-insensitive.
  const identifier = credentials.identifier.trim().toLowerCase();
  const filter = identifier.includes('@') ? { email: identifier } : { usernameKey: identifier };
  const account = await UserModel.findOne(filter).select('+passwordHash');
  if (!(await verifyPassword(credentials.password, account?.passwordHash ?? null)) || !account) {
    throwException(401, MessageKey.INVALID_CREDENTIALS, ASK_FOR_LOGIN);
  }
  if (!account.roles.includes(UserRole.ADMIN)) throwException(403, MessageKey.FORBIDDEN);
}

/** `Authorization: Basic base64(identifier:password)`; `null` when missing or malformed. */
function basicCredentials(request: Request): { identifier: string; password: string } | null {
  const encoded = request.headers.get('authorization')?.match(/^Basic\s+([A-Za-z0-9+/=]+)$/i)?.[1];
  if (!encoded) return null;
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  if (separator < 1 || decoded.length > 2048) return null;
  return { identifier: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
}
