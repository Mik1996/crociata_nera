import { z } from 'zod';
import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { validate } from '@/lib/validation/parse';
import { playerTagParam } from '@/modules/auth/auth.schemas';
import { getPlayerProfile } from '@/modules/clan/clan-live.service';

/** `GET /api/v1/players/{tag}/profile`: a player's game profile, as `GET /players/{tag}` of the Clash of Clans API. */
export const GET = apiHandler<{ tag: string }, unknown, true>(
  { apiName: ApiName.COC_READ, clanAccess: true },
  async ({ params }) => {
    const { tag } = validate(z.object({ tag: playerTagParam }), params);
    return { result: await getPlayerProfile(tag) };
  },
);

export const OPTIONS = preflight;
