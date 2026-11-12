import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET as getSeason } from '@/app/api/v1/cwl/seasons/[season]/route';
import { GET as listSeasons } from '@/app/api/v1/cwl/seasons/route';
import { CwlSeasonModel } from '@/modules/cwl/cwl.model';
import { syncCwl } from '@/modules/cwl/cwl-sync.service';
import { mockCocApi } from './coc-mock';
import { call, memberToken } from './helpers';

afterEach(() => vi.unstubAllGlobals());

const NOW = new Date('2026-11-04T12:00:00Z');

const group = (rounds: string[][], state = 'inWar') => ({
  state,
  season: '2026-11',
  clans: [
    { tag: '#2J8JVVCLC', name: 'Crociata Nera', clanLevel: 18, members: [{ tag: '#A', name: 'A', townHallLevel: 17 }] },
    { tag: '#OPP1', name: 'Rivals', clanLevel: 15, members: [] },
  ],
  rounds: rounds.map((warTags) => ({ warTags })),
});

const leagueWar = (state: string) => ({
  state,
  teamSize: 15,
  clan: { tag: '#2J8JVVCLC', name: 'Crociata Nera', stars: 30, destructionPercentage: 80, members: [] },
  opponent: { tag: '#OPP1', name: 'Rivals', stars: 20, destructionPercentage: 60, members: [] },
});

async function token(): Promise<string> {
  return memberToken('leaguer');
}

describe('Clan War League sync', () => {
  it('does nothing outside the CWL days (404 from the API)', async () => {
    mockCocApi({});
    expect(await syncCwl(NOW)).toMatchObject({ state: 'notInWar', season: null, error: null });
    expect(await CwlSeasonModel.countDocuments()).toBe(0);
  });

  it('saves the group and its wars, reading ended wars only once', async () => {
    mockCocApi({
      '/currentwar/leaguegroup': { body: group([['#W1', '#W2'], ['#0']]) },
      '/wars/%23W1': { body: leagueWar('warEnded') },
      '/wars/%23W2': { body: leagueWar('inWar') },
    });

    expect(await syncCwl(NOW)).toMatchObject({ season: '2026-11', state: 'inWar', warsFetched: 2, error: null });
    // Second run: the ended war is not read again, the war in progress is.
    expect((await syncCwl(NOW)).warsFetched).toBe(1);

    const saved = await CwlSeasonModel.findOne({ season: '2026-11' });
    expect(saved!.wars.map((w) => [w.warTag, w.state])).toEqual([
      ['#W1', 'warEnded'],
      ['#W2', 'inWar'],
    ]);
    expect(saved!.clans).toHaveLength(2);
  });

  it('marks the season ended once every scheduled war has ended', async () => {
    mockCocApi({
      '/currentwar/leaguegroup': { body: group([['#W1'], ['#W2']]) },
      '/wars/%23W1': { body: leagueWar('warEnded') },
      '/wars/%23W2': { body: leagueWar('warEnded') },
    });
    expect((await syncCwl(NOW)).state).toBe('ended');
  });

  it('closes a saved season when the group disappears before the last wars were seen ended', async () => {
    mockCocApi({
      '/currentwar/leaguegroup': { body: group([['#W1'], ['#W2']]) },
      '/wars/%23W1': { body: leagueWar('warEnded') },
      '/wars/%23W2': { body: leagueWar('inWar') },
    });
    expect((await syncCwl(NOW)).state).toBe('inWar');

    // Last round ended and the clan started a regular war: the group is gone (404).
    mockCocApi({ '/wars/%23W2': { body: leagueWar('warEnded') } });
    expect(await syncCwl(NOW)).toMatchObject({ state: 'notInWar', warsFetched: 1, closed: ['2026-11'], error: null });

    const saved = await CwlSeasonModel.findOne({ season: '2026-11' });
    expect(saved!.state).toBe('ended');
    expect(saved!.wars.map((w) => w.state)).toEqual(['warEnded', 'warEnded']);

    // Nothing left to read afterwards.
    expect(await syncCwl(NOW)).toMatchObject({ warsFetched: 0, closed: [] });
  });

  it('keeps a saved season open while its wars are still in progress', async () => {
    mockCocApi({
      '/currentwar/leaguegroup': { body: group([['#W1']]) },
      '/wars/%23W1': { body: leagueWar('inWar') },
    });
    await syncCwl(NOW);
    mockCocApi({ '/wars/%23W1': { body: leagueWar('inWar') } });
    expect((await syncCwl(NOW)).closed).toEqual([]);
    expect((await CwlSeasonModel.findOne({ season: '2026-11' }))!.state).toBe('inWar');
  });

  it('exposes the saved seasons to signed-in users', async () => {
    mockCocApi({
      '/currentwar/leaguegroup': { body: group([['#W1']]) },
      '/wars/%23W1': { body: leagueWar('warEnded') },
    });
    await syncCwl(NOW);
    const auth = await token();

    const list = await call(listSeasons, { token: auth });
    expect(list.body.result).toEqual([expect.objectContaining({ season: '2026-11', state: 'ended' })]);

    const detail = await call(getSeason, { token: auth, params: { season: '2026-11' } });
    expect(detail.body.result.wars).toEqual([expect.objectContaining({ warTag: '#W1', state: 'warEnded' })]);
    expect(detail.body.result.clans[0].name).toBe('Crociata Nera');

    const missing = await call(getSeason, { token: auth, params: { season: '2020-01' } });
    expect(missing.status).toBe(404);
    expect((await call(listSeasons)).status).toBe(401);
  });
});
