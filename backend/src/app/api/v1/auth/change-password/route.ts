import { readRefreshCookie } from '@/lib/auth/refresh-cookie';
import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { MessageKey } from '@/lib/http/message-key';
import { parseBody } from '@/lib/validation/parse';
import { changePassword } from '@/modules/auth/account.service';
import { changePasswordSchema } from '@/modules/auth/auth.schemas';

/**
 * `POST /api/v1/auth/change-password` `{ currentPassword, password, repeatPassword }`.
 * Signs out the other sessions; the current one (refresh cookie) stays active.
 */
export const POST = apiHandler(
  { apiName: ApiName.CHANGE_PASSWORD, auth: true, checkOrigin: true },
  async ({ request, user }) => {
    const input = await parseBody(request, changePasswordSchema);
    await changePassword(user.id, input, readRefreshCookie(request));
    return { messages: [{ key: MessageKey.PASSWORD_UPDATED }] };
  },
);

export const OPTIONS = preflight;
