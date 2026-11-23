import { expect } from '@playwright/test';
import { FAKES_URL } from '../stack/config.mjs';

export * from '../stack/config.mjs';

/** Pools of game accounts handed out by the stack (see e2e/stack/fakes.mjs). */
export type AccountPool = 'member' | 'leader' | 'sister' | 'outside' | 'admin';

export interface Mail {
  to: string[];
  subject: string;
  from: string;
  body: string;
  links: string[];
  receivedAt: string;
}

async function control<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const response = await fetch(`${FAKES_URL}/__e2e${path}`, {
    method: init?.method ?? (init?.body === undefined ? 'GET' : 'POST'),
    headers: { 'content-type': 'application/json' },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!response.ok)
    throw new Error(`stack control ${path}: HTTP ${response.status} ${await response.text()}`);
  return (await response.json()) as T;
}

/** Control API of the e2e stack: accounts, mailbox, game data, read-only database lookups. */
export const stack = {
  /** Takes a free game account (or administrator email) for the current test. */
  takeAccount: (pool: AccountPool) =>
    control<{ tag: string; name: string | null }>('/accounts/take', { body: { pool } }),
  releaseAccount: (tag: string) => control('/accounts/release', { body: { tag } }),

  /** Emails received for `to` (oldest first). */
  mails: (to: string) => control<Mail[]>(`/mail?to=${encodeURIComponent(to)}`),

  /**
   * Waits for the `index`-th email (0-based) sent to `to` containing a link to `path`, and returns
   * that link. Emails are sent after the response in some flows: polled, never a fixed wait.
   */
  async waitForLink(to: string, path: string, index = 0): Promise<string> {
    let links: string[] = [];
    await expect
      .poll(
        async () => {
          links = (await stack.mails(to)).flatMap((m) =>
            m.links.filter((l) => new URL(l).pathname === path),
          );
          return links.length;
        },
        { message: `email with a ${path} link for ${to}`, timeout: 15_000 },
      )
      .toBeGreaterThan(index);
    return links[index]!;
  },

  /** How many links to `path` the emails sent to `to` contain so far. */
  async linkCount(to: string, path: string): Promise<number> {
    return (await stack.mails(to)).flatMap((m) =>
      m.links.filter((l) => new URL(l).pathname === path),
    ).length;
  },

  /** Game data the stack served to the backend (to compare the pages with). */
  game: () => control<GameData>('/game'),

  /**
   * Report of the network guard of each server: loaded, self-test result, outbound attempts it
   * blocked (self-test excluded). See e2e/stack/no-egress.cjs.
   */
  egress: () => control<Partial<Record<'backend' | 'frontend', EgressReport>>>('/egress'),

  /** Read-only lookup in the test database (persistence checks). */
  find: <T = Record<string, unknown>>(
    collection: string,
    filter: Record<string, unknown>,
    projection?: Record<string, 0 | 1>,
  ) => control<T[]>('/db/find', { body: { collection, filter, projection } }),
};

export interface EgressReport {
  active: boolean;
  selfTest: 'passed' | string | null;
  /** Lines of the attempts the guard blocked. */
  blocked: string[];
}

/** Subset of the fake game data used by the tests. */
export interface GameData {
  clans: Record<
    string,
    { tag: string; name: string; memberList: { tag: string; name: string; role: string }[] }
  >;
  endedWars: CocWar[];
  battleDay: CocWar;
  raids: {
    state: string;
    startTime: string;
    capitalTotalLoot: number;
    members: { tag: string; name: string; capitalResourcesLooted: number }[];
  }[];
}

export interface CocWar {
  state: string;
  preparationStartTime: string;
  endTime: string;
  clan: {
    tag: string;
    name: string;
    stars: number;
    destructionPercentage: number;
    members: { tag: string; name: string }[];
  };
  opponent: { tag: string; name: string; stars: number; destructionPercentage: number };
}
