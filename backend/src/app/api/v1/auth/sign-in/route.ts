import { refreshCookie } from '@/lib/auth/refresh-cookie';
import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { MessageKey } from '@/lib/http/message-key';
import { parseBody } from '@/lib/validation/parse';
import { signInSchema } from '@/modules/auth/auth.schemas';
import { signIn, toAuthResult } from '@/modules/auth/auth.service';

/** `POST /api/v1/auth/sign-in`: email or username + password. */
export const POST = apiHandler({ apiName: ApiName.SIGN_IN, checkOrigin: true }, async ({ request, ip }) => {
  const input = await parseBody(request, signInSchema);
  const session = await signIn(input, { ip, userAgent: request.headers.get('user-agent') });
  return {
    result: toAuthResult(session),
    messages: [{ key: MessageKey.SIGNED_IN }],
    headers: [['Set-Cookie', refreshCookie(session.refreshToken, session.refreshTokenExpiresAt)]],
  };
});

export const OPTIONS = preflight;
