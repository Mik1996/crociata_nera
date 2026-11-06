// Proxy tests: node --test server/
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createApp } from './app.mjs';
import { WarArchive, warId } from './archive.mjs';
import { CocClient } from './coc-client.mjs';
import { MonthlyHistory } from './history.mjs';

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
    [`/clans/${enc}`]: [200, { tag: TAG, name: 'Crociata Nera' }],
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

  it('rejects other clans and other paths (not an open proxy)', async () => {
    const callsBefore = calls.length;
    const r = await fetch(`${base}/api/coc/clans/%23OTHER`);
    assert.equal(r.status, 404);
    assert.equal(calls.length, callsBefore);
  });

  it('uses the cache for repeated requests', async () => {
    const callsBefore = calls.length;
    await fetch(`${base}/api/coc/clans/${enc}`);
    assert.equal(calls.length, callsBefore);
  });

  it('exposes a health check', async () => {
    const r = await fetch(`${base}/api/health`);
    assert.deepEqual(await r.json(), { status: 'ok', clanTag: TAG });
  });
});
