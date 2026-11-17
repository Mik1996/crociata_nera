import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { UserModel } from '@/modules/auth/user.model';
import { getMemberships } from '@/modules/clan/clan-live.service';

/** `GET /api/v1/auth/me/memberships`: the signed-in user's accounts that are in a clan of the Crusade now. */
export const GET = apiHandler({ apiName: ApiName.ME, auth: true }, async ({ user }) => {
  const saved = await UserModel.findById(user.id).select('playerTags').lean();
  return { result: await getMemberships(saved?.playerTags ?? []) };
});

export const OPTIONS = preflight;
