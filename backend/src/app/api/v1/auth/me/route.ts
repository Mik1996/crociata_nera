import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { getCurrentUser } from '@/modules/auth/auth.service';

/** `GET /api/v1/auth/me`: the signed-in user. */
export const GET = apiHandler({ apiName: ApiName.ME, auth: true }, async ({ user }) => ({
  result: await getCurrentUser(user.id),
}));

export const OPTIONS = preflight;
