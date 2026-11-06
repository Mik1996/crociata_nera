import { throwException } from '@/lib/http/api-error';
import { apiHandler } from '@/lib/http/api-handler';
import { preflight } from '@/lib/http/cors';
import { MessageKey } from '@/lib/http/message-key';

/** Unknown `/api/v1/*` routes answer with the standard envelope instead of an HTML 404. */
const notFound = apiHandler({ database: false }, async () => throwException(404, MessageKey.NOT_FOUND));

export { notFound as GET, notFound as POST, notFound as PUT, notFound as PATCH, notFound as DELETE };
export const OPTIONS = preflight;
