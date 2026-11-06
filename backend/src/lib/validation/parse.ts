import { z } from 'zod';
import { ApiError } from '../http/api-error';
import { MessageDescriptor } from '../http/base-result';
import { isMessageKey, MessageKey } from '../http/message-key';

/**
 * Turns zod issues into message descriptors. Schemas declare their errors as
 * {@link MessageKey} values; anything else (e.g. type errors deep in a payload)
 * becomes `ERROR.INVALID_FIELD`.
 */
export function toMessages(error: z.ZodError): MessageDescriptor[] {
  const seen = new Set<string>();
  const messages: MessageDescriptor[] = [];
  for (const issue of error.issues) {
    const field = issue.path.map(String).join('.') || undefined;
    const key = isMessageKey(issue.message) ? issue.message : MessageKey.INVALID_FIELD;
    const id = `${field}|${key}`;
    if (seen.has(id)) continue;
    seen.add(id);
    messages.push(field ? { key, field } : { key });
  }
  return messages;
}

export function validate<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new ApiError(400, toMessages(parsed.error));
  return parsed.data;
}

/** Reads the JSON body and validates it; 400 with field messages on failure. */
export async function parseBody<S extends z.ZodType>(request: Request, schema: S): Promise<z.output<S>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, [{ key: MessageKey.INVALID_JSON }]);
  }
  return validate(schema, body);
}

/** Validates the query string (`?page=2&limit=20`). */
export function parseQuery<S extends z.ZodType>(request: Request, schema: S): z.output<S> {
  return validate(schema, Object.fromEntries(new URL(request.url).searchParams));
}
