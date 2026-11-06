import { readRefreshCookie, refreshCookie } from '@/lib/auth/refresh-cookie';
import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { MessageKey } from '@/lib/http/message-key';
import { refresh, toAuthResult } from '@/modules/auth/auth.service';

/** `POST /api/v1/auth/refresh`: new access token from the httpOnly refresh cookie (rotated). */
export const POST = apiHandler({ apiName: ApiName.REFRESH, checkOrigin: true }, async ({ request, ip }) => {
  const session = await refresh(readRefreshCookie(request), { ip, userAgent: request.headers.get('user-agent') });
  return {
    result: toAuthResult(session),
    messages: [{ key: MessageKey.TOKEN_REFRESHED }],
    headers: [['Set-Cookie', refreshCookie(session.refreshToken, session.refreshTokenExpiresAt)]],
  };
});

export const OPTIONS = preflight;
