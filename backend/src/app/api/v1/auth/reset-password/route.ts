import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { MessageKey } from '@/lib/http/message-key';
import { parseBody } from '@/lib/validation/parse';
import { resetPassword } from '@/modules/auth/account.service';
import { resetPasswordSchema } from '@/modules/auth/auth.schemas';

/** `POST /api/v1/auth/reset-password` `{ token, password, repeatPassword }`: signs out every session. */
export const POST = apiHandler({ apiName: ApiName.RESET_PASSWORD, checkOrigin: true }, async ({ request }) => {
  await resetPassword(await parseBody(request, resetPasswordSchema));
  return { messages: [{ key: MessageKey.PASSWORD_RESET }] };
});

export const OPTIONS = preflight;
