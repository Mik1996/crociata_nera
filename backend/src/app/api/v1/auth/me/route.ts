import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { MessageKey } from '@/lib/http/message-key';
import { parseBody } from '@/lib/validation/parse';
import { updateProfile } from '@/modules/auth/account.service';
import { updateProfileSchema } from '@/modules/auth/auth.schemas';
import { getCurrentUser } from '@/modules/auth/auth.service';

/** `GET /api/v1/auth/me`: the signed-in user. */
export const GET = apiHandler({ apiName: ApiName.ME, auth: true }, async ({ user }) => ({
  result: await getCurrentUser(user.id),
}));

/** `PATCH /api/v1/auth/me` `{ playerTag }`: links (or unlinks with null) the Clash of Clans account. */
export const PATCH = apiHandler({ apiName: ApiName.PROFILE_UPDATE, auth: true }, async ({ request, user }) => {
  const input = await parseBody(request, updateProfileSchema);
  return { result: await updateProfile(user.id, input), messages: [{ key: MessageKey.PROFILE_UPDATED }] };
});

export const OPTIONS = preflight;
