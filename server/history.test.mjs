// Monthly history tests: node --test server/history.test.mjs
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createApp } from './app.mjs';
import { WarArchive } from './archive.mjs';
import { CocClient } from './coc-client.mjs';
import { MonthlyHistory, aggregatePlayers, monthOf, summarizeWar } from './history.mjs';

const TAG = '#2J8JVVCLC';

function attack(attackerTag, defenderTag, stars, destructionPercentage) {
  return { attackerTag, defenderTag, stars, destructionPercentage, order: 1, duration: 120 };
}

/**
 * Ended 2 vs 2 war:
 * - #A: 3★ 100% + 3★ 100%   → 6 stars
 * - #B: 2★ 80%, one unused attack → 2 stars
 */
function war({ prep = '20261101T100000.000Z', end = '20261103T090000.000Z', opp = '#OPP', state = 'warEnded', a = [3, 3], b = [2] } = {}) {
  return {
    state,
    teamSize: 2,
    attacksPerMember: 2,
    preparationStartTime: prep,
    startTime: prep,
    endTime: end,
    clan: {
      tag: TAG, name: 'Crociata Nera', clanLevel: 16, attacks: a.length + b.length, stars: 5, destructionPercentage: 90,
      members: [
        { tag: '#B', name: 'Bravo', townhallLevel: 16, mapPosition: 2, opponentAttacks: 1,
          bestOpponentAttack: attack('#Y', '#B', 2, 70), attacks: b.map((s) => attack('#B', '#Y', s, s === 3 ? 100 : 80)) },
        { tag: '#A', name: 'Alfa', townhallLevel: 17, mapPosition: 1, opponentAttacks: 0,
          attacks: a.map((s, i) => attack('#A', i ? '#Y' : '#X', s, s === 3 ? 100 : 60)) },
      ],
    },
    opponent: {
      tag: opp, name: 'Opponents', clanLevel: 12, attacks: 1, stars: 2, destructionPercentage: 35,
      members: [
        { tag: '#X', name: 'X', townhallLevel: 17, mapPosition: 1, opponentAttacks: 1 },
        { tag: '#Y', name: 'Y', townhallLevel: 16, mapPosition: 2, opponentAttacks: 2 },
      ],
    },
  };
}

describe('summarizeWar', () => {
  it('ignores wars that have not ended', () => {
    assert.equal(summarizeWar(war({ state: 'inWar' })), null);
    assert.equal(summarizeWar({ state: 'notInWar' }), null);
  });

  it('extracts result, players sorted by position and targets', () => {
    const r = summarizeWar(war());
    assert.equal(r.result, 'victory');
    assert.equal(r.endTime, '2026-11-03T09:00:00.000Z');
    assert.deepEqual(r.players.map((p) => p.tag), ['#A', '#B']);
    assert.deepEqual(r.players[0].attacks[0], { stars: 3, destruction: 100, defenderTownHall: 17, defenderPosition: 1 });
    assert.equal(r.players[1].starsConceded, 2);
  });
});

describe('monthOf', () => {
  it('uses the Italian time zone', () => {
    assert.equal(monthOf('2026-10-31T22:30:00.000Z'), '2026-10'); // 23:30 in Italy (standard time)
    assert.equal(monthOf('2026-10-31T23:30:00.000Z'), '2026-11'); // 00:30 on 1 November
  });
});

describe('aggregatePlayers', () => {
  it('sums the wars and sorts by average stars per war', () => {
    const w1 = summarizeWar(war());
    const w2 = summarizeWar(war({ prep: '20261105T100000.000Z', end: '20261107T090000.000Z', a: [3, 2], b: [3, 3] }));
    const [first, second] = aggregatePlayers([w1, w2]);

    // #A: 6 + 5 = 11 stars in 2 wars → 5.5; #B: 2 + 6 = 8 → 4.
    assert.equal(first.tag, '#A');
    assert.equal(first.stars, 11);
    assert.equal(first.averageStarsPerWar, 5.5);
    assert.equal(first.threeStars, 3);
    assert.equal(first.twoStars, 1);
    assert.equal(first.threeStarRate, 75);

    assert.equal(second.tag, '#B');
    assert.equal(second.wars, 2);
    assert.equal(second.attacksUsed, 3);
    assert.equal(second.attacksMissed, 1);
    assert.equal(second.participation, 75);
    assert.equal(second.averageStarsPerWar, 4);
    assert.equal(second.averageStarsPerAttack, 2.67);
    assert.equal(second.averageStarsConceded, 2);
  });
});

describe('MonthlyHistory', () => {
  let dir;
  before(async () => (dir = await mkdtemp(join(tmpdir(), 'cn-history-'))));
  after(() => rm(dir, { recursive: true, force: true }));

  it('records wars in the right month without counting them twice', async () => {
    const history = new MonthlyHistory(join(dir, 'a'));
    assert.equal(await history.record(war()), true);
    assert.equal(await history.record(war()), false); // same war: no change
    assert.equal(await history.record(war({ state: 'inWar' })), false);
    assert.equal(await history.record(war({ prep: '20261105T100000.000Z', end: '20261107T090000.000Z', opp: '#OPP2' })), true);
    assert.equal(await history.record(war({ prep: '20261010T100000.000Z', end: '20261012T090000.000Z', opp: '#OPP3' })), true);

    const november = await history.month('2026-11');
    assert.equal(november.period, '2026-11');
    assert.equal(november.wars.length, 2);
    assert.equal(november.players.find((p) => p.tag === '#A').wars, 2);

    const months = await history.months();
    assert.deepEqual(months.map((m) => [m.month, m.wars, m.victories]), [['2026-11', 2, 2], ['2026-10', 1, 1]]);

    const all = await history.all();
    assert.equal(all.period, 'all');
    assert.equal(all.wars.length, 3);
    assert.equal(all.players.find((p) => p.tag === '#A').stars, 18);
  });

  it('an updated recording of the same war replaces the previous one', async () => {
    const history = new MonthlyHistory(join(dir, 'b'));
    await history.record(war({ a: [1, 1] }));
    await history.record(war({ a: [3, 3] }));
    const { wars, players } = await history.month('2026-11');
    assert.equal(wars.length, 1);
    assert.equal(players.find((p) => p.tag === '#A').stars, 6);
  });

  it('concurrent recordings do not lose data', async () => {
    const history = new MonthlyHistory(join(dir, 'c'));
    await Promise.all(
      [1, 2, 3, 4].map((n) =>
        history.record(war({ prep: `2026110${n}T100000.000Z`, end: `2026111${n}T090000.000Z`, opp: `#O${n}` })),
      ),
    );
    const data = JSON.parse(await readFile(join(dir, 'c', '2026-11.json'), 'utf8'));
    assert.equal(data.wars.length, 4);
  });

  it('returns null or an empty list when there is no data', async () => {
    const history = new MonthlyHistory(join(dir, 'empty'));
    assert.equal(await history.month('2026-01'), null);
    assert.equal(await history.month('../secrets'), null);
    assert.deepEqual(await history.months(), []);
  });
});

describe('history routes', () => {
  let server;
  let base;
  let dir;

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cn-routes-'));
    const enc = encodeURIComponent(TAG);
    const fetchFn = async (url) =>
      url.endsWith(`/clans/${enc}/currentwar`)
        ? new Response(JSON.stringify(war()), { status: 200 })
        : new Response('{}', { status: 404 });
    server = createApp({
      client: new CocClient({ token: 't', fetchFn }),
      archive: new WarArchive(join(dir, 'w.json')),
      history: new MonthlyHistory(join(dir, 'history')),
      clanTag: TAG,
    }).listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://localhost:${server.address().port}/api/coc`;
  });
  after(async () => {
    server.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('an ended war read from currentwar is added to the history', async () => {
    await fetch(`${base}/clans/${encodeURIComponent(TAG)}/currentwar`);
    const months = await (await fetch(`${base}/history`)).json();
    assert.deepEqual(months.map((m) => m.month), ['2026-11']);

    const month = await (await fetch(`${base}/history/2026-11`)).json();
    assert.equal(month.players[0].tag, '#A');

    const all = await (await fetch(`${base}/history/all`)).json();
    assert.equal(all.wars.length, 1);
  });

  it('responds 404 for a month without wars or an invalid month', async () => {
    assert.equal((await fetch(`${base}/history/2020-01`)).status, 404);
    assert.equal((await fetch(`${base}/history/2020-13`)).status, 404);
  });
});
