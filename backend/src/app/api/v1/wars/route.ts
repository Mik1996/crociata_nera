import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { MessageKey } from '@/lib/http/message-key';
import { parseBody, parseQuery } from '@/lib/validation/parse';
import { listWarsQuerySchema, saveWarSchema } from '@/modules/wars/wars.schemas';
import { listWars, saveWar } from '@/modules/wars/wars.service';

const OUTCOME = {
  created: { status: 201, key: MessageKey.WAR_CREATED },
  updated: { status: 200, key: MessageKey.WAR_UPDATED },
  unchanged: { status: 200, key: MessageKey.WAR_UNCHANGED },
} as const;

/**
 * `POST /api/v1/wars`: saves a `currentwar` snapshot of the Clash of Clans API.
 * Called automatically by the frontend for signed-in users; idempotent.
 */
export const POST = apiHandler({ apiName: ApiName.WARS_SAVE, auth: true }, async ({ request, user }) => {
  const input = await parseBody(request, saveWarSchema);
  const { outcome, war } = await saveWar(input, user.id);
  return { status: OUTCOME[outcome].status, result: war, messages: [{ key: OUTCOME[outcome].key }] };
});

/** `GET /api/v1/wars?page=1&limit=20&state=warEnded`: saved wars, most recent first. */
export const GET = apiHandler({ apiName: ApiName.WARS_READ, auth: true }, async ({ request }) => ({
  result: await listWars(parseQuery(request, listWarsQuerySchema)),
}));

export const OPTIONS = preflight;
