import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET as listSeasons } from '@/app/api/v1/raids/seasons/route';
import { RaidSeasonModel } from '@/modules/raids/raid.model';
import { syncRaids } from '@/modules/raids/raid-sync.service';
import { mockCocApi } from './coc-mock';
import { call, memberToken } from './helpers';

afterEach(() => vi.unstubAllGlobals());

const members = [{ tag: '#A', name: 'A', attacks: 6, attackLimit: 5, bonusAttackLimit: 1, capitalResourcesLooted: 31000 }];
const weekend = (state: string, withMembers: boolean, loot = 100_000) => ({
  state,
  startTime: '20261030T070000.000Z',
  endTime: '20261102T070000.000Z',
  capitalTotalLoot: loot,
  raidsCompleted: 6,
  totalAttacks: 40,
  enemyDistrictsDestroyed: 40,
  offensiveReward: state === 'ended' ? 1500 : 0,
  defensiveReward: state === 'ended' ? 400 : 0,
  attackLog: [],
  defenseLog: [],
  ...(withMembers ? { members } : {}),
});

describe('Raid Weekend sync', () => {
  it('keeps the members read during the weekend once the API stops listing them', async () => {
    mockCocApi({ '/capitalraidseasons': { body: { items: [weekend('ongoing', true, 90_000)] } } });
    const during = await syncRaids(new Date('2026-11-01T12:00:00Z'));
    // Last read one minute before the end of the weekend.
    expect(during).toMatchObject({ saved: 1, ongoing: '2026-10-30T07:00:00.000Z', nextCheckAt: '2026-11-02T06:59:00.000Z' });

    mockCocApi({ '/capitalraidseasons': { body: { items: [weekend('ended', false, 100_000)] } } });
    expect((await syncRaids(new Date('2026-11-03T12:00:00Z'))).nextCheckAt).toBeNull();

    const saved = await RaidSeasonModel.findOne();
    expect(saved).toMatchObject({ state: 'ended', hasMembers: true });
    const season = saved!.season as Record<string, unknown>;
    expect(season['capitalTotalLoot']).toBe(100_000);
    expect(season['members']).toEqual(members);
  });

  it('records a past weekend never seen in progress, without members', async () => {
    mockCocApi({ '/capitalraidseasons': { body: { items: [weekend('ended', false)] } } });
    await syncRaids(new Date('2026-11-03T12:00:00Z'));
    expect(await RaidSeasonModel.findOne()).toMatchObject({ hasMembers: false });
  });

  it('exposes the saved weekends to signed-in users, in the API format', async () => {
    mockCocApi({ '/capitalraidseasons': { body: { items: [weekend('ongoing', true)] } } });
    await syncRaids(new Date('2026-11-01T12:00:00Z'));
    const list = await call(listSeasons, { token: await memberToken('raider') });
    expect(list.body.result).toEqual([expect.objectContaining({ startTime: '20261030T070000.000Z', members })]);
    expect((await call(listSeasons)).status).toBe(401);
  });
});
