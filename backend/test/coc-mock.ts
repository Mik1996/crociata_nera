import { vi } from 'vitest';

type Reply = { status?: number; body: unknown };

/**
 * Fake Clash of Clans API: maps a path suffix (`/currentwar`, `/warlog`) to a reply.
 * Returns the mock so tests can inspect the calls.
 */
export function mockCocApi(routes: Record<string, Reply | (() => Reply)>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    const entry = Object.entries(routes).find(([suffix]) => new URL(url).pathname.endsWith(suffix));
    if (!entry) return new Response(JSON.stringify({ reason: 'notFound' }), { status: 404 });
    const reply = typeof entry[1] === 'function' ? entry[1]() : entry[1];
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
