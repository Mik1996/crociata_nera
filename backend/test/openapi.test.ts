import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { Validator } from '@seriousme/openapi-schema-validator';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET as getDocsPage } from '@/app/api/v1/docs/route';
import { GET as getHealth } from '@/app/api/v1/health/route';
import { GET as getOpenApi } from '@/app/api/v1/openapi.json/route';
import { hashPassword } from '@/lib/auth/password';
import { signAccessToken } from '@/lib/auth/tokens';
import { UserRole } from '@/lib/auth/user-role';
import { resetEnvCache } from '@/lib/config/env';
import type { ApiRouteHandler } from '@/lib/http/api-handler';
import { MessageKey } from '@/lib/http/message-key';
import { openApiDocument } from '@/openapi/document';
import { UserModel } from '@/modules/auth/user.model';
import { ApiOperation } from '@/openapi/operation';
import { API_OPERATIONS } from '@/openapi/operations';
import { contractProblems, operationsByHandler, routeModule } from './contract';
import { call, memberToken } from './helpers';

type Json = Record<string, unknown>;

const API_DIR = join(__dirname, '..', 'src', 'app', 'api', 'v1');
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
/** Catch-all answering 404 to unknown routes: not an operation. */
const NOT_FOUND_ROUTE = '/[...notFound]';

/** `/wars/[warKey]` (folder below `api/v1`) → `/wars/{warKey}`. */
function routeFiles(dir = API_DIR): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name === 'route.ts' ? [`/${relative(API_DIR, dir).split(sep).join('/')}`] : [];
  });
}

/** Every `METHOD path` exported by the route files. */
async function exportedRoutes(): Promise<string[]> {
  const routes: string[] = [];
  for (const folder of routeFiles()) {
    if (folder === NOT_FOUND_ROUTE) continue;
    const path = folder.replace(/\[(\w+)\]/g, '{$1}');
    const module = (await import(/* @vite-ignore */ routeModule(path))) as Record<string, unknown>;
    for (const method of METHODS) if (module[method]) routes.push(`${method} ${path}`);
  }
  return routes.sort();
}

async function handlerOf(op: ApiOperation): Promise<ApiRouteHandler<object>> {
  const module = (await import(/* @vite-ignore */ routeModule(op.path))) as Record<string, ApiRouteHandler<object>>;
  return module[op.method]!;
}

/** Every `$ref` in a JSON value. */
function refs(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(refs);
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => (key === '$ref' ? [child as string] : refs(child)));
}

/** Object properties without a description (a `$ref` carries the description of its model). */
function undocumentedProperties(schema: unknown, path: string): string[] {
  if (Array.isArray(schema)) return schema.flatMap((s, i) => undocumentedProperties(s, `${path}[${i}]`));
  if (!schema || typeof schema !== 'object') return [];
  const node = schema as Json;
  const missing: string[] = [];
  for (const [name, property] of Object.entries((node.properties ?? {}) as Record<string, Json>)) {
    if (!property.description && !property.$ref) missing.push(`${path}.${name}`);
  }
  for (const [key, child] of Object.entries(node)) {
    missing.push(...undocumentedProperties(child, key === 'properties' ? path : `${path}.${key}`));
  }
  return missing;
}

async function adminToken(): Promise<string> {
  return (await signAccessToken({ sub: '6730f1c2a4b5c6d7e8f90123', roles: [UserRole.USER, UserRole.ADMIN] })).token;
}

function production(): void {
  vi.stubEnv('NODE_ENV', 'production');
  resetEnvCache();
}

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe('OpenAPI document', () => {
  it('documents every route of the API, and only those', async () => {
    const documented = API_OPERATIONS.map((op) => `${op.method} ${op.path}`).sort();
    expect(documented).toEqual(await exportedRoutes());
    expect(new Set(API_OPERATIONS.map((op) => op.operationId)).size).toBe(API_OPERATIONS.length);
  });

  it('states the access rules, rate limit, origin check and database use of each route', async () => {
    for (const op of API_OPERATIONS) {
      const options = (await handlerOf(op)).apiOptions;
      const access = options.roles?.includes(UserRole.ADMIN)
        ? 'admin'
        : options.clanAccess
          ? 'clan'
          : options.auth
            ? 'user'
            : 'public';
      // `cron` and `adminInProduction` are checked by the route itself.
      const expected = op.access === 'cron' || op.access === 'adminInProduction' ? 'public' : op.access;
      const label = `${op.method} ${op.path}`;
      expect(access, label).toBe(expected);
      expect(options.apiName, label).toBe(op.rateLimit);
      expect(!!options.checkOrigin, label).toBe(!!op.checkOrigin);
      expect(options.database === false, label).toBe(op.database === false);
    }
  });

  it('is a valid OpenAPI 3.1 document', async () => {
    const document = openApiDocument();
    const result = await new Validator().validate(document);
    expect(result.errors ?? []).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('resolves every reference to a model', () => {
    const document = openApiDocument() as { components: { schemas: Json } };
    const models = Object.keys(document.components.schemas);
    const missing = refs(document).filter((ref) => !models.includes(ref.replace('#/components/schemas/', '')));
    expect(missing).toEqual([]);
  });

  it('describes every field of the models and of the requests', () => {
    const document = openApiDocument() as { components: { schemas: Json }; paths: Json };
    const missing = [
      ...undocumentedProperties(document.components.schemas, 'components'),
      ...Object.entries(document.paths).flatMap(([path, item]) =>
        Object.entries(item as Json).flatMap(([method, op]) => {
          const { requestBody, parameters } = op as { requestBody?: unknown; parameters?: Json[] };
          return [
            ...undocumentedProperties(requestBody, `${method} ${path} body`),
            ...(parameters ?? []).filter((p) => !p.description).map((p) => `${method} ${path} parameter ${String(p.name)}`),
          ];
        }),
      ),
    ];
    expect(missing).toEqual([]);
  });
});

describe('response contract', () => {
  const getWar = API_OPERATIONS.find((op) => op.operationId === 'getWar')!;

  it('maps every documented operation to its route handler', async () => {
    const byHandler = await operationsByHandler();
    expect(byHandler.size).toBe(API_OPERATIONS.length);
    expect([...byHandler.keys()].every((handler) => typeof handler === 'function')).toBe(true);
  });

  it('rejects undocumented statuses, fields and message keys', () => {
    const status = { code: 404, name: 'HTTP_STATUS.NOT_FOUND' };
    expect(contractProblems(getWar, 404, { result: null, messages: [{ key: MessageKey.WAR_NOT_FOUND }], status })).toEqual([]);
    expect(contractProblems(getWar, 418, { result: null, messages: [], status })).toEqual([
      'status 418 is not documented (add it to `responses` or `errors`)',
    ]);
    expect(contractProblems(getWar, 404, { result: null, messages: [{ key: MessageKey.BASE_NOT_FOUND }], status })).toEqual([
      'message key ERROR.BASE_NOT_FOUND is not documented for status 404',
    ]);
    expect(contractProblems(getWar, 200, { result: { warKey: 'x' }, messages: [], status })).not.toEqual([]);
    expect(
      contractProblems(getWar, 404, { result: null, messages: [], status, extra: true }).some((p) => p.includes('extra')),
    ).toBe(true);
  });

  it('documents the health check', async () => {
    const { status, body } = await call(getHealth);
    expect([200, 503]).toContain(status);
    expect(body.result).toMatchObject({ warSync: { scheduler: expect.any(String) } });
  });
});

describe('GET /openapi.json', () => {
  it('is public outside production', async () => {
    const { status, body } = await call<never>(getOpenApi);
    expect(status).toBe(200);
    expect(body).toMatchObject({ openapi: '3.1.0', info: { title: 'Crociata Nera API' } });
  });

  it('is for administrators only in production', async () => {
    production();
    const anonymous = await call(getOpenApi);
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get('www-authenticate')).toContain('Basic');
    expect((await call(getOpenApi, { token: await memberToken() })).status).toBe(403);

    const { status, body } = await call<never>(getOpenApi, { token: await adminToken() });
    expect(status).toBe(200);
    expect((body as unknown as { paths: Json }).paths['/wars/{warKey}']).toBeDefined();
  });
});

describe('GET /docs', () => {
  const page = (authorization?: string) =>
    getDocsPage(
      new Request('http://localhost:3001/api/v1/docs', authorization ? { headers: { authorization } } : undefined),
      { params: Promise.resolve({}) },
    );
  const basic = (identifier: string, password: string) =>
    `Basic ${Buffer.from(`${identifier}:${password}`).toString('base64')}`;

  async function account(username: string, roles: UserRole[]) {
    await UserModel.create({
      email: `${username}@x.io`,
      username,
      usernameKey: username.toLowerCase(),
      passwordHash: await hashPassword('secret123'),
      roles,
    });
  }

  it('serves Swagger UI outside production', async () => {
    const response = await page();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toContain("url: './openapi.json'");
  });

  it('asks for the credentials of an administrator in production (browser login dialog)', async () => {
    production();
    await account('Boss', [UserRole.USER, UserRole.ADMIN]);
    await account('Member', [UserRole.USER]);

    const anonymous = await page();
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get('www-authenticate')).toBe('Basic realm="Crociata Nera API", charset="UTF-8"');

    const wrong = await page(basic('Boss', 'wrong-password'));
    expect(wrong.status).toBe(401);
    expect(wrong.headers.get('www-authenticate')).toContain('Basic');
    expect((await wrong.json()).messages).toEqual([{ key: MessageKey.INVALID_CREDENTIALS }]);

    expect((await page(basic('Member', 'secret123'))).status).toBe(403);
    // Username (any case) or email.
    expect((await page(basic('boss', 'secret123'))).status).toBe(200);
    expect((await page(basic('boss@x.io', 'secret123'))).status).toBe(200);
  });

  it('lets the page read the document with the same credentials in production', async () => {
    production();
    await account('Boss', [UserRole.USER, UserRole.ADMIN]);
    const response = await getOpenApi(
      new Request('http://localhost:3001/api/v1/openapi.json', { headers: { authorization: basic('Boss', 'secret123') } }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ openapi: '3.1.0' });
  });
});
