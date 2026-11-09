import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST as signUp } from '@/app/api/v1/auth/sign-up/route';
import { GET as listSeasons } from '@/app/api/v1/donations/seasons/route';
import { CommendationAwardModel } from '@/modules/commendations/commendation-award.model';
import { syncCommendations, syncMembers } from '@/modules/commendations/commendation-sync.service';
import { awardDonationCommendations, tierFor } from '@/modules/commendations/commendation-rules';
import { PlayerModel } from '@/modules/commendations/player.model';
import { DonationCounterModel, DonationSeasonModel, DonationTotalModel } from '@/modules/donations/donation.model';
import { recordDonations, seasonId } from '@/modules/donations/donation.service';
import { mockCocApi } from './coc-mock';
import { call } from './helpers';

afterEach(() => vi.unstubAllGlobals());

const NOVEMBER = { startTime: '20261101T080000.000Z', endTime: '20261201T080000.000Z' };
const DECEMBER = { startTime: '20261201T080000.000Z', endTime: '20270101T080000.000Z' };
const at = (day: string) => new Date(`2026-11-${day}T12:00:00Z`);

/** Fake API: the Gold Pass season and the clan with the given donation counters. */
function api(donations: Record<string, number>, season = NOVEMBER) {
  return mockCocApi({
    '/goldpass/seasons/current': { body: season },
    '/clans/%232J8JVVCLC': {
      body: { memberList: Object.entries(donations).map(([tag, d]) => ({ tag, name: `P${tag}`, donations: d })) },
    },
  });
}

async function total(tag: string, season = '2026-11'): Promise<number | undefined> {
  return (await DonationTotalModel.findOne({ season, playerTag: tag }))?.donations;
}

describe('donor rules', () => {
  it('awards bronze, silver and gold from 5000, 7500 and 10000 troops', () => {
    expect(tierFor('donor', 4_999)).toBeNull();
    expect(tierFor('donor', 5_000)).toBe('bronze');
    expect(tierFor('donor', 7_500)).toBe('silver');
    expect(tierFor('donor', 10_000)).toBe('gold');
    expect(awardDonationCommendations([{ tag: '#A', donations: 8_000 }]).get('#A')).toEqual([{ type: 'donor', tier: 'silver' }]);
  });

  it('names a season after the month of its middle', () => {
    expect(seasonId(new Date('2026-11-01T08:00:00Z'), new Date('2026-12-01T08:00:00Z'))).toBe('2026-11');
    expect(seasonId(new Date('2026-10-27T05:00:00Z'), new Date('2026-11-24T05:00:00Z'))).toBe('2026-11');
  });
});

describe('donation tracking', () => {
  it('saves the season of the Gold Pass and counts the donations made so far', async () => {
    api({ '#A': 1200 });
    const next = await recordDonations([{ tag: '#A', name: 'A', donations: 1200 }], at('09'));
    expect(next).toEqual(new Date('2026-12-01T07:59:00Z'));
    expect(await DonationSeasonModel.findOne({ season: '2026-11' })).toBeTruthy();
    expect(await total('#A')).toBe(1200);
  });

  it('keeps the troops donated before leaving the clan', async () => {
    api({ '#A': 3000 });
    await syncMembers(at('09'));
    // Left and came back between two reads: the game counter restarted from zero.
    api({ '#A': 400 });
    await syncMembers(at('10'));
    api({ '#A': 900 });
    await syncMembers(at('11'));
    expect(await total('#A')).toBe(3900);
  });

  it('counts from zero a player seen out of the clan', async () => {
    api({ '#A': 3000, '#B': 10 });
    await syncMembers(at('09'));
    api({ '#B': 10 });
    await syncMembers(at('10'));
    expect((await DonationCounterModel.findOne({ playerTag: '#A' }))!.counter).toBe(0);
    // Back in the clan, with more troops donated than before leaving: all of them count.
    api({ '#A': 3500, '#B': 10 });
    await syncMembers(at('12'));
    expect(await total('#A')).toBe(6500);
  });

  it('never counts the same read twice', async () => {
    api({ '#A': 1000 });
    await syncMembers(at('09'));
    api({ '#A': 1500 });
    await Promise.all([syncMembers(at('10')), syncMembers(at('10'))]);
    expect(await total('#A')).toBe(1500);
  });

  it('moves to the next season when the game resets the counters', async () => {
    api({ '#A': 6000 });
    await syncMembers(at('29'));
    api({ '#A': 250 }, DECEMBER);
    await syncMembers(new Date('2026-12-02T12:00:00Z'));
    expect(await total('#A')).toBe(6000);
    expect(await total('#A', '2026-12')).toBe(250);
  });

  it('skips a read without a known season and counts it on the next one', async () => {
    mockCocApi({ '/clans/%232J8JVVCLC': { body: { memberList: [{ tag: '#A', name: 'A', donations: 500 }] } } });
    await syncMembers(at('09'));
    expect(await DonationCounterModel.countDocuments()).toBe(0);
    api({ '#A': 700 });
    await syncMembers(at('10'));
    expect(await total('#A')).toBe(700);
  });
});

describe('donor commendations', () => {
  const donor = async (tag: string) =>
    (await PlayerModel.findOne({ tag }))?.commendations.filter((c) => c.type === 'donor').map((c) => [c.tier, c.quantity]) ?? [];

  it('are awarded during the season as soon as a tier is reached, then raised (one per season)', async () => {
    api({ '#A': 4_000 });
    await syncCommendations(at('05'));
    expect(await donor('#A')).toEqual([]);

    api({ '#A': 5_000 });
    expect((await syncCommendations(at('10'))).awards).toBe(1);
    expect(await donor('#A')).toEqual([['bronze', 1]]);

    // Nothing new while the tier stays the same.
    api({ '#A': 6_000 });
    expect((await syncCommendations(at('11'))).awards).toBe(0);

    api({ '#A': 7_600 });
    await syncCommendations(at('15'));
    expect(await donor('#A')).toEqual([['silver', 1]]);

    api({ '#A': 12_000 });
    await syncCommendations(at('20'));
    expect(await donor('#A')).toEqual([['gold', 1]]);
    expect(await CommendationAwardModel.find({ periodKey: 'donations:2026-11' }).lean()).toEqual([
      expect.objectContaining({ playerTag: '#A', commendationId: '95000027', tier: 'gold' }),
    ]);
  });

  it('keep counting the donations of a player who leaves the clan and comes back', async () => {
    api({ '#A': 4_000, '#B': 10 });
    await syncCommendations(at('05'));
    // #A leaves: the in-game counter restarts from 0 when they come back.
    api({ '#B': 10 });
    await syncCommendations(at('06'));
    api({ '#A': 1_000, '#B': 10 });
    await syncCommendations(at('08'));

    expect(await total('#A')).toBe(5_000);
    expect(await donor('#A')).toEqual([['bronze', 1]]);
  });

  it('get one last pass when the season ends, then the new season starts from zero', async () => {
    api({ '#A': 7_000, '#B': 5_200, '#C': 100 });
    await syncCommendations(at('30'));
    expect(await donor('#A')).toEqual([['bronze', 1]]);

    // Last read before the end: #A reaches silver.
    api({ '#A': 7_600, '#B': 5_200, '#C': 100 });
    await syncCommendations(new Date('2026-12-01T07:59:00Z'));

    api({ '#A': 0, '#B': 0, '#C': 0 }, DECEMBER);
    const report = await syncCommendations(new Date('2026-12-01T09:00:00Z'));
    expect(report.periodsProcessed).toEqual(['donations:2026-11']);
    expect(await donor('#A')).toEqual([['silver', 1]]);
    expect(await donor('#B')).toEqual([['bronze', 1]]);
    expect(await donor('#C')).toEqual([]);
    expect(await CommendationAwardModel.countDocuments({ periodKey: 'donations:2026-11' })).toBe(2);

    // December: a new award for the new season, November stays as it was.
    api({ '#A': 5_000, '#B': 0, '#C': 0 }, DECEMBER);
    await syncCommendations(new Date('2026-12-05T09:00:00Z'));
    expect(await total('#A', '2026-12')).toBe(5_000);
    expect(await donor('#A')).toEqual([
      ['bronze', 1],
      ['silver', 1],
    ]);
    expect((await syncCommendations(new Date('2026-12-06T09:00:00Z'))).periodsProcessed).toEqual([]);
  });

  it('report when to read for the last time before the season ends', async () => {
    api({ '#A': 10 });
    expect((await syncCommendations(at('09'))).nextCheckAt).toBe('2026-12-01T07:59:00.000Z');
  });
});

describe('GET /donations/seasons', () => {
  it('lists the seasons with the totals to signed-in users', async () => {
    api({ '#A': 300, '#B': 800 });
    await syncMembers(at('09'));
    const { body } = await call(signUp, {
      body: { email: 'don@x.io', username: 'donor', password: 'secret123', repeatPassword: 'secret123' },
    });
    const list = await call(listSeasons, { token: body.result.accessToken });
    expect(list.body.result).toEqual([
      expect.objectContaining({
        season: '2026-11',
        players: [
          { tag: '#B', name: 'P#B', donations: 800 },
          { tag: '#A', name: 'P#A', donations: 300 },
        ],
      }),
    ]);
    expect((await call(listSeasons)).status).toBe(401);
  });
});
