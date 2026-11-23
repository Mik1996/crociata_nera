import type { APIRequestContext, APIResponse } from '@playwright/test';

/** `BaseResult` of every backend response. */
export interface BaseResult<T = any> {
  result: T | null;
  messages: { key: string; field?: string; params?: Record<string, unknown> }[];
  status: number;
}

export interface ApiReply<T = any> {
  status: number;
  body: BaseResult<T>;
  headers: Record<string, string>;
  /** Every `Set-Cookie` header of the response. */
  setCookies: string[];
}

export interface RequestOptions {
  /** JSON body, or a multipart form (`{ field: value | { name, mimeType, buffer } }`). */
  data?: unknown;
  multipart?: Record<string, string | { name: string; mimeType: string; buffer: Buffer }>;
  headers?: Record<string, string>;
  /** Sends no `Authorization` header even when the client holds a token. */
  anonymous?: boolean;
}

/**
 * HTTP client of the backend, going through the frontend's `/api/v1` proxy like the browser.
 * Each instance has its own cookie jar (refresh cookie) and, optionally, an access token.
 */
export class ApiClient {
  accessToken: string | null = null;

  constructor(readonly request: APIRequestContext) {}

  async call<T = any>(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<ApiReply<T>> {
    const headers: Record<string, string> = { ...options.headers };
    if (this.accessToken && !options.anonymous && !('authorization' in headers))
      headers.authorization = `Bearer ${this.accessToken}`;
    const response = await this.request.fetch(`/api/v1${path}`, {
      method,
      headers,
      data: options.data,
      multipart: options.multipart,
      failOnStatusCode: false,
      maxRedirects: 0,
    });
    return toReply<T>(response);
  }

  get = <T = any>(path: string, options?: RequestOptions) => this.call<T>('GET', path, options);
  post = <T = any>(path: string, data?: unknown, options?: RequestOptions) =>
    this.call<T>('POST', path, { ...options, data });
  put = <T = any>(path: string, data?: unknown, options?: RequestOptions) =>
    this.call<T>('PUT', path, { ...options, data });
  patch = <T = any>(path: string, data?: unknown, options?: RequestOptions) =>
    this.call<T>('PATCH', path, { ...options, data });
  delete = <T = any>(path: string, data?: unknown, options?: RequestOptions) =>
    this.call<T>('DELETE', path, { ...options, data });

  /** Signs in and keeps the access token (the refresh cookie stays in this client's jar). */
  async signIn(identifier: string, password: string): Promise<ApiReply<AuthResult>> {
    const reply = await this.post<AuthResult>('/auth/sign-in', { identifier, password });
    if (reply.status === 200) this.accessToken = reply.body.result!.accessToken;
    return reply;
  }

  /** New access token from the refresh cookie (rotates the cookie). */
  async refresh(): Promise<ApiReply<AuthResult>> {
    const reply = await this.post<AuthResult>('/auth/refresh', undefined, { anonymous: true });
    if (reply.status === 200) this.accessToken = reply.body.result!.accessToken;
    return reply;
  }

  async me(): Promise<PublicUser> {
    const reply = await this.get<PublicUser>('/auth/me');
    if (reply.status !== 200)
      throw new Error(`GET /auth/me: ${reply.status} ${JSON.stringify(reply.body)}`);
    return reply.body.result!;
  }
}

export async function toReply<T>(response: APIResponse): Promise<ApiReply<T>> {
  const text = await response.text();
  let body: BaseResult<T>;
  try {
    body = JSON.parse(text) as BaseResult<T>;
  } catch {
    body = { result: null, messages: [], status: response.status(), raw: text } as BaseResult<T>;
  }
  return {
    status: response.status(),
    body,
    headers: response.headers(),
    setCookies: response
      .headersArray()
      .filter((h) => h.name.toLowerCase() === 'set-cookie')
      .map((h) => h.value),
  };
}

/** Message keys of a reply (`ERROR.*` / `SUCCESS.*`). */
export const messageKeys = (reply: ApiReply) => reply.body.messages.map((m) => m.key);

/** Value of the refresh cookie in `Set-Cookie` headers (`''` when cleared, `undefined` when absent). */
export function refreshCookieValue(reply: ApiReply): string | undefined {
  const cookie = reply.setCookies.find((c) => c.startsWith('cn_refresh='));
  return cookie?.split(';')[0]!.slice('cn_refresh='.length);
}

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  accessTokenExpiresAt: string;
}

export interface PublicUser {
  id: string;
  email: string;
  username: string;
  roles: ('USER' | 'ADMIN')[];
  players: { tag: string; verified: boolean }[];
  emailVerified: boolean;
  clanAccess: boolean;
  leaderAccess: boolean;
  createdAt: string;
}
