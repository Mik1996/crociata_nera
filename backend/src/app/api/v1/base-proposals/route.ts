import { UserRole } from '@/lib/auth/user-role';
import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { MessageKey } from '@/lib/http/message-key';
import { parseQuery } from '@/lib/validation/parse';
import { listProposals, proposeBase } from '@/modules/bases/base-proposals.service';
import { createBaseSchema, listProposalsQuerySchema, parseBaseForm } from '@/modules/bases/bases.schemas';

/**
 * `GET /api/v1/base-proposals?status=PENDING|APPROVED|REJECTED` (ADMIN only): the bases proposed by
 * the members in one state of the moderation, with the count of each state.
 */
export const GET = apiHandler<object, unknown, true>(
  { apiName: ApiName.BASES_READ, roles: [UserRole.ADMIN] },
  async ({ request }) => ({
    result: await listProposals(parseQuery(request, listProposalsQuerySchema)),
  }),
);

/**
 * `POST /api/v1/base-proposals` (members of the clans), `multipart/form-data` as `POST /bases`: the
 * base waits for an administrator's approval before it reaches the arsenal.
 */
export const POST = apiHandler<object, unknown, true>(
  { apiName: ApiName.BASE_PROPOSALS, clanAccess: true },
  async ({ request, user }) => {
    const input = await parseBaseForm(request, createBaseSchema, { imageRequired: true });
    return {
      status: 201,
      result: await proposeBase(user.id, { ...input, image: input.image! }),
      messages: [{ key: MessageKey.BASE_PROPOSED }],
    };
  },
);

export const OPTIONS = preflight;
