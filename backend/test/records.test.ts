import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET as getRecords } from '@/app/api/v1/clan/records/route';
import { ClanRecordsModel } from '@/modules/records/clan-records.model';
import { INITIAL_CLAN_RECORDS, syncClanRecords } from '@/modules/records/clan-records.service';
import { WarModel } from '@/modules/wars/war.model';
import { syncWars } from '@/modules/wars/war-sync.service';
import { mockCocApi } from './coc-mock';
import { call, cocWar } from './helpers';

afterEach(() => vi.unstubAllGlobals());

const ITALY = 32000120;
/** Before the fixture war ends (2026-11-06 10:00 UTC). */
const BEFORE_END = new Date('2026-11-05T20:00:00Z');
const AFTER_END = new Date('2026-11-06T10:05:00Z');

interface ApiState {
  warWinStreak?: number;
  clanCapitalPoints?: number;
  warLeague?: { id: number; name: string };
  localRank?: number;
  capitalRank?: number;
  war?: unknown;
}

/** Fake API: the clan (in Italy) and its positions in the Italian rankings. */
function api(state: ApiState = {}) {
  const ranking = (rank: number | undefined) => ({
    body: { items: [{ tag: '#OTHER', rank: 1 }, ...(rank ? [{ tag: '#2J8JVVCLC', rank }] : [])] },
  });
  return mockCocApi({
    '/clans/%232J8JVVCLC': {
      body: {
        tag: '#2J8JVVCLC',
        warWinStreak: state.warWinStreak ?? 3,
        clanCapitalPoints: state.clanCapitalPoints ?? 5000,
        warLeague: state.warLeague ?? { id: 48000013, name: 'Master League III' },
        location: { id: ITALY, name: 'Italy', isCountry: true, countryCode: 'IT' },
      },
    },
    [`/locations/${ITALY}/rankings/clans`]: ranking(state.localRank),
    [`/locations/${ITALY}/rankings/capitals`]: ranking(state.capitalRank),
    ...(state.war ? { '/currentwar': { body: state.war } } : {}),
  });
}

/** A war of the fixture ended with the given stars of the clan (team size 2: 6 is perfect). */
function endedWar(stars: number) {
  return cocWar({ state: 'warEnded', clan: { ...cocWar().clan, stars, destructionPercentage: stars === 6 ? 100 : 80 } });
}

const records = () => ClanRecordsModel.findOne({ clanTag: '#2J8JVVCLC' }).lean();

describe('clan records sync', () => {
  it('starts from the known records and keeps them while the API shows lower values', async () => {
    api();
    const report = await syncClanRecords(BEFORE_END);

    expect(report).toEqual({ perfectWars: [], improved: [], error: null });
    const saved = await records();
    expect(saved).toMatchObject({
      perfectWars: { value: 137, achievedAt: null },
      warWinStreak: { value: 50 },
      cwlLeague: { id: 48000015, name: 'Master League I' },
      localRank: { value: 37 },
      localCapitalRank: { value: 12 },
      capitalPoints: { value: 5380 },
    });
  });

  it('keeps every better value read from the API, with the time it was reached', async () => {
    api({
      warWinStreak: 51,
      clanCapitalPoints: 5400,
      warLeague: { id: 48000016, name: 'Champion League III' },
      localRank: 20,
      capitalRank: 5,
    });
    const report = await syncClanRecords(BEFORE_END);

    expect(report.improved.sort()).toEqual(['capitalPoints', 'cwlLeague', 'localCapitalRank', 'localRank', 'warWinStreak']);
    expect(await records()).toMatchObject({
      warWinStreak: { value: 51, achievedAt: BEFORE_END },
      capitalPoints: { value: 5400 },
      cwlLeague: { id: 48000016, name: 'Champion League III' },
      localRank: { value: 20 },
      localCapitalRank: { value: 5 },
    });

    // Worse values later never lower a record.
    api({ warWinStreak: 0, clanCapitalPoints: 4000, localRank: 80 });
    expect((await syncClanRecords(AFTER_END)).improved).toEqual([]);
    expect(await records()).toMatchObject({ warWinStreak: { value: 51 }, localRank: { value: 20 } });
  });

  it('ignores a clan out of the top 200 of its country', async () => {
    api({ localRank: undefined, capitalRank: undefined });
    await syncClanRecords(BEFORE_END);
    expect(await records()).toMatchObject({ localRank: { value: 37 }, localCapitalRank: { value: 12 } });
  });

  it('counts a war won with every star once, when it has ended', async () => {
    api({ war: cocWar() });
    await syncWars(BEFORE_END);
    await syncClanRecords(BEFORE_END);

    api({ war: endedWar(6) });
    await syncWars(AFTER_END);
    const report = await syncClanRecords(AFTER_END);
    expect(report.perfectWars).toEqual(['20261104T100000-OPP999']);
    expect(await records()).toMatchObject({ perfectWars: { value: 138, achievedAt: AFTER_END } });

    // Read again: already counted.
    await syncWars(AFTER_END);
    expect((await syncClanRecords(AFTER_END)).perfectWars).toEqual([]);
    expect((await records())!.perfectWars.value).toBe(138);
  });

  it('does not count a war without every star', async () => {
    api({ war: cocWar() });
    await syncClanRecords(BEFORE_END);
    api({ war: endedWar(5) });
    await syncWars(AFTER_END);
    await syncClanRecords(AFTER_END);
    expect((await records())!.perfectWars.value).toBe(137);
  });

  it('does not count again the wars ended before the records were tracked', async () => {
    api({ war: endedWar(6) });
    await syncWars(AFTER_END);
    // First run of the records after the war: it is already in the starting count.
    await syncClanRecords(new Date('2026-11-07T00:00:00Z'));
    expect((await records())!.perfectWars.value).toBe(137);
    expect((await WarModel.findOne())!.perfectCounted).toBe(false);
  });

  it('reports API errors without throwing, after counting the perfect wars', async () => {
    mockCocApi({ '/clans/%232J8JVVCLC': { status: 403, body: { reason: 'accessDenied.invalidIp', message: 'Invalid IP' } } });
    const report = await syncClanRecords(BEFORE_END);
    expect(report.error).toMatchObject({ status: 403, reason: 'accessDenied.invalidIp' });
  });
});

describe('GET /api/v1/clan/records', () => {
  it('is public and returns the starting records before the first sync', async () => {
    const res = await call(getRecords);
    expect(res.status).toBe(200);
    expect(res.body.result).toEqual({
      perfectWars: { value: INITIAL_CLAN_RECORDS.perfectWars, achievedAt: null },
      warWinStreak: { value: 50, achievedAt: null },
      cwlLeague: { id: 48000015, name: 'Master League I', achievedAt: null },
      localRank: { value: 37, achievedAt: null },
      localCapitalRank: { value: 12, achievedAt: null },
      capitalPoints: { value: 5380, achievedAt: null },
    });
  });

  it('returns the saved records', async () => {
    api({ warWinStreak: 60 });
    await syncClanRecords(BEFORE_END);
    const res = await call(getRecords);
    expect(res.body.result.warWinStreak).toEqual({ value: 60, achievedAt: BEFORE_END.toISOString() });
  });
});
