import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET as getPeriod } from '@/app/api/v1/history/[period]/route';
import { GET as listMonths } from '@/app/api/v1/history/route';
import { GET as archive } from '@/app/api/v1/wars/archive/route';
import { monthBounds } from '@/modules/wars/history.service';
import { syncWars } from '@/modules/wars/war-sync.service';
import { mockCocApi } from './coc-mock';
import { call, cocWar, memberToken } from './helpers';

afterEach(() => vi.unstubAllGlobals());

async function token(): Promise<string> {
  return memberToken('historian');
}

/** Saves an ended war through the real sync (preparation start, opponent, clan stars). */
async function endedWar(prep: string, end: string, opponentTag: string, stars: number) {
  const war = cocWar({
    state: 'warEnded',
    preparationStartTime: prep,
    startTime: prep,
    endTime: end,
    clan: { ...cocWar().clan, stars },
    opponent: { ...cocWar().opponent, tag: opponentTag },
  });
  mockCocApi({ '/currentwar': { body: war }, '/warlog': { status: 403, body: { reason: 'accessDenied' } } });
  await syncWars(new Date('2026-12-31T00:00:00Z'));
}

describe('history from MongoDB', () => {
  it('lists months (Italian time zone) and computes the ranking of a period', async () => {
    const auth = await token();
    await endedWar('20261020T100000.000Z', '20261022T100000.000Z', '#OCT111', 5);
    // Ends 31 Oct 23:30 UTC = 1 Nov 00:30 in Rome: it belongs to November.
    await endedWar('20261029T233000.000Z', '20261031T233000.000Z', '#NOV222', 0);

    const months = await call(listMonths, { token: auth });
    expect(months.status).toBe(200);
    expect(months.body.result.map((m: { month: string }) => m.month)).toEqual(['2026-11', '2026-10']);
    expect(months.body.result[1]).toMatchObject({ wars: 1, victories: 1, defeats: 0 });
    expect(months.body.result[0]).toMatchObject({ wars: 1, victories: 0, defeats: 1 });

    const october = await call(getPeriod, { token: auth, params: { period: '2026-10' } });
    expect(october.body.result.wars).toHaveLength(1);
    expect(october.body.result.wars[0]).toMatchObject({ id: '20261020T100000-OCT111', result: 'victory', stars: 5 });
    const alice = october.body.result.players.find((p: { tag: string }) => p.tag === '#AAA111');
    expect(alice).toMatchObject({ wars: 1, attacksUsed: 1, attacksAvailable: 2, stars: 3, threeStars: 1, participation: 50 });

    const all = await call(getPeriod, { token: auth, params: { period: 'all' } });
    expect(all.body.result.wars).toHaveLength(2);
    expect(all.body.result.players.find((p: { tag: string }) => p.tag === '#AAA111').wars).toBe(2);

    expect((await call(getPeriod, { token: auth, params: { period: '2025-01' } })).status).toBe(404);
    expect((await call(getPeriod, { token: auth, params: { period: 'nope' } })).status).toBe(400);
  });

  it('bounds months at midnight in Rome, in summer and in winter time', async () => {
    expect(monthBounds('2026-08')).toEqual({
      from: new Date('2026-07-31T22:00:00Z'),
      to: new Date('2026-08-31T22:00:00Z'),
    });
    expect(monthBounds('2026-10')).toEqual({
      from: new Date('2026-09-30T22:00:00Z'),
      to: new Date('2026-10-31T23:00:00Z'),
    });
    expect(monthBounds('2026-12')).toEqual({
      from: new Date('2026-11-30T23:00:00Z'),
      to: new Date('2026-12-31T23:00:00Z'),
    });

    const auth = await token();
    // Last instant of July in Rome (CEST) and first instant of August.
    await endedWar('20260729T215959.000Z', '20260731T215959.000Z', '#JUL111', 5);
    await endedWar('20260729T220000.000Z', '20260731T220000.000Z', '#AUG111', 5);
    // Last instant of November in Rome (CET) and first instant of December.
    await endedWar('20261128T225959.000Z', '20261130T225959.000Z', '#NOV111', 0);
    await endedWar('20261128T230000.000Z', '20261130T230000.000Z', '#DEC111', 0);

    const months = await call(listMonths, { token: auth });
    expect(months.body.result.map((m: { month: string; wars: number }) => [m.month, m.wars])).toEqual([
      ['2026-12', 1],
      ['2026-11', 1],
      ['2026-08', 1],
      ['2026-07', 1],
    ]);
    const updatedAt = new Set(months.body.result.map((m: { updatedAt: string }) => m.updatedAt));
    expect(updatedAt.size).toBe(1);

    const opponents = async (period: string) =>
      (await call(getPeriod, { token: auth, params: { period } })).body.result.wars.map(
        (w: { opponentTag: string }) => w.opponentTag,
      );
    expect(await opponents('2026-07')).toEqual(['#JUL111']);
    expect(await opponents('2026-08')).toEqual(['#AUG111']);
    expect(await opponents('2026-11')).toEqual(['#NOV111']);
    expect(await opponents('2026-12')).toEqual(['#DEC111']);
    expect(await opponents('all')).toEqual(['#DEC111', '#NOV111', '#AUG111', '#JUL111']);

    const december = await call(getPeriod, { token: auth, params: { period: '2026-12' } });
    expect(december.body.result.updatedAt).toBe([...updatedAt][0]);
  });

  it('serves the archive in the Clash of Clans format', async () => {
    const auth = await token();
    await endedWar('20261020T100000.000Z', '20261022T100000.000Z', '#OCT111', 5);

    const res = await call(archive, { token: auth, path: '/api/v1/wars/archive?limit=5' });
    expect(res.status).toBe(200);
    const [war] = res.body.result;
    expect(war).toMatchObject({
      state: 'warEnded',
      preparationStartTime: '20261020T100000.000Z',
      endTime: '20261022T100000.000Z',
      clan: { tag: '#2J8JVVCLC', stars: 5, badgeUrls: { large: expect.stringContaining('https://') } },
      opponent: { tag: '#OCT111' },
    });
    expect(war.clan.members[0].attacks[0]).toEqual({
      attackerTag: '#AAA111',
      defenderTag: '#BBB222',
      stars: 3,
      destructionPercentage: 100,
      order: 1,
      duration: 120,
    });
  });
});
