import { refreshCookie } from '@/lib/auth/refresh-cookie';
import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { MessageKey } from '@/lib/http/message-key';
import { parseBody } from '@/lib/validation/parse';
import { signUpSchema } from '@/modules/auth/auth.schemas';
import { signUp, toAuthResult } from '@/modules/auth/auth.service';

/** `POST /api/v1/auth/sign-up`: creates the account and signs the user in. */
export const POST = apiHandler({ apiName: ApiName.SIGN_UP, checkOrigin: true }, async ({ request, ip }) => {
  const input = await parseBody(request, signUpSchema);
  const session = await signUp(input, { ip, userAgent: request.headers.get('user-agent') });
  return {
    status: 201,
    result: toAuthResult(session),
    messages: [{ key: MessageKey.USER_CREATED }],
    headers: [['Set-Cookie', refreshCookie(session.refreshToken, session.refreshTokenExpiresAt)]],
  };
});

export const OPTIONS = preflight;
