import { UserRole } from '@/lib/auth/user-role';
import { CocApiError } from '@/lib/coc/coc-client';
import { throwException } from '@/lib/http/api-error';
import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { MessageKey } from '@/lib/http/message-key';
import { syncMembers } from '@/modules/commendations/commendation-sync.service';

/**
 * `POST /api/v1/admin/players/sync` (ADMIN only): saves the current clan members in `Players`,
 * creating the missing ones and refreshing the others (the scheduler also does it every run).
 */
export const POST = apiHandler({ apiName: ApiName.ADMIN, roles: [UserRole.ADMIN] }, async () => {
  try {
    return { result: await syncMembers() };
  } catch (error) {
    if (error instanceof CocApiError) throwException(502, MessageKey.PLAYERS_SYNC_FAILED);
    throw error;
  }
});

export const OPTIONS = preflight;
