import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { MessageKey } from '@/lib/http/message-key';
import { parseBody } from '@/lib/validation/parse';
import { requestPasswordReset } from '@/modules/auth/account.service';
import { forgotPasswordSchema } from '@/modules/auth/auth.schemas';

/**
 * `POST /api/v1/auth/forgot-password` `{ email, language? }`: emails a reset link (valid 1 hour).
 * Same answer whether the address is registered or not.
 */
export const POST = apiHandler({ apiName: ApiName.FORGOT_PASSWORD, checkOrigin: true }, async ({ request }) => {
  const { email, language } = await parseBody(request, forgotPasswordSchema);
  await requestPasswordReset(email, language);
  return { messages: [{ key: MessageKey.RESET_EMAIL_SENT }] };
});

export const OPTIONS = preflight;
