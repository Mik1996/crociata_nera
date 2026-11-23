import type { ApiClient, ApiReply } from '../../support/api';
import { messageKeys } from '../../support/api';
import { expect, test } from '../../support/fixtures';
import { CLANS, stack } from '../../support/stack';
import type { UserFactory } from '../../support/users';
import { ACCESS_SPEC, type Access, type Rule } from './access-spec';

/**
 * Every operation of the API called over HTTP by every kind of caller, against the committed
 * security requirement (`access-spec.ts`), not against what the backend says about itself:
 * - refused callers get exactly 401 (signed out) or 403 with the level's message key, and no data;
 * - allowed callers get past the check: the operation's probe answers with its exact status;
 * - the live API and its documentation must list the same operations, with the same levels, as the
 *   specification (a new route, or a changed level, fails here until the specification says so).
 */

type Caller =
  | 'anonymous'
  | 'signed-in outside the clans'
  | 'clan member'
  | 'sister clan member'
  | 'clan leader'
  | 'administrator';

const RANK: Record<Caller, number> = {
  anonymous: 0,
  'signed-in outside the clans': 1,
  'clan member': 2,
  'sister clan member': 2,
  'clan leader': 3,
  administrator: 4,
};

/** Lowest rank a level lets in, and the message key of a signed-in caller below it. */
const LEVELS: Record<Exclude<Access, 'cron' | 'telegram'>, { rank: number; key?: string }> = {
  public: { rank: 0 },
  user: { rank: 1 },
  clan: { rank: 2, key: 'ERROR.CLAN_ACCESS_REQUIRED' },
  leader: { rank: 3, key: 'ERROR.LEADER_ACCESS_REQUIRED' },
  admin: { rank: 4, key: 'ERROR.FORBIDDEN' },
};

type Expectation =
  | { kind: 'refused'; status: 401 | 403; key?: string }
  | { kind: 'allowed' }
  | { kind: 'nobody'; status: number };

function expectation(rule: Rule, caller: Caller): Expectation {
  // No user token opens them, whoever holds it: their probe is the answer everyone gets.
  if (rule.access === 'cron' || rule.access === 'telegram')
    return { kind: 'nobody', status: rule.probe.status };
  const level = LEVELS[rule.access];
  const rank = RANK[caller];
  if (rank >= level.rank) return { kind: 'allowed' };
  return rank === 0
    ? { kind: 'refused', status: 401 }
    : { kind: 'refused', status: 403, key: level.key };
}

/** Real values of the stack for the path parameters, so allowed reads find what they ask for. */
async function pathParams(admin: ApiClient): Promise<Record<string, string>> {
  const { clans } = await stack.game();
  const wars = await admin.get('/wars');
  const months = await admin.get('/history');
  const raids = await admin.get('/raids/seasons');
  const params = {
    warKey: wars.body.result?.items?.[0]?.warKey,
    period: months.body.result?.[0]?.month,
    // The game's `20261120T070000.000Z` as the ISO date the route takes.
    startTime: String(raids.body.result?.[0]?.startTime ?? '').replace(
      /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/,
      '$1-$2-$3T$4:$5:$6',
    ),
    tag: encodeURIComponent(clans[CLANS.nera]!.memberList[0]!.tag),
    // No CWL in the stack's data: the season is valid and has no data (404 in the probes).
    season: '2026-11',
    // Base pictures: a well-formed random key that names no picture.
    key: 'e2e0'.repeat(8),
    variant: 'thumb',
    id: '0123456789abcdef01234567',
    page: '1',
    chatId: '-1001',
  };
  for (const [name, value] of Object.entries(params))
    expect(value, `path parameter ${name} from the stack's data`).toBeTruthy();
  return params as Record<string, string>;
}

const fill = (path: string, params: Record<string, string>) =>
  path.replace(/\{(\w+)\}/g, (_, name: string) => params[name] ?? `{${name}}`);

async function callerFor(caller: Caller, users: UserFactory, anonymous: ApiClient) {
  switch (caller) {
    case 'anonymous':
      return anonymous;
    case 'signed-in outside the clans':
      return (await users.create({ access: 'outside' })).api;
    case 'clan member':
      return (await users.create({ access: 'member' })).api;
    case 'sister clan member':
      return (await users.create({ access: 'sister' })).api;
    case 'clan leader':
      return (await users.create({ access: 'leader' })).api;
    case 'administrator':
      return (await users.create({ admin: true })).api;
  }
}

test.describe('Authorization of every API operation @P0', () => {
  test('the API lists exactly the operations of the specification, with the same levels', async ({
    sharedAdmin,
  }) => {
    const reply = await (await sharedAdmin.api()).get('/openapi.json');
    expect(reply.status).toBe(200);
    const document = reply.body as unknown as {
      paths: Record<string, Record<string, { 'x-access': string }>>;
    };
    const documented = Object.fromEntries(
      Object.entries(document.paths).flatMap(([path, methods]) =>
        Object.entries(methods).map(([method, op]) => [
          `${method.toUpperCase()} ${path}`,
          // "administrators only in production" is the `admin` level of the specification.
          op['x-access'] === 'adminInProduction' ? 'admin' : op['x-access'],
        ]),
      ),
    );
    const specified = Object.fromEntries(
      Object.entries(ACCESS_SPEC).map(([operation, rule]) => [operation, rule.access]),
    );
    expect(Object.keys(documented).sort(), 'operations of the API vs access-spec.ts').toEqual(
      Object.keys(specified).sort(),
    );
    expect(documented, 'documented levels vs access-spec.ts').toEqual(specified);
  });

  for (const caller of Object.keys(RANK) as Caller[]) {
    test(`as ${caller}`, async ({ api, users, sharedAdmin }) => {
      const params = await pathParams(await sharedAdmin.api());
      const client = await callerFor(caller, users, api);
      const counts = { refused: 0, allowed: 0, nobody: 0 };
      const log: string[] = [];

      for (const [operation, rule] of Object.entries(ACCESS_SPEC)) {
        const [method, path] = operation.split(' ') as [string, string];
        const expected = expectation(rule, caller);
        const label = `${operation} (${rule.access}) as ${caller}`;
        let reply: ApiReply;

        if (expected.kind === 'allowed') {
          reply = await client.call(method, fill(rule.probe.path ?? path, params), {
            data: rule.probe.body,
            headers: rule.probe.headers,
          });
          expect.soft(reply.status, `${label}: allowed, probe answer`).toBe(rule.probe.status);
          if (rule.probe.key)
            expect.soft(messageKeys(reply), `${label}: probe message`).toContain(rule.probe.key);
        } else {
          // Refused calls carry no body: the access check comes before any input is read.
          reply = await client.call(method, fill(path, params));
          expect.soft(reply.status, `${label}: must be refused`).toBe(expected.status);
          if (expected.kind === 'refused' && expected.key)
            expect.soft(messageKeys(reply), `${label}: message`).toContain(expected.key);
          expect.soft(reply.body.result ?? null, `${label}: must not return data`).toBeNull();
        }
        counts[expected.kind]++;
        log.push(`${expected.kind.padEnd(7)} ${reply.status}  ${operation} (${rule.access})`);
      }

      await test.info().attach(`operations checked as ${caller}`, {
        body: log.join('\n'),
        contentType: 'text/plain',
      });
      // Every operation was called, and each kind of caller meets both answers.
      expect(log).toHaveLength(Object.keys(ACCESS_SPEC).length);
      if (caller === 'anonymous') expect(counts.refused).toBeGreaterThan(50);
      if (caller === 'administrator') expect(counts.allowed).toBeGreaterThan(70);
      else expect(counts.refused).toBeGreaterThan(0);
    });
  }
});
