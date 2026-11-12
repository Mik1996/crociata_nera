import { z } from 'zod';

/**
 * Response models of the API, written as zod schemas. They serve two purposes:
 * - the OpenAPI document (`/api/v1/openapi.json`) is generated from them;
 * - the backend tests validate every response against them (`test/contract.ts`), strictly: a
 *   field returned by a route but missing here fails the tests, so the documentation cannot
 *   silently fall behind the code.
 *
 * A schema passed to {@link model} becomes a named component (`#/components/schemas/<id>`).
 */
const MODEL_IDS = new Map<z.ZodType, string>();

export function model<S extends z.ZodType>(id: string, description: string, schema: S): S {
  const described = schema.describe(description) as S;
  if ([...MODEL_IDS.values()].includes(id)) throw new Error(`OpenAPI model ${id} is defined twice`);
  MODEL_IDS.set(described, id);
  return described;
}

/** Component id of a model, `undefined` for other schemas. */
export function modelId(schema: z.ZodType): string | undefined {
  return MODEL_IDS.get(schema);
}

/** Every named model, by id. */
export function models(): [string, z.ZodType][] {
  return [...MODEL_IDS].map(([schema, id]) => [id, schema]);
}

/** ISO 8601 date and time in UTC, e.g. `2026-11-04T10:00:00.000Z`. */
export const dateTime = (description: string) => z.iso.datetime().describe(description);
export const nullableDateTime = (description: string) => z.iso.datetime().nullable().describe(description);

/** Clash of Clans tag with its `#`, upper case, e.g. `#2J8JVVCLC`. */
export const tag = (description: string) =>
  z.string().regex(/^#[0-9A-Z]+$/).describe(`${description} Clash of Clans tag, e.g. \`#2J8JVVCLC\`.`);

/** `YYYY-MM`. */
export const month = (description: string) => z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).describe(description);

export const Message = model(
  'Message',
  'A message for the client: a translation key (`SUCCESS.*` or `ERROR.*`) translated by the frontend, never human-readable text.',
  z.strictObject({
    key: z.string().describe('Translation key, e.g. `ERROR.WAR_NOT_FOUND`.'),
    params: z
      .record(z.string(), z.union([z.string(), z.number()]))
      .optional()
      .describe('Values interpolated in the translation, e.g. `{ "max": 10 }`.'),
    field: z.string().optional().describe('Request field the message refers to (validation errors), e.g. `email`.'),
  }),
);

export const Status = model(
  'Status',
  'HTTP status of the response, repeated in the body.',
  z.strictObject({
    code: z.number().int().describe('HTTP status code, e.g. `404`.'),
    name: z.string().describe('Status name, e.g. `HTTP_STATUS.NOT_FOUND` (`HTTP_STATUS.UNKNOWN` for unusual codes).'),
  }),
);

/** The `BaseResult` envelope of every JSON response, around a result schema. */
export function baseResult(result: z.ZodType | null) {
  return z.strictObject({
    result: result ?? z.null().describe('Always `null`.'),
    messages: z.array(Message).describe('Messages for the client (translation keys).'),
    status: Status,
  });
}

export const ErrorResult = model(
  'ErrorResult',
  'Error response: `result` is `null`, `messages` say what went wrong (the keys each operation may answer with are listed in its responses).',
  baseResult(null),
);

/** Paginated list. */
export function page<S extends z.ZodType>(items: S, itemsDescription: string) {
  return {
    items: z.array(items).describe(itemsDescription),
    total: z.number().int().min(0).describe('Items matching the request, on every page.'),
    page: z.number().int().min(1).describe('Page returned, from 1.'),
    limit: z.number().int().min(1).describe('Most items per page.'),
  };
}

/** Error of a Clash of Clans API call, as reported by the synchronisation jobs. */
export const SyncError = model(
  'SyncError',
  'Failed call to the Clash of Clans API during a synchronisation.',
  z.strictObject({
    status: z.number().int().describe('HTTP status of the Clash of Clans API (`0`: no response or configuration error).'),
    reason: z.string().describe("Supercell's reason, e.g. `accessDenied.invalidIp`."),
    message: z.string().describe('Details of the error.'),
  }),
);
