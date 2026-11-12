import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET as getPeriod } from '@/app/api/v1/history/[period]/route';
import { GET as listMonths } from '@/app/api/v1/history/route';
import { GET as archive } from '@/app/api/v1/wars/archive/route';
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
