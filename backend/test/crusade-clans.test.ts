import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET as listCwlSeasons } from '@/app/api/v1/cwl/seasons/route';
import { GET as listDonationSeasons } from '@/app/api/v1/donations/seasons/route';
import { GET as listRaids } from '@/app/api/v1/raids/seasons/route';
import { CommendationAwardModel } from '@/modules/commendations/commendation-award.model';
import { syncCommendations, syncMembers } from '@/modules/commendations/commendation-sync.service';
import { PlayerModel } from '@/modules/commendations/player.model';
import { syncCwl } from '@/modules/cwl/cwl-sync.service';
import { CwlSeasonModel } from '@/modules/cwl/cwl.model';
import { DonationSeasonModel, DonationTotalModel } from '@/modules/donations/donation.model';
import { RaidSeasonModel } from '@/modules/raids/raid.model';
import { syncWars } from '@/modules/wars/war-sync.service';
import { WarModel } from '@/modules/wars/war.model';
import { mockCocApi } from './coc-mock';
import { call, cocWar, memberToken } from './helpers';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const NERA = '#2J8JVVCLC';
const ROSSA = '#2JU8RPR2G';
const ORO = '#2RRYUGQYJ';
const path = (tag: string) => `/clans/${encodeURIComponent(tag)}`;
const roster = (...members: { tag: string; name: string; donations?: number }[]) => ({ body: { memberList: members } });

describe('members of the clans of the Crusade', () => {
  it('are saved with their clan; moving between the clans is not joining', async () => {
    const day1 = new Date('2026-11-01T00:00:00Z');
    let rossa = [{ tag: '#RED1', name: 'Red' }];
    let nera = [{ tag: '#BLACK1', name: 'Black' }];
    mockCocApi({
      [path(NERA)]: () => roster(...nera),
      [path(ROSSA)]: () => roster(...rossa),
      [path(ORO)]: roster({ tag: '#GOLD1', name: 'Gold' }),
      '/goldpass/seasons/current': { status: 404, body: {} },
    });
    const first = await syncMembers(day1);
    expect(first.created.map((p) => p.tag).sort()).toEqual(['#BLACK1', '#GOLD1', '#RED1']);
    expect(await PlayerModel.findOne({ tag: '#RED1' }).lean()).toMatchObject({ clanTag: ROSSA, inClan: true, joinedAt: day1 });

    // Red moves from Rossa to Nera: same join date, new clan.
    rossa = [];
    nera = [...nera, { tag: '#RED1', name: 'Red' }];
    await syncMembers(new Date('2026-11-05T00:00:00Z'));
    expect(await PlayerModel.findOne({ tag: '#RED1' }).lean()).toMatchObject({ clanTag: NERA, inClan: true, joinedAt: day1 });
  });

  it('skip a secondary clan that cannot be read, without marking its players as gone', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await PlayerModel.create({ tag: '#RED1', name: 'Red', clanTag: ROSSA, inClan: true });
    mockCocApi({
      [path(NERA)]: roster({ tag: '#BLACK1', name: 'Black' }),
      [path(ROSSA)]: { status: 503, body: { reason: 'inMaintenance' } },
      [path(ORO)]: roster(),
      '/goldpass/seasons/current': { status: 404, body: {} },
    });
    await syncMembers(new Date('2026-11-01T00:00:00Z'));
    expect((await PlayerModel.findOne({ tag: '#RED1' }).lean())!.inClan).toBe(true);
  });

  it('fail when the main clan cannot be read', async () => {
    mockCocApi({ [path(NERA)]: { status: 503, body: { reason: 'inMaintenance' } } });
    await expect(syncMembers(new Date())).rejects.toThrow();
  });
});

describe('wars, CWL and Raid Weekends of the other clans', () => {
  it('are saved per clan, and the pages keep showing the main clan only', async () => {
    const token = await memberToken('viewer');
    // A regular war of Crociata Rossa.
    mockCocApi({
      '/currentwar': { body: cocWar({ clan: { ...cocWar().clan, tag: ROSSA, name: 'Crociata Rossa' } }) },
      '/warlog': { status: 403, body: { reason: 'accessDenied' } },
    });
    await syncWars(new Date('2026-11-05T12:00:00Z'), ROSSA);
    expect(await WarModel.countDocuments({ clanTag: ROSSA })).toBe(1);

    // The same CWL season for Nera and Rossa.
    const group = (tag: string) => ({
      body: { state: 'inWar', season: '2026-11', clans: [{ tag }], rounds: [{ warTags: [`#W${tag.slice(1, 4)}`] }] },
    });
    mockCocApi({
      [`${path(NERA)}/currentwar/leaguegroup`]: group(NERA),
      [`${path(ROSSA)}/currentwar/leaguegroup`]: group(ROSSA),
      '/wars/%23W2J8': { body: { state: 'inWar' } },
      '/wars/%23W2JU': { body: { state: 'inWar' } },
    });
    await syncCwl(new Date(), NERA);
    await syncCwl(new Date(), ROSSA);
    expect((await CwlSeasonModel.find({ season: '2026-11' }).lean()).map((s) => s.clanTag).sort()).toEqual([NERA, ROSSA]);
    const seasons = await call(listCwlSeasons, { token });
    expect(seasons.body.result).toHaveLength(1);

    const raid = { state: 'ended', startTime: '20261030T070000.000Z', endTime: '20261102T070000.000Z' };
    await RaidSeasonModel.create([
      { clanTag: NERA, startTime: new Date('2026-10-30T07:00:00Z'), endTime: new Date('2026-11-02T07:00:00Z'), state: 'ended', lastSyncedAt: new Date(), season: { ...raid, clan: 'nera' } },
      { clanTag: ROSSA, startTime: new Date('2026-10-30T07:00:00Z'), endTime: new Date('2026-11-02T07:00:00Z'), state: 'ended', lastSyncedAt: new Date(), season: { ...raid, clan: 'rossa' } },
    ]);
    const raids = (await call(listRaids, { token })).body.result;
    expect(raids.map((r: { clan: string }) => r.clan)).toEqual(['nera']);
  });
});

describe('commendations of the other clans', () => {
  const ended = (clanTag: string, members: { tag: string; name: string; attacks: number }[]) => ({
    season: '2026-10',
    clanTag,
    state: 'ended',
    lastSyncedAt: new Date(),
    wars: [1, 2, 3].map((day) => ({
      warTag: `#${clanTag.slice(1, 4)}${day}`,
      state: 'warEnded',
      war: {
        state: 'warEnded',
        clan: {
          tag: clanTag,
          members: members.map((m) => ({
            tag: m.tag,
            name: m.name,
            attacks: day <= m.attacks ? [{ stars: 3, destructionPercentage: 100 }] : [],
          })),
        },
        opponent: { tag: '#ENEMY', members: [] },
      },
    })),
  });

  it('are awarded to the players of every clan, with the clan in the period key', async () => {
    await CwlSeasonModel.create([
      ended(NERA, [{ tag: '#BLACK1', name: 'Black', attacks: 3 }]),
      ended(ROSSA, [{ tag: '#RED1', name: 'Red', attacks: 3 }]),
      ended(ORO, [{ tag: '#GOLD1', name: 'Gold', attacks: 2 }]),
    ]);
    mockCocApi({ [path(NERA)]: roster() });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const report = await syncCommendations(new Date('2026-11-14T12:00:00Z'));
    expect(report.periodsProcessed).toEqual(expect.arrayContaining(['cwl:2026-10', `cwl:2026-10@${ROSSA}`, `cwl:2026-10@${ORO}`]));
    const awards = await CommendationAwardModel.find().lean();
    const of = (tag: string) => awards.filter((a) => a.playerTag === tag).map((a) => `${a.periodKey} ${a.type}-${a.tier}`).sort();
    expect(of('#BLACK1')).toEqual(['cwl:2026-10 cwlAllAttacks-legendary', 'cwl:2026-10 cwlStriker-gold']);
    expect(of('#RED1')).toEqual([`cwl:2026-10@${ROSSA} cwlAllAttacks-legendary`, `cwl:2026-10@${ROSSA} cwlStriker-gold`]);
    // Gold attacked 2 of 3 days: no Certezza di Lega, and fewer than 3 attacks for the striker.
    expect(of('#GOLD1')).toEqual([]);
    expect((await PlayerModel.findOne({ tag: '#RED1' }).lean())!.commendations.map((c) => c.name).sort()).toEqual([
      'cwlAllAttacks-legendary',
      'cwlStriker-gold',
    ]);
  });

  it('skip the first month of a clan tracked late (its wars of that month are incomplete)', async () => {
    const war = (prep: string, opponent: string) =>
      cocWar({
        state: 'warEnded',
        preparationStartTime: prep,
        startTime: prep,
        endTime: prep,
        clan: { ...cocWar().clan, tag: ROSSA, name: 'Crociata Rossa' },
        opponent: { ...cocWar().opponent, tag: opponent },
      });
    for (const [prep, opponent] of [
      ['20260920T100000.000Z', '#SEP111'],
      ['20261010T100000.000Z', '#OCT111'],
    ] as const) {
      mockCocApi({ '/currentwar': { body: war(prep, opponent) }, '/warlog': { status: 403, body: { reason: 'accessDenied' } } });
      await syncWars(new Date('2026-12-31T00:00:00Z'), ROSSA);
    }
    mockCocApi({ [path(NERA)]: roster() });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const report = await syncCommendations(new Date('2026-11-14T12:00:00Z'));
    expect(report.periodsProcessed).toContain(`month:2026-10@${ROSSA}`);
    expect(report.periodsProcessed).not.toContain(`month:2026-09@${ROSSA}`);
  });
});

describe('donations in the clans of the Crusade', () => {
  it('count across the clans for the commendations, the page lists the main clan', async () => {
    const token = await memberToken('donor-viewer');
    await DonationSeasonModel.create({ season: '2026-11', startTime: new Date('2026-10-27T08:00:00Z'), endTime: new Date('2026-11-24T08:00:00Z') });
    let nera = [{ tag: '#BLACK1', name: 'Black', donations: 100 }];
    let rossa = [{ tag: '#RED1', name: 'Red', donations: 300 }];
    mockCocApi({
      [path(NERA)]: () => roster(...nera),
      [path(ROSSA)]: () => roster(...rossa),
      [path(ORO)]: roster(),
    });
    await syncMembers(new Date('2026-11-10T00:00:00Z'));
    // Red moves to Nera: the counter restarts from 0 there.
    rossa = [];
    nera = [...nera, { tag: '#RED1', name: 'Red', donations: 50 }];
    await syncMembers(new Date('2026-11-11T00:00:00Z'));
    expect((await DonationTotalModel.findOne({ playerTag: '#RED1' }).lean())).toMatchObject({ donations: 350, clanTag: NERA });

    await DonationTotalModel.create({ season: '2026-11', playerTag: '#GOLD1', playerName: 'Gold', clanTag: ORO, donations: 999, updatedAt: new Date() });
    const listed = (await call(listDonationSeasons, { token })).body.result[0].players.map((p: { tag: string }) => p.tag);
    expect(listed).toEqual(['#RED1', '#BLACK1']);
  });
});
