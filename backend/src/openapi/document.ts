import { z } from 'zod';
import { RATE_LIMITS } from '@/lib/http/api-name';
import { MessageKey } from '@/lib/http/message-key';
import packageJson from '../../package.json';
import { modelId, models } from './models/common';
import { Access, ApiOperation, ApiTag, FieldDoc, RequestPart } from './operation';
import { API_OPERATIONS } from './operations';

type JsonSchema = Record<string, unknown>;

const SCHEMAS = '#/components/schemas/';
const REFRESH_COOKIE = 'cn_refresh';

const TAGS: Record<ApiTag, string> = {
  Auth: 'Sign-up, sign-in, sessions, password reset and email confirmation.',
  Account: "The signed-in user's account: profile, linked Clash of Clans accounts, password.",
  Admin: 'User management and maintenance, for administrators.',
  Wars: 'Clan wars saved by the backend synchronisation.',
  History: 'Monthly war history and player rankings (Statistics page).',
  CWL: 'Clan War League seasons.',
  Raids: 'Clan Capital Raid Weekends.',
  Donations: 'Troops donated by the players, by game season.',
  Players: 'Players of the clan and their commendations.',
  Clan: 'Public data of the clan.',
  Bases: 'Arsenal of defense bases, with their screenshots.',
  System: 'Monitoring, scheduled jobs and this documentation.',
};

const ACCESS: Record<Access, string> = {
  public: 'public.',
  user: 'signed-in users (`Authorization: Bearer <access token>`).',
  clan: 'administrators, and members of the clans of the Crusade with a verified linked account (`clanAccess` of the user).',
  admin: 'administrators (role `ADMIN`).',
  cron: 'the external scheduler, with `Authorization: Bearer <CRON_SECRET>`.',
  adminInProduction:
    'public in development; in production administrators, signed in with the browser login dialog (username or email and password of their account) or with an access token.',
};

const STATUS_TEXT: Record<number, string> = {
  400: 'Invalid request',
  401: 'Not authenticated',
  403: 'Forbidden',
  404: 'Not found',
  409: 'Conflict with the current data',
  413: 'Upload too large',
  429: 'Too many requests',
  500: 'Unexpected error',
  502: 'The Clash of Clans API failed',
  503: 'Service unavailable',
};

const DESCRIPTION = `
Application backend of [Crociata Nera](https://crociatanera.it): accounts, wars, Clan War League,
Raid Weekends, players, commendations and the base arsenal. Data of the clan is read from the
official Clash of Clans API by a scheduled synchronisation and saved in MongoDB. (The site also
calls the official API directly through a separate proxy, \`/api/coc/*\`, not described here.)

## Responses

Every JSON response is a \`BaseResult\`:

\`\`\`json
{ "result": { … }, "messages": [{ "key": "SUCCESS.SIGNED_IN" }], "status": { "code": 200, "name": "HTTP_STATUS.OK" } }
\`\`\`

\`result\` is \`null\` on errors. \`messages\` carry translation keys (\`SUCCESS.*\`, \`ERROR.*\`), never
human-readable text: the frontend translates them. Validation errors name the request \`field\`.
Each operation lists the keys it may answer with.

## Authentication

1. \`POST /auth/sign-in\` (or \`/auth/sign-up\`) returns an **access token** (JWT, 15 minutes) and sets
   the **refresh cookie** \`${REFRESH_COOKIE}\` (httpOnly, 30 days, sent only to \`/api/v1/auth\`).
2. Send the access token as \`Authorization: Bearer <token>\`. To try the protected operations
   here, call \`POST /auth/sign-in\` with **Try it out**, copy \`accessToken\` from the response and
   paste it in **Authorize** → \`bearerAuth\`.
3. Before it expires, \`POST /auth/refresh\` returns a new one and rotates the cookie.

Access levels: public, signed-in user, clan members (administrators and members of the clans of
the Crusade with a verified linked account) and administrators.

## Limits

Requests are rate limited per IP address and operation; over the limit the answer is \`429\` with
a \`Retry-After\` header (seconds). Operations called from browsers with the refresh cookie accept
only the site as \`Origin\`.
`.trim();

let cached: JsonSchema | undefined;

/** The OpenAPI 3.1 document of `/api/v1`, built once from {@link API_OPERATIONS}. */
export function openApiDocument(): JsonSchema {
  cached ??= buildDocument();
  return cached;
}

function buildDocument(): JsonSchema {
  const paths: Record<string, Record<string, JsonSchema>> = {};
  for (const op of API_OPERATIONS) {
    (paths[op.path] ??= {})[op.method.toLowerCase()] = operationObject(op);
  }
  return {
    openapi: '3.1.0',
    info: { title: 'Crociata Nera API', version: packageJson.version, description: DESCRIPTION },
    servers: [{ url: '/api/v1', description: 'This server' }],
    tags: Object.entries(TAGS).map(([name, description]) => ({ name, description })),
    paths,
    components: {
      schemas: Object.fromEntries(models().map(([id, schema]) => [id, toJsonSchema(schema, 'output', true)])),
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Access token from `POST /auth/sign-in`, `/auth/sign-up` or `/auth/refresh` (15 minutes).',
        },
        refreshCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: REFRESH_COOKIE,
          description: 'httpOnly refresh cookie set by sign-in, sign-up and refresh. Browsers send it on their own.',
        },
        adminLogin: {
          type: 'http',
          scheme: 'basic',
          description:
            'Username (or email) and password of an administrator account: how the documentation is opened in production.',
        },
        cronSecret: {
          type: 'http',
          scheme: 'bearer',
          description: 'The `CRON_SECRET` of the server, for `POST /cron/war-sync`.',
        },
      },
    },
  };
}

/**
 * Error responses of an operation by status: the ones it declares plus those of the checks every
 * route shares (rate limit, authentication, origin, validation, database, unexpected errors).
 */
export function operationErrors(op: ApiOperation): Map<number, MessageKey[]> {
  const errors = new Map<number, Set<MessageKey>>();
  const add = (status: number, ...keys: MessageKey[]) => {
    const set = errors.get(status) ?? new Set();
    keys.forEach((key) => set.add(key));
    errors.set(status, set);
  };
  for (const [status, keys] of Object.entries(op.errors ?? {})) add(Number(status), ...(keys ?? []));

  if (op.rateLimit) add(429, MessageKey.TOO_MANY_REQUESTS);
  if (op.access === 'user' || op.access === 'clan' || op.access === 'admin') {
    add(401, MessageKey.UNAUTHORIZED, MessageKey.INVALID_TOKEN);
  }
  if (op.access === 'admin') add(403, MessageKey.FORBIDDEN);
  if (op.access === 'clan') add(403, MessageKey.CLAN_ACCESS_REQUIRED);
  if (op.checkOrigin) add(403, MessageKey.ORIGIN_NOT_ALLOWED);
  if (op.query || op.body) add(400, MessageKey.INVALID_FIELD);
  if (op.body && op.body.contentType !== 'multipart/form-data') add(400, MessageKey.INVALID_JSON);
  if (op.database !== false || op.access === 'clan') add(503, MessageKey.SERVICE_UNAVAILABLE);
  add(500, MessageKey.UNHANDLED_ERROR);

  for (const status of Object.keys(op.responses)) errors.delete(Number(status));
  return new Map([...errors].sort(([a], [b]) => a - b).map(([status, keys]) => [status, [...keys]]));
}

function operationObject(op: ApiOperation): JsonSchema {
  const parameters = [
    ...(op.params ? requestParameters(op.params, 'path') : []),
    ...(op.query ? requestParameters(op.query, 'query') : []),
  ];
  const responses: Record<string, JsonSchema> = {};
  for (const [status, response] of Object.entries(op.responses)) {
    if (!response) continue;
    const headers = response.setsRefreshCookie ? { 'Set-Cookie': setCookieHeader() } : undefined;
    let content: JsonSchema;
    if (response.binary) content = { [response.binary]: { schema: { type: 'string', format: 'binary' } } };
    else if (response.raw) content = { 'application/json': { schema: { type: 'object', description: 'OpenAPI 3.1 document.' } } };
    else {
      const result = response.result ? toJsonSchema(response.result, 'output') : { type: 'null' };
      content = { 'application/json': { schema: envelope(result, response.messages) } };
    }
    responses[status] = { description: response.description, ...(headers ? { headers } : {}), content };
  }
  for (const [status, keys] of operationErrors(op)) {
    const list = keys.map((key) => `\`${key}\``).join(', ');
    responses[status] = {
      description: `${STATUS_TEXT[status] ?? 'Error'}: ${list}.`,
      ...(status === 429 ? { headers: { 'Retry-After': retryAfterHeader() } } : {}),
      content: { 'application/json': { schema: { $ref: `${SCHEMAS}ErrorResult` } } },
    };
  }

  return {
    operationId: op.operationId,
    tags: [op.tag],
    summary: op.summary,
    description: fullDescription(op),
    security: security(op),
    ...(parameters.length ? { parameters } : {}),
    ...(op.body ? { requestBody: requestBody(op) } : {}),
    responses,
    'x-access': op.access,
    ...(op.rateLimit
      ? { 'x-rate-limit': { limit: RATE_LIMITS[op.rateLimit].limit, windowSeconds: RATE_LIMITS[op.rateLimit].windowMs / 1000 } }
      : {}),
  };
}

function fullDescription(op: ApiOperation): string {
  const lines = [op.description, '', `**Access:** ${ACCESS[op.access]}`];
  if (op.rateLimit) {
    const { limit, windowMs } = RATE_LIMITS[op.rateLimit];
    const minutes = windowMs / 60_000;
    lines.push('', `**Rate limit:** ${limit} requests per ${minutes === 1 ? 'minute' : `${minutes} minutes`} per IP address.`);
  }
  if (op.checkOrigin) lines.push('', '**Origin:** browsers may call it only from the site (CSRF defence).');
  if (op.refreshCookie === 'required') lines.push('', `**Cookie:** needs the refresh cookie \`${REFRESH_COOKIE}\`.`);
  if (op.refreshCookie === 'optional') lines.push('', `**Cookie:** reads the refresh cookie \`${REFRESH_COOKIE}\` when sent.`);
  return lines.join('\n');
}

function security(op: ApiOperation): JsonSchema[] {
  const bearer = op.access === 'user' || op.access === 'clan' || op.access === 'admin';
  if (op.access === 'cron') return [{ cronSecret: [] }];
  if (op.access === 'adminInProduction') return [{ adminLogin: [] }, { bearerAuth: [] }, {}];
  if (bearer && op.refreshCookie === 'optional') return [{ bearerAuth: [], refreshCookie: [] }, { bearerAuth: [] }];
  if (bearer) return [{ bearerAuth: [] }];
  if (op.refreshCookie === 'required') return [{ refreshCookie: [] }];
  if (op.refreshCookie === 'optional') return [{ refreshCookie: [] }, {}];
  return [];
}

function requestParameters(part: RequestPart, location: 'path' | 'query'): JsonSchema[] {
  const json = documentedObject(part, 'input');
  const properties = json.properties as Record<string, JsonSchema>;
  const required = new Set((json.required as string[] | undefined) ?? []);
  return Object.entries(properties).map(([name, { description, examples, ...schema }]) => ({
    name,
    in: location,
    required: location === 'path' || required.has(name),
    description,
    ...(Array.isArray(examples) ? { example: examples[0] } : {}),
    schema,
  }));
}

function requestBody(op: ApiOperation): JsonSchema {
  const body = op.body!;
  const contentType = body.contentType ?? 'application/json';
  return { required: true, content: { [contentType]: { schema: documentedObject(body, 'input') } } };
}

/** JSON schema of a request object, with the documentation of each field merged in. */
function documentedObject(part: RequestPart, io: 'input' | 'output'): JsonSchema {
  const json = toJsonSchema(part.schema, io);
  const properties = (json.properties ?? {}) as Record<string, JsonSchema>;
  for (const [name, doc] of Object.entries(part.fields as Record<string, FieldDoc>)) {
    const field = properties[name];
    if (!field) continue;
    const { description, example, ...extra } = typeof doc === 'string' ? { description: doc } : doc;
    Object.assign(field, extra, { description }, example === undefined ? {} : { examples: [example] });
  }
  return json;
}

/** `BaseResult` around a result; the message keys of a success response are listed. */
function envelope(result: JsonSchema, keys: MessageKey[] | undefined): JsonSchema {
  const message = keys?.length
    ? { allOf: [{ $ref: `${SCHEMAS}Message` }], properties: { key: { type: 'string', enum: keys } } }
    : { $ref: `${SCHEMAS}Message` };
  return {
    type: 'object',
    required: ['result', 'messages', 'status'],
    properties: {
      result,
      messages: { type: 'array', items: message, description: 'Messages for the client (translation keys).' },
      status: { $ref: `${SCHEMAS}Status` },
    },
  };
}

function setCookieHeader(): JsonSchema {
  return {
    description: `Sets (or clears) the refresh cookie: \`${REFRESH_COOKIE}=<token>; Path=/api/v1/auth; HttpOnly; SameSite=Strict; Max-Age=<seconds>\` (plus \`Secure\` in production).`,
    schema: { type: 'string' },
  };
}

function retryAfterHeader(): JsonSchema {
  return { description: 'Seconds to wait before trying again.', schema: { type: 'integer' } };
}

/**
 * JSON Schema (2020-12, as OpenAPI 3.1) of a zod schema; named models become `$ref`s, the schema
 * itself included unless it is the `component` being defined.
 */
export function toJsonSchema(schema: z.ZodType, io: 'input' | 'output', component = false): JsonSchema {
  const json = z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    io,
    unrepresentable: 'any',
    reused: 'inline',
    override: (ctx) => {
      const target = ctx.jsonSchema as JsonSchema;
      simplify(target);
      const zodSchema = ctx.zodSchema as unknown as z.ZodType;
      const id = modelId(zodSchema);
      if (!id || (component && zodSchema === schema)) return;
      for (const key of Object.keys(target)) delete target[key];
      target.$ref = `${SCHEMAS}${id}`;
    },
  }) as JsonSchema;
  delete json.$schema;
  return json;
}

/** Drops what zod emits but only adds noise to the documentation. */
function simplify(json: JsonSchema): void {
  // `format: date-time` already says it; zod adds the full validation regex.
  if (json.format === 'date-time') delete json.pattern;
  // Bounds zod puts on every integer.
  if (json.maximum === Number.MAX_SAFE_INTEGER) delete json.maximum;
  if (json.minimum === Number.MIN_SAFE_INTEGER) delete json.minimum;
}
