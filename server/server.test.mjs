// Proxy tests: node --test server/
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createApp } from './app.mjs';
import { WarArchive, warId } from './archive.mjs';
import { CocClient } from './coc-client.mjs';
import { COC_ROUTES, resolveCocRoute } from './coc-routes.mjs';
import { MonthlyHistory } from './history.mjs';
import { RateLimiter } from './rate-limit.mjs';

const TAG = '#2J8JVVCLC';

function war(state, stars = 10) {
  return {
    state,
    teamSize: 1,
    preparationStartTime: '20261104T100000.000Z',
    startTime: '20261105T090000.000Z',
    endTime: '20261106T090000.000Z',
    clan: { tag: TAG, name: 'Crociata Nera', stars, members: [{ tag: '#A', name: 'A', mapPosition: 1, townhallLevel: 15, opponentAttacks: 0 }] },
    opponent: { tag: '#OPP', name: 'Opp', stars: 3, members: [] },
  };
}

/** Fake fetch: responds based on the path and records the calls. */
function fakeFetch(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, auth: init.headers.Authorization });
    const path = url.replace('https://api.clashofclans.com/v1', '');
    const [status, body] = responses[path] ?? [404, { reason: 'notFound' }];
    return new Response(JSON.stringify(body), { status });
  };
  return { fn, calls };
}

describe('WarArchive', () => {
  let dir;
  before(async () => (dir = await mkdtemp(join(tmpdir(), 'cn-archive-'))));
  after(() => rm(dir, { recursive: true, force: true }));

  it('ignores responses without a war', async () => {
    const archive = new WarArchive(join(dir, 'a.json'));
    assert.equal(await archive.save({ state: 'notInWar' }), false);
    assert.deepEqual(await archive.list(), []);
  });

  it('updates the snapshot and does not overwrite an ended war', async () => {
    const file = join(dir, 'b.json');
    const archive = new WarArchive(file);
    assert.equal(await archive.save(war('inWar', 5)), true);
    assert.equal(await archive.save(war('warEnded', 12)), true);
    assert.equal(await archive.save(war('inWar', 7)), false);

    const reloaded = new WarArchive(file);
    const [saved] = await reloaded.list();
    assert.equal(saved.state, 'warEnded');
    assert.equal(saved.clan.stars, 12);
    assert.ok(JSON.parse(await readFile(file, 'utf8'))[warId(saved)]);
  });
});

describe('HTTP proxy', () => {
  let server;
  let base;
  let dir;
  const enc = encodeURIComponent(TAG);
  const { fn, calls } = fakeFetch({
    [`/clans/${enc}`]: [200, { tag: TAG, name: 'Crociata Nera', memberList: [{ tag: '#P1', name: 'Player one' }] }],
    ['/players/%23P1']: [200, { tag: '#P1', name: 'Player one', townHallLevel: 17 }],
    ['/players/%23NOTMEMBER']: [200, { tag: '#NOTMEMBER', name: 'Someone else', townHallLevel: 12 }],
    ['/clans/%23OTHER']: [200, { tag: '#OTHER', name: 'Other clan' }],
    ['/clans?limit=5&name=crociata']: [200, { items: [{ tag: TAG, name: 'Crociata Nera' }], paging: { cursors: {} } }],
    ['/locations/32000120/rankings/clans?limit=10']: [200, { items: [{ tag: '#R1', rank: 1 }] }],
    [`/clans/${enc}/currentwar`]: [200, war('inWar')],
    [`/clans/${enc}/warlog?limit=50`]: [403, { reason: 'accessDenied', message: 'private war log' }],
  });

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cn-proxy-'));
    const client = new CocClient({ token: 'secret', fetchFn: fn });
    server = createApp({
      client,
      archive: new WarArchive(join(dir, 'w.json')),
      history: new MonthlyHistory(join(dir, 'history')),
      clanTag: TAG,
      rateLimiter: new RateLimiter({ max: 8 }),
    }).listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://localhost:${server.address().port}`;
  });
  after(async () => {
    server.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('forwards clan requests adding the token', async () => {
    const r = await fetch(`${base}/api/coc/clans/${enc}`);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).name, 'Crociata Nera');
    assert.equal(calls.at(-1).auth, 'Bearer secret');
  });

  it('archives the current war when it is requested', async () => {
    await fetch(`${base}/api/coc/clans/${enc}/currentwar`);
    const archived = await (await fetch(`${base}/api/coc/archive/wars`)).json();
    assert.equal(archived.length, 1);
    assert.equal(archived[0].opponent.tag, '#OPP');
  });

  it('propagates API errors with the original reason and status', async () => {
    const r = await fetch(`${base}/api/coc/clans/${enc}/warlog`);
    assert.equal(r.status, 403);
    assert.equal((await r.json()).reason, 'accessDenied');
  });

  it('forwards the official endpoints in the allowlist, with their query parameters', async () => {
    const clan = await fetch(`${base}/api/coc/clans/%23other`);
    assert.equal(clan.status, 200);
    assert.equal((await clan.json()).name, 'Other clan');

    // Parameters re-built in a stable order, so equivalent requests share the cache.
    const search = await fetch(`${base}/api/coc/clans?name=crociata&limit=5`);
    assert.equal(search.status, 200);
    assert.equal(calls.at(-1).url, 'https://api.clashofclans.com/v1/clans?limit=5&name=crociata');

    const ranking = await fetch(`${base}/api/coc/locations/32000120/rankings/clans?limit=10`);
    assert.equal((await ranking.json()).items[0].rank, 1);
  });

  it('refuses paths, methods and parameters outside the allowlist without calling the API', async () => {
    const callsBefore = calls.length;
    const cases = [
      [`${base}/api/coc/clans/%23OTHER/secret`, 404],
      [`${base}/api/coc/players/not-a-tag`, 404],
      [`${base}/api/coc/CLANS/%23OTHER`, 404],
      [`${base}/api/coc/clans/%23OTHER/members?token=x`, 400],
      [`${base}/api/coc/clans/%23OTHER/members?limit=1000`, 400],
      [`${base}/api/coc/clans?name=ab`, 400],
      [`${base}/api/coc/clans?limit=5&limit=6`, 400],
    ];
    for (const [url, status] of cases) {
      const r = await fetch(url);
      assert.equal(r.status, status, url);
    }
    assert.equal((await fetch(`${base}/api/coc/clans/${enc}`, { method: 'POST' })).status, 405);
    assert.equal(calls.length, callsBefore);
  });

  it('uses the cache for repeated requests', async () => {
    const callsBefore = calls.length;
    await fetch(`${base}/api/coc/clans/${enc}`);
    assert.equal(calls.length, callsBefore);
  });

  it('returns the profile of a clan member', async () => {
    const r = await fetch(`${base}/api/coc/players/%23p1`);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).townHallLevel, 17);
  });

  it('returns the profile of any player (tags are case-insensitive)', async () => {
    const r = await fetch(`${base}/api/coc/players/%23notmember`);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).name, 'Someone else');
    assert.equal(calls.at(-1).url, 'https://api.clashofclans.com/v1/players/%23NOTMEMBER');
  });

  it('limits the requests per IP on the generic endpoints (not on the clan routes)', async () => {
    let throttled;
    for (let i = 0; i < 12 && !throttled; i++) {
      const r = await fetch(`${base}/api/coc/players/%23P1`, { headers: { 'X-Forwarded-For': '203.0.113.7' } });
      if (r.status === 429) throttled = r;
    }
    assert.ok(throttled, 'expected a 429');
    assert.equal((await throttled.json()).reason, 'requestThrottled');
    assert.ok(Number(throttled.headers.get('retry-after')) > 0);

    // Another client, and the routes of the clan itself, are not affected.
    const other = await fetch(`${base}/api/coc/players/%23P1`, { headers: { 'X-Forwarded-For': '198.51.100.1' } });
    assert.equal(other.status, 200);
    const clan = await fetch(`${base}/api/coc/clans/${enc}`, { headers: { 'X-Forwarded-For': '203.0.113.7' } });
    assert.equal(clan.status, 200);
  });

  it('exposes a health check', async () => {
    const r = await fetch(`${base}/api/health`);
    assert.deepEqual(await r.json(), { status: 'ok', clanTag: TAG });
  });
});

describe('Clash of Clans routes allowlist', () => {
  const resolve = (path, query = '') => resolveCocRoute(path, new URLSearchParams(query));

  it('covers every endpoint of the official API used by the frontend client', () => {
    const paths = [
      '/players/%23P1', '/players/%23P1/battlelog', '/players/%23P1/leaguehistory',
      '/clans', '/clans/%23C1', '/clans/%23C1/members', '/clans/%23C1/warlog', '/clans/%23C1/currentwar',
      '/clans/%23C1/currentwar/leaguegroup', '/clans/%23C1/capitalraidseasons', '/clanwarleagues/wars/%23W1',
      '/leagues', '/leagues/29000022/seasons', '/leagues/29000022/seasons/2026-10', '/leaguetiers', '/leaguetiers/105000016',
      '/warleagues', '/warleagues/48000015', '/capitalleagues', '/capitalleagues/85000022',
      '/builderbaseleagues', '/builderbaseleagues/44000041', '/leaguegroup/%23G1/2026-10',
      '/locations', '/locations/32000120', '/locations/32000120/rankings/clans', '/locations/32000120/rankings/players',
      '/locations/32000120/rankings/clans-builder-base', '/locations/32000120/rankings/players-builder-base',
      '/locations/32000120/rankings/capitals',
      '/goldpass/seasons/current', '/labels/clans', '/labels/players',
    ];
    assert.equal(paths.length, COC_ROUTES.length);
    for (const path of paths) assert.ok('upstream' in resolve(path), path);
  });

  it('validates the parameters and normalises tags', () => {
    assert.deepEqual(resolve('/clans/%23abc123/members', 'limit=10&after=eyJwb3MiOjEwfQ'), {
      upstream: '/clans/%23ABC123/members?after=eyJwb3MiOjEwfQ&limit=10',
      ttlMs: 60_000,
    });
    assert.equal(resolve('/clans', 'warFrequency=always&minMembers=10').upstream, '/clans?minMembers=10&warFrequency=always');
    assert.equal(resolve('/clans', 'warFrequency=sometimes').status, 400);
    assert.equal(resolve('/clans', 'labelIds=56000000,56000001').upstream, '/clans?labelIds=56000000%2C56000001');
    assert.equal(resolve('/leagues/abc/seasons').status, 404);
    assert.equal(resolve('/leagues/29000022/seasons/2026-1').status, 404);
    assert.equal(resolve('/locations/1').status, undefined);
    // Legend League season rankings: the API requires at least 100 items per page.
    assert.equal(resolve('/leagues/29000022/seasons/2026-10', 'limit=10').status, 400);
    assert.equal(resolve('/leagues/29000022/seasons/2026-10', 'limit=100').upstream, '/leagues/29000022/seasons/2026-10?limit=100');
    // The API path is lower case: `battleLog` does not exist.
    assert.equal(resolve('/players/%23P1/battleLog').status, 404);
  });
});

describe('CocClient cache', () => {
  it('keeps at most maxEntries responses, dropping the oldest', async () => {
    const { fn } = fakeFetch({ '/a': [200, 1], '/b': [200, 2], '/c': [200, 3] });
    const client = new CocClient({ token: 't', fetchFn: fn, maxEntries: 2 });
    await client.get('/a');
    await client.get('/b');
    await client.get('/c');
    assert.deepEqual([...client.cache.keys()], ['/b', '/c']);
  });
});

describe('RateLimiter', () => {
  it('allows max requests per window, then asks to wait until the window resets', () => {
    let now = 0;
    const limiter = new RateLimiter({ max: 2, windowMs: 10_000, now: () => now });
    assert.equal(limiter.hit('1.1.1.1'), 0);
    assert.equal(limiter.hit('1.1.1.1'), 0);
    assert.equal(limiter.hit('1.1.1.1'), 10);
    assert.equal(limiter.hit('2.2.2.2'), 0);
    now = 10_000;
    assert.equal(limiter.hit('1.1.1.1'), 0);
  });
});
