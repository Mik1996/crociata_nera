import { z } from 'zod';
import { ApiName } from '@/lib/http/api-name';
import { MessageKey } from '@/lib/http/message-key';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Who may call an operation; it must match the options of the route's `apiHandler` (checked by
 * `test/openapi.test.ts`):
 * - `public`: anybody;
 * - `user`: a signed-in user (`auth: true`);
 * - `clan`: administrators and members of the clans of the Crusade (`clanAccess: true`);
 * - `admin`: administrators (`roles: [ADMIN]`);
 * - `cron`: the external scheduler, with `CRON_SECRET` as Bearer token (checked by the route);
 * - `adminInProduction`: anybody in development; in production administrators, with an access token
 *   or the credentials of their account (HTTP Basic, the browser's login dialog). Checked by the route.
 */
export type Access = 'public' | 'user' | 'clan' | 'admin' | 'cron' | 'adminInProduction';

/** Tags group the operations in the documentation; their descriptions are in `document.ts`. */
export type ApiTag =
  | 'Auth'
  | 'Account'
  | 'Admin'
  | 'Wars'
  | 'History'
  | 'CWL'
  | 'Raids'
  | 'Donations'
  | 'Players'
  | 'Clan'
  | 'Bases'
  | 'System';

/**
 * Documentation of a request field (path, query or body) whose zod schema carries no description.
 * A string is the description.
 */
export type FieldDoc = string | { description: string; example?: unknown; format?: string; pattern?: string };

export interface RequestPart<S extends z.ZodObject = z.ZodObject> {
  /** The zod schema the route validates the input with (or the shape of its path parameters). */
  schema: S;
  /** One entry per field of the schema. */
  fields: { [K in keyof S['shape']]: FieldDoc };
}

export interface RequestBody extends RequestPart {
  /** `application/json` unless stated. */
  contentType?: 'application/json' | 'multipart/form-data';
}

export interface SuccessResponse {
  description: string;
  /**
   * Schema of `BaseResult.result`; `null` when the result is always `null`. Ignored for binary
   * content.
   */
  result: z.ZodType | null;
  /** Message keys that may come with the response (e.g. `SUCCESS.SIGNED_IN`). */
  messages?: MessageKey[];
  /** The response sets (or clears) the refresh cookie. */
  setsRefreshCookie?: boolean;
  /** Binary content instead of a `BaseResult` (e.g. `image/webp`). */
  binary?: string;
  /** Raw JSON document instead of a `BaseResult` (the OpenAPI document itself). */
  raw?: boolean;
}

/** One operation of the API (a method on a path), documented for OpenAPI. */
export interface ApiOperation {
  method: HttpMethod;
  /** Path below `/api/v1`, with OpenAPI parameters: `/wars/{warKey}`. */
  path: string;
  operationId: string;
  tag: ApiTag;
  summary: string;
  /** Markdown. Access rules and rate limit are appended by the document builder. */
  description: string;
  access: Access;
  /** The route's rate limit (`apiHandler` option `apiName`). */
  rateLimit?: ApiName;
  /** The route refuses requests from an origin that is not the frontend (`checkOrigin`). */
  checkOrigin?: boolean;
  /** `false` when the route never touches MongoDB (`database: false`). */
  database?: false;
  /** The refresh cookie `cn_refresh` authenticates the request (`required`) or is read if sent. */
  refreshCookie?: 'required' | 'optional';
  params?: RequestPart;
  query?: RequestPart;
  body?: RequestBody;
  /** Successful (and documented non-error) responses by HTTP status. */
  responses: Partial<Record<number, SuccessResponse>>;
  /**
   * Error responses (`result: null`) by HTTP status, with their message keys. Errors common to
   * every route (rate limit, authentication, validation, database, unexpected) are added by the
   * document builder from the other properties.
   */
  errors?: Partial<Record<number, MessageKey[]>>;
}

/** Keeps the field names of `fields` checked against the schema. */
export function requestPart<S extends z.ZodObject>(schema: S, fields: RequestPart<S>['fields']): RequestPart {
  return { schema, fields } as RequestPart;
}
