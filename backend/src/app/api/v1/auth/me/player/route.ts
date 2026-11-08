import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { MessageKey } from '@/lib/http/message-key';
import { parseBody } from '@/lib/validation/parse';
import { linkPlayer } from '@/modules/auth/account.service';
import { linkPlayerSchema } from '@/modules/auth/auth.schemas';

/**
 * `POST /api/v1/auth/me/player` `{ playerTag, token }`: links the Clash of Clans account, proven
 * by the API token shown in the game (Settings → More Settings). Unlink with `PATCH /me`.
 */
export const POST = apiHandler({ apiName: ApiName.PLAYER_LINK, auth: true }, async ({ request, user }) => {
  const input = await parseBody(request, linkPlayerSchema);
  return { result: await linkPlayer(user.id, input), messages: [{ key: MessageKey.PLAYER_LINKED }] };
});

export const OPTIONS = preflight;
