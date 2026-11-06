import { env } from '../config/env';

const ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
const ALLOWED_HEADERS = 'Authorization, Content-Type';

export function isOriginAllowed(origin: string | null): boolean {
  return !!origin && env().FRONTEND_URL.includes(origin);
}

/**
 * CORS headers for an allowed origin (credentials included: the refresh cookie).
 * In development the Angular dev server proxies `/api/v1`, so requests are same-origin
 * and these headers are only needed for direct cross-origin calls.
 */
export function corsHeaders(origin: string | null): Record<string, string> {
  if (!isOriginAllowed(origin)) return { Vary: 'Origin' };
  return {
    'Access-Control-Allow-Origin': origin!,
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  };
}

/** Response to a CORS preflight (`OPTIONS`). */
export function preflight(request: Request): Response {
  const origin = request.headers.get('origin');
  if (!isOriginAllowed(origin)) return new Response(null, { status: 403, headers: { Vary: 'Origin' } });
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(origin),
      'Access-Control-Allow-Methods': ALLOWED_METHODS,
      'Access-Control-Allow-Headers': ALLOWED_HEADERS,
      'Access-Control-Max-Age': '600',
    },
  });
}
