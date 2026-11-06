import { clearedRefreshCookie, readRefreshCookie } from '@/lib/auth/refresh-cookie';
import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { MessageKey } from '@/lib/http/message-key';
import { signOut } from '@/modules/auth/auth.service';

/** `POST /api/v1/auth/sign-out`: revokes the current session and clears the cookie. Idempotent. */
export const POST = apiHandler({ apiName: ApiName.SIGN_OUT, checkOrigin: true }, async ({ request }) => {
  await signOut(readRefreshCookie(request));
  return {
    messages: [{ key: MessageKey.SIGNED_OUT }],
    headers: [['Set-Cookie', clearedRefreshCookie()]],
  };
});

export const OPTIONS = preflight;
