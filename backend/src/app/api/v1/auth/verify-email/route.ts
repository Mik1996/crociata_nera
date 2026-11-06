import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { MessageKey } from '@/lib/http/message-key';
import { parseBody } from '@/lib/validation/parse';
import { verifyEmail } from '@/modules/auth/account.service';
import { verifyEmailSchema } from '@/modules/auth/auth.schemas';

/** `POST /api/v1/auth/verify-email` `{ token }`: confirms the email address from the link. */
export const POST = apiHandler({ apiName: ApiName.VERIFY_EMAIL, checkOrigin: true }, async ({ request }) => {
  const { token } = await parseBody(request, verifyEmailSchema);
  return { result: await verifyEmail(token), messages: [{ key: MessageKey.EMAIL_VERIFIED }] };
});

export const OPTIONS = preflight;
