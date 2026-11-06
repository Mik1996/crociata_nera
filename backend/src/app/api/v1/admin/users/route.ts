import { UserRole } from '@/lib/auth/user-role';
import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { parseQuery } from '@/lib/validation/parse';
import { listUsersQuerySchema } from '@/modules/admin/admin.schemas';
import { listUsers } from '@/modules/admin/admin.service';

/** `GET /api/v1/admin/users?page&limit&search`: registered users (ADMIN only). */
export const GET = apiHandler({ apiName: ApiName.ADMIN, roles: [UserRole.ADMIN] }, async ({ request }) => ({
  result: await listUsers(parseQuery(request, listUsersQuerySchema)),
}));

export const OPTIONS = preflight;
