import { UserRole } from '@/lib/auth/user-role';
import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { MessageKey } from '@/lib/http/message-key';
import { parseQuery } from '@/lib/validation/parse';
import { createBaseSchema, listBasesQuerySchema, parseBaseForm } from '@/modules/bases/bases.schemas';
import { createBase, listBases } from '@/modules/bases/bases.service';

/**
 * `GET /api/v1/bases?th=18&limit=24&cursor=…`: a page of the defense bases of the arsenal, optionally
 * of one town hall level (administrators and members of the clans of the Crusade). The next page is
 * asked for with the `nextCursor` of the previous one, `null` on the last page.
 */
export const GET = apiHandler({ apiName: ApiName.BASES_READ, clanAccess: true }, async ({ request }) => ({
  result: await listBases(parseQuery(request, listBasesQuerySchema)),
}));

/**
 * `POST /api/v1/bases` (ADMIN only), `multipart/form-data`: `layoutUrl` (in-game "copy base" link,
 * required), `image` (JPEG, PNG or WebP screenshot, required), `description` (optional).
 */
export const POST = apiHandler<object, unknown, true>(
  { apiName: ApiName.BASES_WRITE, roles: [UserRole.ADMIN] },
  async ({ request, user }) => {
    const input = await parseBaseForm(request, createBaseSchema, { imageRequired: true });
    return {
      status: 201,
      result: await createBase(user.id, { ...input, image: input.image! }),
      messages: [{ key: MessageKey.BASE_CREATED }],
    };
  },
);

export const OPTIONS = preflight;
