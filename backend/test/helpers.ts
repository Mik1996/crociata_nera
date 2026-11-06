import type { BaseResult } from '@/lib/http/base-result';

export const ORIGIN = 'http://localhost:4200';

type Handler = (request: Request, context: { params: Promise<any> }) => Promise<Response>;

export interface CallOptions {
  method?: string;
  body?: unknown;
  token?: string;
  cookie?: string;
  origin?: string | null;
  ip?: string;
  params?: Record<string, string>;
  path?: string;
}

export interface CallResult<T> {
  status: number;
  body: BaseResult<T>;
  headers: Headers;
  /** Value of the refresh cookie set by the response, if any. */
  refreshCookie: string | undefined;
}

/** Invokes a Route Handler as Next.js would. */
export async function call<T = any>(handler: Handler, options: CallOptions = {}): Promise<CallResult<T>> {
  const headers = new Headers({ 'content-type': 'application/json', 'x-forwarded-for': options.ip ?? '10.0.0.1' });
  if (options.origin !== null) headers.set('origin', options.origin ?? ORIGIN);
  if (options.token) headers.set('authorization', `Bearer ${options.token}`);
  if (options.cookie) headers.set('cookie', `cn_refresh=${options.cookie}`);

  const request = new Request(`http://localhost:3001${options.path ?? '/api/v1/test'}`, {
    method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
    headers,
    body: options.body === undefined ? undefined : typeof options.body === 'string' ? options.body : JSON.stringify(options.body),
  });
  const response = await handler(request, { params: Promise.resolve(options.params ?? {}) });
  const setCookie = response.headers.getSetCookie().find((c) => c.startsWith('cn_refresh='));
  return {
    status: response.status,
    body: (await response.json()) as BaseResult<T>,
    headers: response.headers,
    refreshCookie: setCookie?.split(';')[0]?.slice('cn_refresh='.length),
  };
}

/** A `currentwar` payload as returned by the Clash of Clans API. */
export function cocWar(overrides: Record<string, unknown> = {}) {
  return {
    state: 'inWar',
    teamSize: 2,
    attacksPerMember: 2,
    battleModifier: 'none',
    preparationStartTime: '20261104T100000.000Z',
    startTime: '20261105T100000.000Z',
    endTime: '20261106T100000.000Z',
    clan: {
      tag: '#2J8JVVCLC',
      name: 'Crociata Nera',
      clanLevel: 12,
      badgeUrls: { large: 'https://api-assets.clashofclans.com/badges/512/x.png' },
      attacks: 1,
      stars: 3,
      destructionPercentage: 50,
      members: [
        {
          tag: '#AAA111',
          name: 'Alice',
          townhallLevel: 16,
          mapPosition: 1,
          opponentAttacks: 0,
          attacks: [{ attackerTag: '#AAA111', defenderTag: '#BBB222', stars: 3, destructionPercentage: 100, order: 1, duration: 120 }],
        },
        { tag: '#AAA222', name: 'Bob', townhallLevel: 15, mapPosition: 2, opponentAttacks: 1 },
      ],
    },
    opponent: {
      tag: '#OPP999',
      name: 'Rivals',
      clanLevel: 10,
      attacks: 1,
      stars: 1,
      destructionPercentage: 40,
      members: [{ tag: '#BBB222', name: 'Eve', townhallLevel: 16, mapPosition: 1, opponentAttacks: 1 }],
    },
    ...overrides,
  };
}
