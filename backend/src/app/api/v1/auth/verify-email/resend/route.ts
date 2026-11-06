import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { MessageKey } from '@/lib/http/message-key';
import { parseBody } from '@/lib/validation/parse';
import { resendVerification } from '@/modules/auth/account.service';
import { resendVerificationSchema } from '@/modules/auth/auth.schemas';

/** `POST /api/v1/auth/verify-email/resend` `{ language? }`: sends the confirmation email again. */
export const POST = apiHandler({ apiName: ApiName.RESEND_VERIFICATION, auth: true }, async ({ request, user }) => {
  const { language } = await parseBody(request, resendVerificationSchema);
  await resendVerification(user.id, language);
  return { messages: [{ key: MessageKey.VERIFICATION_EMAIL_SENT }] };
});

export const OPTIONS = preflight;
