import mongoose from 'mongoose';
import { userHasClanAccess } from '@/modules/access/clan-access.service';
import { verifyAccessToken } from '../auth/tokens';
import { UserRole } from '../auth/user-role';
import { connectToDatabase } from '../db/mongoose';
import { ApiError, throwException } from './api-error';
import { ApiName } from './api-name';
import { buildResult, MessageDescriptor } from './base-result';
import { corsHeaders, isOriginAllowed } from './cors';
import { MessageKey } from './message-key';
import { consumeRateLimit } from './rate-limit';

/** Authenticated caller, from the access token. */
export interface AuthUser {
  id: string;
  roles: UserRole[];
}

export interface ApiContext<P, A extends boolean> {
  request: Request;
  params: P;
  /** Present when `auth: true` (guaranteed) or when a valid token was sent anyway. */
  user: A extends true ? AuthUser : AuthUser | null;
  ip: string;
}

/** What a handler returns; the wrapper turns it into a `BaseResult` response. */
export interface ApiResponse<T> {
  status?: number;
  result?: T | null;
  messages?: MessageDescriptor[];
  /** Extra headers; `Set-Cookie` may appear more than once. */
  headers?: [string, string][];
}

export interface ApiHandlerOptions<A extends boolean> {
  /** Enables the rate limit configured for this API. */
  apiName?: ApiName;
  /** Requires a valid `Authorization: Bearer <access token>`. */
  auth?: A;
  /** Requires at least one of these roles (implies `auth`). */
  roles?: UserRole[];
  /**
   * Requires full access to the site (implies `auth`): administrators, and users with a verified
   * account currently in a clan of the Crusade. Use it on every route serving the clans' data.
   */
  clanAccess?: boolean;
  /**
   * Rejects requests whose `Origin` is not an allowed frontend. Use it on routes
   * authenticated by the refresh cookie, as a CSRF defence on top of `SameSite=Strict`.
   */
  checkOrigin?: boolean;
  /** Connects to MongoDB before running the handler (default `true`). */
  database?: boolean;
}

type RouteContext<P> = { params: Promise<P> };

/**
 * A Route Handler built by {@link apiHandler}. Its options stay readable, so the tests can check
 * that the OpenAPI document (`src/openapi`) describes the access rules and rate limit it enforces.
 */
export type ApiRouteHandler<P> = ((request: Request, routeContext: RouteContext<P>) => Promise<Response>) & {
  readonly apiOptions: Readonly<ApiHandlerOptions<boolean>>;
};

/**
 * Wraps a Route Handler with the cross-cutting concerns that continental-be implements as
 * middleware, guards, interceptor and exception filter: rate limit, origin check,
 * authentication, roles, database connection, response envelope and error mapping.
 */
export function apiHandler<P extends object = object, T = unknown, A extends boolean = false>(
  options: ApiHandlerOptions<A>,
  /** Returns a `BaseResult` description, or a ready `Response` for non-JSON content (images). */
  handler: (context: ApiContext<P, A>) => Promise<ApiResponse<T> | Response>,
): ApiRouteHandler<P> {
  const route = async (request: Request, routeContext: RouteContext<P>): Promise<Response> => {
    const origin = request.headers.get('origin');
    const ip = clientIp(request);

    try {
      if (options.apiName) {
        const { allowed, retryAfter } = consumeRateLimit(options.apiName, ip);
        if (!allowed) throwException(429, MessageKey.TOO_MANY_REQUESTS, { 'Retry-After': String(retryAfter) });
      }

      if (options.checkOrigin && origin !== null && !isOriginAllowed(origin)) {
        throwException(403, MessageKey.ORIGIN_NOT_ALLOWED);
      }

      const user = await authenticate(request, !!options.auth || !!options.roles?.length || !!options.clanAccess);
      if (options.roles?.length && !options.roles.some((role) => user!.roles.includes(role))) {
        throwException(403, MessageKey.FORBIDDEN);
      }

      if (options.database !== false || options.clanAccess) await connectToDatabase();
      if (options.clanAccess && !(await userHasClanAccess(user!.id))) {
        throwException(403, MessageKey.CLAN_ACCESS_REQUIRED);
      }

      const params = (await routeContext?.params) ?? ({} as P);
      const response = await handler({ request, params, user: user as ApiContext<P, A>['user'], ip });
      if (response instanceof Response) return response;
      return respond(response.status ?? 200, response.result ?? null, response.messages, origin, response.headers);
    } catch (error) {
      return respondWithError(error, origin);
    }
  };
  return Object.assign(route, { apiOptions: options });
}

async function authenticate(request: Request, required: boolean): Promise<AuthUser | null> {
  const header = request.headers.get('authorization');
  const token = header?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return required ? throwException(401, MessageKey.UNAUTHORIZED) : null;

  const payload = await verifyAccessToken(token);
  if (!payload) return required ? throwException(401, MessageKey.INVALID_TOKEN) : null;
  return { id: payload.sub, roles: payload.roles };
}

function respond(
  status: number,
  result: unknown,
  messages: MessageDescriptor[] = [],
  origin: string | null,
  extraHeaders: [string, string][] = [],
): Response {
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  for (const [name, value] of Object.entries(corsHeaders(origin))) headers.set(name, value);
  for (const [name, value] of extraHeaders) headers.append(name, value);
  return new Response(JSON.stringify(buildResult(status, result, messages)), { status, headers });
}

function respondWithError(error: unknown, origin: string | null): Response {
  if (error instanceof ApiError) {
    return respond(error.statusCode, null, error.messages, origin, Object.entries(error.headers));
  }
  if (isDatabaseUnavailable(error)) {
    console.error('[api] database unavailable:', (error as Error).message);
    return respond(503, null, [{ key: MessageKey.SERVICE_UNAVAILABLE }], origin);
  }
  // Unexpected: log the details, never send them to the client.
  console.error('[api] unhandled error:', error);
  return respond(500, null, [{ key: MessageKey.UNHANDLED_ERROR }], origin);
}

function isDatabaseUnavailable(error: unknown): boolean {
  return error instanceof mongoose.Error.MongooseServerSelectionError || (error as Error)?.name === 'MongoNetworkError';
}

/**
 * Client IP for rate limiting. `X-Forwarded-For` is trusted: deploy behind a reverse
 * proxy that overwrites it (Vercel, nginx…), otherwise clients can spoof it.
 */
function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip') || 'unknown';
}
