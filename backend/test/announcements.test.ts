import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as discard } from '@/app/api/v1/admin/announcements/[id]/discard/route';
import { GET as getImage } from '@/app/api/v1/admin/announcements/[id]/images/[page]/route';
import { POST as publish } from '@/app/api/v1/admin/announcements/[id]/publish/route';
import { PATCH as updateAnnouncement } from '@/app/api/v1/admin/announcements/[id]/route';
import { GET as listAnnouncements } from '@/app/api/v1/admin/announcements/route';
import { signAccessToken } from '@/lib/auth/tokens';
import { UserRole } from '@/lib/auth/user-role';
import { resetEnvCache } from '@/lib/config/env';
import { resetTelegramBot } from '@/lib/telegram/telegram-client';
import { captionLength, captionToHtml, fitCaption, generatedCaption } from '@/modules/announcements/announcement-caption';
import { announcementLink } from '@/modules/announcements/announcement-link';
import { AnnouncementData, buildCwlData, buildMonthData, MonthData, PromotionData, RaidData, WarData } from '@/modules/announcements/announcement-data';
import { CwlSeasonModel } from '@/modules/cwl/cwl.model';
import { newRecordValue, syncAnnouncementDrafts } from '@/modules/announcements/announcement-drafts.service';
import { AnnouncementBaselineModel, AnnouncementModel, PlayerLeagueBestModel } from '@/modules/announcements/announcement.model';
import { PlayerModel } from '@/modules/commendations/player.model';
import { UserModel } from '@/modules/auth/user.model';
import { CommendationAwardModel, CommendationPeriodModel } from '@/modules/commendations/commendation-award.model';
import { DonationTotalModel } from '@/modules/donations/donation.model';
import { RaidSeasonModel } from '@/modules/raids/raid.model';
import { WarModel } from '@/modules/wars/war.model';
import { renderAnnouncementImages } from '@/modules/announcements/image/announcement-image';
import { ClanRecordsModel } from '@/modules/records/clan-records.model';
import { EMPTY_CLAN_RECORDS, INITIAL_CLAN_RECORDS, syncOtherClanRecords } from '@/modules/records/clan-records.service';
import { TelegramChatModel } from '@/modules/telegram/telegram-chat.model';
import { mockCocApi } from './coc-mock';
import { call, memberToken } from './helpers';
import { mockTelegramApi, TELEGRAM_TEST_BASE_URL } from './telegram-mock';

const MAIN = '#2J8JVVCLC';
const RED = '#2JU8RPR2G';
const GOLD = '#2RRYUGQYJ';
const ANNOUNCEMENTS_CHANNEL = -1009999;

const T0 = new Date('2026-11-01T00:00:00Z');
const LATER = new Date('2026-12-01T05:00:00Z');

async function adminToken() {
  const user = await UserModel.create({
    email: 'boss@x.io',
    username: 'boss',
    usernameKey: 'boss',
    passwordHash: 'x',
    roles: [UserRole.USER, UserRole.ADMIN],
  });
  return (await signAccessToken({ sub: user._id.toString(), roles: [UserRole.USER, UserRole.ADMIN] })).token;
}

async function closePeriod(periodKey: string, at: Date, awards: { tag: string; name: string; type: string; tier: string }[] = []) {
  await CommendationPeriodModel.create({ periodKey, awards: awards.length, processedAt: at });
  for (const a of awards) {
    await CommendationAwardModel.create({
      periodKey,
      playerTag: a.tag,
      playerName: a.name,
      commendationId: 'x',
      type: a.type,
      tier: a.tier,
      awardedAt: at,
    });
  }
}

/** Records of a clan as the records sync leaves them after a read. */
async function records(clanTag: string, values: Partial<Record<'perfectWars' | 'warWinStreak' | 'localRank' | 'localCapitalRank' | 'capitalPoints', number>> & { league?: { id: number; name: string } } = {}) {
  const seed = clanTag === MAIN ? INITIAL_CLAN_RECORDS : EMPTY_CLAN_RECORDS;
  const record = (name: keyof typeof values & keyof typeof seed) => ({ value: (values[name] as number | undefined) ?? (seed[name] as number), achievedAt: null });
  await ClanRecordsModel.updateOne(
    { clanTag },
    {
      $set: {
        clanTag,
        perfectWars: record('perfectWars'),
        perfectWarsSince: T0,
        warWinStreak: record('warWinStreak'),
        cwlLeague: { ...(values.league ?? seed.cwlLeague), achievedAt: null },
        localRank: record('localRank'),
        localCapitalRank: record('localCapitalRank'),
        capitalPoints: record('capitalPoints'),
        lastSyncedAt: T0,
      },
    },
    { upsert: true },
  );
}

beforeEach(() => {
  process.env.TELEGRAM_BOT_TOKEN = '123:test-bot-token';
  process.env.TELEGRAM_API_BASE_URL = TELEGRAM_TEST_BASE_URL;
  resetEnvCache();
  resetTelegramBot();
});

afterEach(() => {
  delete process.env.APP_URL;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_API_BASE_URL;
  resetEnvCache();
  vi.unstubAllGlobals();
});

describe('drafts of the closed periods', () => {
  it('prepares none for the periods closed before the clans were first seen', async () => {
    await closePeriod('month:2026-10', new Date('2026-10-31T00:00:00Z'));
    await syncAnnouncementDrafts(T0);
    expect(await AnnouncementModel.countDocuments()).toBe(0);
    expect(await AnnouncementBaselineModel.countDocuments()).toBe(3);
  });

  it('prepares the month of every clan once, with the commendations of its Raid Weekends', async () => {
    await syncAnnouncementDrafts(T0);
    await RaidSeasonModel.create({
      clanTag: RED,
      startTime: new Date('2026-11-06T07:00:00Z'),
      endTime: new Date('2026-11-09T07:00:00Z'),
      state: 'ended',
      season: { capitalTotalLoot: 25000, totalAttacks: 120 },
      hasMembers: true,
      lastSyncedAt: T0,
    });
    await closePeriod('month:2026-11', LATER, [{ tag: '#A', name: 'Anna', type: 'tireless', tier: 'gold' }]);
    await closePeriod(`month:2026-11@${RED}`, LATER, [{ tag: '#B', name: 'Bruno', type: 'present', tier: 'silver' }]);
    await closePeriod(`raid:2026-11-06T07:00:00.000Z@${RED}`, LATER, [
      { tag: '#B', name: 'Bruno', type: 'capitalRaider', tier: 'gold' },
    ]);

    const report = await syncAnnouncementDrafts(LATER);
    // The Raid Weekend gets its own draft too.
    expect(report.created.sort()).toEqual([`month:2026-11@${MAIN}`, `month:2026-11@${RED}`, `raid:2026-11-06T07:00:00.000Z@${RED}`]);
    expect((await syncAnnouncementDrafts(LATER)).created).toEqual([]);

    const red = await AnnouncementModel.findOne({ key: `month:2026-11@${RED}` }).lean();
    const data = red!.data as MonthData;
    expect(data).toMatchObject({ kind: 'month', clanName: 'Crociata Rossa', month: '2026-11', wars: null });
    expect(data.raids).toEqual({ weekends: 1, capitalGold: 25000, attacks: 120 });
    expect(data.honours.map((h) => `${h.type}-${h.tier}:${h.players.map((p) => p.name).join()}`)).toEqual([
      'capitalRaider-gold:Bruno',
      'present-silver:Bruno',
    ]);
  });

  it('a month waits for the Raid Weekends started in it to end and get their commendations', async () => {
    await syncAnnouncementDrafts(T0);
    const raid = await RaidSeasonModel.create({
      clanTag: MAIN,
      startTime: new Date('2026-11-27T07:00:00Z'),
      endTime: new Date('2026-12-01T07:00:00Z'),
      state: 'ongoing',
      season: { capitalTotalLoot: 900, totalAttacks: 5 },
      hasMembers: true,
      lastSyncedAt: LATER,
    });
    await closePeriod('month:2026-11', LATER);
    expect((await syncAnnouncementDrafts(LATER)).created).toEqual([]);
    await RaidSeasonModel.updateOne({ _id: raid._id }, { $set: { state: 'ended' } });
    expect((await syncAnnouncementDrafts(LATER)).created).toEqual([]);
    await closePeriod('raid:2026-11-27T07:00:00.000Z', LATER, [{ tag: '#A', name: 'Anna', type: 'capitalRaider', tier: 'gold' }]);
    // The month and the Raid Weekend's own draft, both with its commendations.
    expect((await syncAnnouncementDrafts(LATER)).created.sort()).toEqual([`month:2026-11@${MAIN}`, `raid:2026-11-27T07:00:00.000Z@${MAIN}`]);
    const draft = await AnnouncementModel.findOne({ key: `month:2026-11@${MAIN}` }).lean();
    expect((draft!.data as MonthData).honours).toHaveLength(1);
  });

  it('counts the caption as Telegram does: an emoji is 2', () => {
    expect(captionLength('🔥 **a**')).toBe(4);
  });

  it('keeps the figures of a draft up to date, and freezes them once published', async () => {
    await syncAnnouncementDrafts(T0);
    await closePeriod('month:2026-11', LATER);
    await syncAnnouncementDrafts(LATER);
    await closePeriod('raid:2026-11-27T07:00:00.000Z', LATER, [{ tag: '#A', name: 'Anna', type: 'capitalRaider', tier: 'silver' }]);
    await RaidSeasonModel.create({
      clanTag: MAIN,
      startTime: new Date('2026-11-27T07:00:00Z'),
      endTime: new Date('2026-11-30T07:00:00Z'),
      state: 'ended',
      season: { capitalTotalLoot: 1000, totalAttacks: 6 },
      hasMembers: true,
      lastSyncedAt: LATER,
    });
    const report = await syncAnnouncementDrafts(LATER);
    expect(report.updated).toEqual([`month:2026-11@${MAIN}`]);
    const draft = await AnnouncementModel.findOne({ key: `month:2026-11@${MAIN}` }).lean();
    expect((draft!.data as MonthData).honours).toHaveLength(1);
  });

  it('prepares the donations of a game season for the clans where players donated', async () => {
    await syncAnnouncementDrafts(T0);
    await DonationTotalModel.create([
      { season: '2026-11', playerTag: '#A', playerName: 'Anna', clanTag: MAIN, donations: 8000, updatedAt: LATER },
      { season: '2026-11', playerTag: '#C', playerName: 'Carlo', clanTag: null, donations: 3000, updatedAt: LATER },
      { season: '2026-11', playerTag: '#D', playerName: 'Dora', clanTag: GOLD, donations: 12000, updatedAt: LATER },
    ]);
    await closePeriod('donations:2026-11', LATER, [
      { tag: '#A', name: 'Anna', type: 'donor', tier: 'silver' },
      { tag: '#D', name: 'Dora', type: 'donor', tier: 'gold' },
    ]);
    const report = await syncAnnouncementDrafts(LATER);
    expect(report.created.sort()).toEqual([`donations:2026-11@${MAIN}`, `donations:2026-11@${GOLD}`]);
    const main = await AnnouncementModel.findOne({ key: `donations:2026-11@${MAIN}` }).lean();
    expect(main!.data).toMatchObject({
      total: 11000,
      top: [
        { name: 'Anna', donations: 8000 },
        { name: 'Carlo', donations: 3000 },
      ],
      honours: [{ type: 'donor', tier: 'silver', players: [{ name: 'Anna', times: 1 }] }],
    });
  });
});

describe('drafts of the records', () => {
  it('takes the first values read as the starting point, then follows a beaten record in one draft', async () => {
    await records(MAIN);
    await syncAnnouncementDrafts(T0);
    expect(await AnnouncementModel.countDocuments()).toBe(0);

    await records(MAIN, { warWinStreak: 51 });
    expect((await syncAnnouncementDrafts(LATER)).created).toEqual([`record:warWinStreak:51@${MAIN}`]);
    await records(MAIN, { warWinStreak: 53 });
    expect((await syncAnnouncementDrafts(LATER)).updated).toEqual([`record:warWinStreak:53@${MAIN}`]);
    const drafts = await AnnouncementModel.find({ kind: 'record' }).lean();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.data).toMatchObject({ record: 'warWinStreak', value: 53, previous: 50 });
  });

  it('announces the perfect wars at every 25, for the main clan only', async () => {
    await records(MAIN);
    await records(RED, { perfectWars: 10 });
    await syncAnnouncementDrafts(T0);
    await records(MAIN, { perfectWars: 149 });
    await records(RED, { perfectWars: 30 });
    expect((await syncAnnouncementDrafts(LATER)).created).toEqual([]);
    await records(MAIN, { perfectWars: 151 });
    expect((await syncAnnouncementDrafts(LATER)).created).toEqual([`record:perfectWars:150@${MAIN}`]);
  });

  it('a record published or discarded must be beaten again', async () => {
    const admin = await adminToken();
    await records(GOLD, { capitalPoints: 4000, league: { id: 48000010, name: 'Crystal League II' } });
    await syncAnnouncementDrafts(T0);
    await records(GOLD, { capitalPoints: 4100, league: { id: 48000012, name: 'Master League III' } });
    await syncAnnouncementDrafts(LATER);
    const league = await AnnouncementModel.findOne({ subject: 'cwlLeague' }).lean();
    expect(league!.data).toMatchObject({ leagueName: 'Master League III', previousLeagueName: 'Crystal League II' });
    const capital = await AnnouncementModel.findOne({ subject: 'capitalPoints' }).lean();

    expect((await call(discard, { token: admin, params: { id: capital!._id.toString() } })).status).toBe(200);
    await syncAnnouncementDrafts(LATER);
    expect(await AnnouncementModel.countDocuments({ subject: 'capitalPoints' })).toBe(1);
    await records(GOLD, { capitalPoints: 4200, league: { id: 48000012, name: 'Master League III' } });
    expect((await syncAnnouncementDrafts(LATER)).created).toEqual([`record:capitalPoints:4200@${GOLD}`]);
  });

  it('never announces "Unranked" as a league record', async () => {
    await records(RED);
    await syncAnnouncementDrafts(T0);
    await records(RED, { league: { id: 48000000, name: 'Unranked' } });
    expect((await syncAnnouncementDrafts(LATER)).created).toEqual([]);
  });

  it('removes a record draft that is no longer news, and never shows "Unranked" as the league before', async () => {
    await records(RED, { league: { id: 48000000, name: 'Unranked' } });
    await syncAnnouncementDrafts(T0);
    // A draft prepared under older rules.
    await AnnouncementModel.create({
      key: `record:cwlLeague:48000000@${RED}`,
      kind: 'record',
      clanTag: RED,
      subject: 'cwlLeague',
      data: { kind: 'record', clanTag: RED, clanName: 'Crociata Rossa', record: 'cwlLeague', value: 48000000, previous: null, leagueName: 'Unranked' },
    });
    expect((await syncAnnouncementDrafts(LATER)).removed).toEqual([`record:cwlLeague:48000000@${RED}`]);

    await records(RED, { league: { id: 48000001, name: 'Bronze League III' } });
    await syncAnnouncementDrafts(LATER);
    const draft = await AnnouncementModel.findOne({ subject: 'cwlLeague' }).lean();
    expect(draft!.data).toMatchObject({ leagueName: 'Bronze League III', previousLeagueName: null });
  });

  it('rankings: lower is better, 0 is "never ranked"', () => {
    expect(newRecordValue('localRank', 40, 0)).toBe(40);
    expect(newRecordValue('localRank', 40, 37)).toBeNull();
    expect(newRecordValue('localRank', 30, 37)).toBe(30);
    expect(newRecordValue('localRank', 0, 37)).toBeNull();
    expect(newRecordValue('perfectWars', 175, 150)).toBe(175);
    expect(newRecordValue('capitalPoints', 5000, 5000)).toBeNull();
  });
});

describe('drafts of the promotions', () => {
  const LEAGUES: Record<number, string> = {
    105000028: 'Dragon League 28',
    105000029: 'Dragon League 29',
    105000030: 'Dragon League 30',
    105000031: 'Electro League 31',
    105000032: 'Electro League 32',
    105000034: 'Legend League III',
    105000035: 'Legend League II',
    105000036: 'Legend League I',
  };
  async function league(tag: string, id: number, extra: Record<string, unknown> = {}) {
    await PlayerModel.updateOne(
      { tag },
      { $set: { tag, name: `Player ${tag}`, inClan: true, clanTag: MAIN, league: { id, name: LEAGUES[id] }, ...extra } },
      { upsert: true },
    );
  }
  const promotions = () => AnnouncementModel.find({ kind: 'promotion' }).lean();

  it('takes the league of a player first seen as the starting point', async () => {
    await league('#A', 105000032);
    await syncAnnouncementDrafts(T0);
    expect(await promotions()).toHaveLength(0);
    expect(await PlayerLeagueBestModel.findOne({ playerTag: '#A' }).lean()).toMatchObject({ leagueId: 105000032 });
  });

  it('announces a league never reached before, from Electro League 31 up, not demotions nor leagues held', async () => {
    await league('#A', 105000030);
    await league('#B', 105000028, { clanTag: RED });
    await syncAnnouncementDrafts(T0);

    // Below Electro League 31: the best league is raised, nothing announced.
    await league('#B', 105000029, { clanTag: RED });
    await league('#A', 105000031);
    expect((await syncAnnouncementDrafts(LATER)).created).toEqual(['promotion:#A:105000031']);
    expect((await PlayerLeagueBestModel.findOne({ playerTag: '#B' }).lean())!.leagueId).toBe(105000029);

    // Held, then demoted, then back to the same league: nothing new.
    expect((await syncAnnouncementDrafts(LATER)).created).toEqual([]);
    await league('#A', 105000030);
    expect((await syncAnnouncementDrafts(LATER)).created).toEqual([]);
    await league('#A', 105000031);
    expect((await syncAnnouncementDrafts(LATER)).created).toEqual([]);
    expect(await promotions()).toHaveLength(1);
  });

  it('an open draft follows the player promoted again, keeping the league before it', async () => {
    await league('#A', 105000034, { clanTag: GOLD });
    await syncAnnouncementDrafts(T0);
    await league('#A', 105000035, { clanTag: GOLD });
    await syncAnnouncementDrafts(LATER);
    const [draft] = await promotions();
    expect(draft).toMatchObject({ clanTag: GOLD, subject: '#A', key: 'promotion:#A:105000035' });
    expect(draft!.data as PromotionData).toMatchObject({
      clanName: "Crociata d'Oro",
      league: { id: 105000035, name: 'Legend League II' },
      previousLeague: { id: 105000034, name: 'Legend League III' },
    });
    expect(generatedCaption(draft!.data as PromotionData)).toContain('**Player #A** sale in **Lega Leggende II**!');
  });

  it('celebrates Legend League I at every arrival, even when reached before', async () => {
    const admin = await adminToken();
    await league('#A', 105000036);
    await syncAnnouncementDrafts(T0);
    // Held: nothing.
    expect((await syncAnnouncementDrafts(LATER)).created).toEqual([]);
    // Demoted, then back: a new announcement.
    await league('#A', 105000035);
    await syncAnnouncementDrafts(LATER);
    await league('#A', 105000036);
    const first = (await syncAnnouncementDrafts(LATER)).created;
    expect(first).toHaveLength(1);
    expect(first[0]).toMatch(/^promotion:#A:105000036:\d+$/);
    const [draft] = await promotions();
    expect(generatedCaption(draft!.data as PromotionData)).toContain('Tra i campioni del mondo');
    expect(generatedCaption(draft!.data as PromotionData)).not.toContain('Prima');
    await call(discard, { token: admin, params: { id: draft!._id.toString() } });

    // And again the week after.
    await league('#A', 105000035);
    await syncAnnouncementDrafts(new Date('2026-12-08T05:00:00Z'));
    await league('#A', 105000036);
    expect((await syncAnnouncementDrafts(new Date('2026-12-08T06:00:00Z'))).created).toHaveLength(1);
    expect(await promotions()).toHaveLength(2);
  });

  it('ignores the players who left the clans', async () => {
    await league('#A', 105000030, { inClan: false });
    await syncAnnouncementDrafts(T0);
    await league('#A', 105000031, { inClan: false });
    await syncAnnouncementDrafts(LATER);
    expect(await promotions()).toHaveLength(0);
  });
});

describe('records of the other clans', () => {
  it('start from nothing and are set by their first read', async () => {
    mockCocApi({
      [`/clans/${encodeURIComponent(RED)}`]: {
        body: { tag: RED, warWinStreak: 4, clanCapitalPoints: 3000, warLeague: { id: 48000008, name: 'Gold League I' } },
      },
    });
    const reports = await syncOtherClanRecords(T0);
    expect(reports.find((r) => r.clanTag === RED)).toMatchObject({ error: null });
    expect(reports.find((r) => r.clanTag === RED)!.improved.sort()).toEqual(['capitalPoints', 'cwlLeague', 'warWinStreak']);
    expect(reports.find((r) => r.clanTag === GOLD)!.error).toMatchObject({ status: 404 });
    const red = await ClanRecordsModel.findOne({ clanTag: RED }).lean();
    expect(red).toMatchObject({ perfectWars: { value: 0 }, warWinStreak: { value: 4 }, lastSyncedAt: T0 });
    expect((await ClanRecordsModel.findOne({ clanTag: GOLD }).lean())!.lastSyncedAt).toBeNull();
  });
});

describe('captions', () => {
  it('end with the hashtags of the kind and the clan, in the language', () => {
    const data = { kind: 'cwl', clanTag: '#2RRYUGQYJ', clanName: "Crociata d'Oro", season: '2026-11', rank: 1, clans: 8, wins: 7, draws: 0, losses: 0, stars: 250, bestAttackers: null, honours: [] } as unknown as AnnouncementData;
    expect(generatedCaption(data).split('\n').at(-1)).toBe('#CWL #CrociataDOro');
    const month = { ...data, kind: 'month', month: '2026-10', wars: null, raids: null, mvp: null, clanTag: MAIN, clanName: 'Crociata Nera' } as unknown as AnnouncementData;
    expect(generatedCaption(month, 'it-IT').split('\n').at(-1)).toBe('#Resoconto #CrociataNera');
    expect(generatedCaption(month, 'en-US').split('\n').at(-1)).toBe('#Recap #CrociataNera');
    expect(generatedCaption(month, 'es-ES').split('\n').at(-1)).toBe('#Resumen #CrociataNera');
  });

  it('link the name of the site to the page of the announcement', () => {
    expect(captionToHtml('Tutto su crociatanera.it', 'https://crociatanera.it/cwl?season=2026-11&x="y"')).toBe(
      'Tutto su <a href="https://crociatanera.it/cwl?season=2026-11&amp;x=&quot;y&quot;">crociatanera.it</a>',
    );
    expect(captionToHtml('Tutto su crociatanera.it', null)).toBe('Tutto su crociatanera.it');
  });

  it('lead to the page of the main clan the announcement tells about, the welcome page for the others', () => {
    process.env.APP_URL = 'https://crociatanera.it';
    resetEnvCache();
    const of = (data: object) => announcementLink({ clanTag: MAIN, clanName: 'Crociata Nera', ...data } as AnnouncementData);
    expect(of({ kind: 'month', month: '2026-10' })).toBe('https://crociatanera.it/statistics?period=2026-10');
    expect(of({ kind: 'cwl', season: '2026-11' })).toBe('https://crociatanera.it/cwl?season=2026-11');
    expect(of({ kind: 'donations', season: '2026-11' })).toBe('https://crociatanera.it/players');
    expect(of({ kind: 'record', record: 'localRank' })).toBe('https://crociatanera.it/');
    expect(of({ kind: 'promotion', playerTag: '#ABC' })).toBe('https://crociatanera.it/players/%23ABC');
    expect(of({ kind: 'legendSeason', playerTag: '#ABC' })).toBe('https://crociatanera.it/players/%23ABC');
    expect(of({ kind: 'month', month: '2026-10', clanTag: '#2JU8RPR2G' })).toBe('https://crociatanera.it/');

    // Telegram refuses buttons to other addresses than https (development).
    delete process.env.APP_URL;
    resetEnvCache();
    expect(of({ kind: 'month', month: '2026-10' })).toBeNull();
  });

  it('turns **text** into bold and escapes the rest', () => {
    expect(captionToHtml('**Anna <3** & co')).toBe('<b>Anna &lt;3</b> &amp; co');
    expect(captionLength('**ab** c')).toBe(4);
  });

  it('fits Telegram\'s limit by dropping commendation lines', () => {
    const many = { type: 'present', tier: 'gold', players: Array.from({ length: 6 }, (_, i) => ({ name: `Player number ${i}`, times: 1 })) };
    const data = {
      kind: 'month',
      clanTag: MAIN,
      clanName: 'Crociata Nera',
      month: '2026-11',
      wars: null,
      raids: null,
      mvp: null,
      honours: Array.from({ length: 20 }, () => many),
    } as unknown as MonthData;
    const caption = fitCaption(generatedCaption(data));
    expect(captionLength(caption)).toBeLessThanOrEqual(1024);
    expect(caption).toContain('Novembre 2026');
  });

  it('lists every best attacker of a CWL: most attacks first, then most stars', async () => {
    const member = (tag: string, name: string, stars: number[]) => ({ tag, name, attacks: stars.map((s) => ({ stars: s })) });
    await CwlSeasonModel.create({
      season: '2026-11',
      clanTag: MAIN,
      state: 'ended',
      clans: [{ tag: MAIN }, { tag: '#X' }],
      rounds: [],
      wars: [
        {
          warTag: '#W1',
          state: 'warEnded',
          war: {
            state: 'warEnded',
            clan: {
              tag: MAIN,
              stars: 20,
              destructionPercentage: 90,
              members: [member('#B', 'Bruno', [3, 3]), member('#A', 'Anna', [3, 3]), member('#C', 'Carlo', [3]), member('#D', 'Dora', [3, 2])],
            },
            opponent: { tag: '#X', stars: 10, destructionPercentage: 50 },
          },
        },
      ],
      lastSyncedAt: T0,
    });
    const data = await buildCwlData(MAIN, '2026-11');
    expect(data.bestAttackers).toEqual({ names: ['Anna', 'Bruno'], stars: 6, attacks: 2 });
    expect(data).toMatchObject({ rank: 1, wins: 1, stars: 30 });
    expect(generatedCaption(data)).toContain('Migliori attaccanti: **Anna**, **Bruno** (6 stelle in 2 attacchi)');
  });

  it('builds the month even without wars', async () => {
    expect(await buildMonthData(MAIN, '2026-11')).toMatchObject({ wars: null, raids: null, mvp: null, honours: [] });
  });
});

describe('drafts of the wars and Raid Weekends', () => {
  const member = (name: string, attacks: [number, number, number?][]) => ({
    tag: `#${name.toUpperCase()}`,
    name,
    townhallLevel: 17,
    mapPosition: 1,
    attacks: attacks.map(([stars, destructionPercentage, duration], order) => ({
      attackerTag: '#X',
      defenderTag: '#Y',
      stars,
      destructionPercentage,
      order,
      duration: duration ?? null,
    })),
  });

  async function war(endTime: Date, overrides: Record<string, unknown> = {}) {
    const key = `${endTime.toISOString().replace(/[-:]/g, '').slice(0, 15)}-OPP`;
    await WarModel.create({
      warKey: key,
      clanTag: MAIN,
      state: 'warEnded',
      stateRank: 2,
      teamSize: 5,
      attacksPerMember: 2,
      preparationStartTime: new Date(endTime.getTime() - 48 * 3600_000),
      startTime: new Date(endTime.getTime() - 24 * 3600_000),
      endTime,
      result: 'win',
      clan: {
        tag: MAIN,
        name: 'Crociata Nera',
        clanLevel: 20,
        attacks: 9,
        stars: 14,
        destructionPercentage: 97.66,
        members: [
          // Anna and Elio both take every star at 100%: Elio is faster. Fabio's times are unknown.
          member('Anna', [[3, 100, 150], [3, 100, 140]]),
          member('Elio', [[3, 100, 120], [3, 100, 130]]),
          member('Fabio', [[3, 100], [3, 100]]),
          member('Bruno', [[3, 100], [2, 80]]),
          member('Dario', []),
        ],
      },
      opponent: { tag: '#OPP', name: 'Les Gaulois ⚔️', clanLevel: 15, badgeUrl: 'https://example.com/badge.png', stars: 11, destructionPercentage: 85.2 },
      lastSyncedAt: endTime,
      ...overrides,
    });
    return key;
  }

  it('prepares a draft for each war ended after they were first looked for, with its result and best attackers', async () => {
    await war(new Date('2026-10-30T20:00:00Z'));
    await syncAnnouncementDrafts(T0);
    expect(await AnnouncementModel.countDocuments({ kind: 'war' })).toBe(0);

    const key = await war(new Date('2026-11-20T20:00:00Z'));
    expect((await syncAnnouncementDrafts(LATER)).created).toEqual([`war:${key}@${MAIN}`]);
    expect((await syncAnnouncementDrafts(LATER)).created).toEqual([]);
    const draft = await AnnouncementModel.findOne({ kind: 'war' }).lean();
    expect(draft!.subject).toBe(key);
    const data = draft!.data as WarData;
    expect(data).toMatchObject({
      result: 'win',
      teamSize: 5,
      clan: { stars: 14, destruction: 97.66, attacks: 9 },
      opponent: { name: 'Les Gaulois ⚔️', tag: '#OPP', stars: 11 },
    });
    expect(data.bestAttackers).toEqual([
      { name: 'Elio', stars: 6, destruction: 100, attacks: 2 },
      { name: 'Anna', stars: 6, destruction: 100, attacks: 2 },
      { name: 'Fabio', stars: 6, destruction: 100, attacks: 2 },
    ]);

    // Corrected by the war log while still a draft: the figures follow.
    await WarModel.updateOne({ warKey: key }, { $set: { 'clan.stars': 15 } });
    expect((await syncAnnouncementDrafts(LATER)).updated).toEqual([`war:${key}@${MAIN}`]);

    const caption = generatedCaption(data);
    expect(caption).toContain('🏆 **Vittoria contro Les Gaulois ⚔️!**');
    expect(caption).toContain('⭐ 14 stelle a 11 · 97,7% a 85,2%');
    expect(caption).toContain('🎯 Attacchi: 9 su 10');
    expect(caption).toContain('🥇 **Elio** 6⭐ 100%');
    expect(caption.split('\n').at(-1)).toBe('#Guerra #CrociataNera');
    expect(generatedCaption({ ...data, result: 'lose' }, 'en-US')).toContain('⚔️ **Defeat against Les Gaulois ⚔️**');

    // Badges are read from the game's servers only: the opponent's (another host) is left out.
    const png = await sharp({ create: { width: 8, height: 8, channels: 4, background: '#ffffff' } }).png().toBuffer();
    const fetch = vi.fn(async () => new Response(new Uint8Array(png)));
    vi.stubGlobal('fetch', fetch);
    const own = 'https://api-assets.clashofclans.com/badges/512/own.png';
    const [image] = await renderAnnouncementImages({ ...data, clan: { ...data.clan, badgeUrl: own } });
    expect((await sharp(image!).metadata()).format).toBe('jpeg');
    expect(fetch.mock.calls.map((call) => String((call as unknown[])[0]))).toEqual([own]);
  }, 30_000);

  it('prepares a Raid Weekend once its commendations are awarded, with totals, medals and best raiders', async () => {
    await syncAnnouncementDrafts(T0);
    const startTime = new Date('2026-11-13T07:00:00Z');
    await RaidSeasonModel.create({
      clanTag: MAIN,
      startTime,
      endTime: new Date('2026-11-16T07:00:00Z'),
      state: 'ended',
      season: {
        capitalTotalLoot: 812345,
        totalAttacks: 280,
        enemyDistrictsDestroyed: 41,
        raidsCompleted: 5,
        offensiveReward: 1460,
        defensiveReward: 380,
        members: [
          { tag: '#A', name: 'Anna', attacks: 6, capitalResourcesLooted: 30000 },
          { tag: '#B', name: 'Bruno', attacks: 5, capitalResourcesLooted: 42000 },
          { tag: '#C', name: 'Carla', attacks: 6, capitalResourcesLooted: 28000 },
          { tag: '#D', name: 'Dario', attacks: 2, capitalResourcesLooted: 9000 },
        ],
      },
      hasMembers: true,
      lastSyncedAt: LATER,
    });
    expect((await syncAnnouncementDrafts(LATER)).created).toEqual([]);
    await closePeriod('raid:2026-11-13T07:00:00.000Z', LATER, [{ tag: '#B', name: 'Bruno', type: 'capitalRaider', tier: 'gold' }]);
    expect((await syncAnnouncementDrafts(LATER)).created).toEqual([`raid:2026-11-13T07:00:00.000Z@${MAIN}`]);

    const draft = await AnnouncementModel.findOne({ kind: 'raid' }).lean();
    expect(draft!.subject).toBe('2026-11-13T07:00:00.000Z');
    const data = draft!.data as RaidData;
    expect(data).toMatchObject({ capitalGold: 812345, attacks: 280, districts: 41, raids: 5, offensiveReward: 1460, defensiveReward: 380, participants: 4 });
    expect(data.topLooters.map((p) => p.name)).toEqual(['Bruno', 'Anna', 'Carla']);
    expect(data.honours).toHaveLength(1);

    const caption = generatedCaption(data);
    expect(caption).toContain('🏰 **Crociata Nera · Raid Weekend**\nWeekend del 13 novembre 2026');
    expect(caption).toContain('💰 812.345 di oro della capitale in 280 attacchi');
    // 6 attacks × 1460 + 380, as the Raid Weekend page counts them.
    expect(caption).toContain('🏅 9.140 medaglie raid a testa');
    expect(caption).toContain('🥇 **Bruno**: 42.000');
    expect(caption.split('\n').at(-1)).toBe('#RaidWeekend #CrociataNera');
    // Summary and roll of honour.
    expect(await renderAnnouncementImages(data)).toHaveLength(2);
  }, 30_000);

  it('lead to the war and to the Raid Weekend on the site', () => {
    process.env.APP_URL = 'https://crociatanera.it';
    resetEnvCache();
    const base = { clanTag: MAIN, clanName: 'Crociata Nera' };
    expect(announcementLink({ ...base, kind: 'war', warKey: '20261119T213344-JPLL8YGG' } as AnnouncementData)).toBe(
      'https://crociatanera.it/wars/20261119T213344-JPLL8YGG',
    );
    expect(announcementLink({ ...base, kind: 'raid', startTime: '2026-11-13T07:00:00.000Z' } as AnnouncementData)).toBe(
      'https://crociatanera.it/raids?weekend=2026-11-13T07%3A00%3A00.000Z',
    );
  });
});

describe('administration', () => {
  async function draft(honours = 1) {
    await syncAnnouncementDrafts(T0);
    const awards = Array.from({ length: honours }, (_, i) => ({ tag: `#P${i}`, name: `Player ${i}`, type: i % 2 ? 'present' : 'tireless', tier: ['gold', 'silver', 'bronze'][i % 3]! }));
    await closePeriod('month:2026-11', LATER, awards);
    await syncAnnouncementDrafts(LATER);
    return (await AnnouncementModel.findOne({ key: `month:2026-11@${MAIN}` }))!._id.toString();
  }

  async function announcementsChannel(canPost = true) {
    await TelegramChatModel.create({
      chatId: ANNOUNCEMENTS_CHANNEL,
      title: 'Annunci',
      username: 'crociata_annunci',
      type: 'channel',
      botStatus: 'administrator',
      canPost,
      purpose: 'announcements',
    });
  }

  it('is for administrators only', async () => {
    expect((await call(listAnnouncements, { token: await memberToken() })).status).toBe(403);
  });

  it('lists the drafts with their caption and pictures', async () => {
    await draft();
    const res = await call(listAnnouncements, { token: await adminToken() });
    expect(res.status).toBe(200);
    expect(res.body.result).toEqual([
      expect.objectContaining({ kind: 'month', state: 'draft', subject: '2026-11', clanName: 'Crociata Nera', pages: 2, captionEdited: false }),
    ]);
    expect(res.body.result[0].caption).toContain('**Crociata Nera · Novembre 2026**');
  });

  it('changes the caption of a draft, and goes back to the generated one', async () => {
    const id = await draft();
    const admin = await adminToken();
    const edited = await call(updateAnnouncement, { method: 'PATCH', token: admin, params: { id }, body: { caption: '  **Bravi tutti!**  ' } });
    expect(edited.status).toBe(200);
    expect(edited.body.result).toMatchObject({ caption: '**Bravi tutti!**', captionEdited: true });
    const tooLong = await call(updateAnnouncement, { method: 'PATCH', token: admin, params: { id }, body: { caption: 'x'.repeat(1025) } });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.messages.map((m) => m.key)).toContain('ERROR.CAPTION_IS_TOO_LONG');
    const reset = await call(updateAnnouncement, { method: 'PATCH', token: admin, params: { id }, body: { caption: null } });
    expect(reset.body.result.captionEdited).toBe(false);
    const missing = await call(updateAnnouncement, { method: 'PATCH', token: admin, params: { id: 'nope' }, body: { caption: null } });
    expect(missing.status).toBe(404);
  });

  it('draws the pictures as JPEG', async () => {
    const id = await draft();
    const token = await adminToken();
    const request = (page: string) =>
      getImage(new Request('http://localhost:3001/api/v1/test', { headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': '10.0.0.1' } }), {
        params: Promise.resolve({ id, page }),
      });
    const response = await request('1');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    const meta = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
    expect(meta).toMatchObject({ format: 'jpeg', width: 1080, height: 1350 });
    expect((await request('3')).status).toBe(404);
  }, 30_000);

  it('refuses to publish without an announcements channel the bot can post in', async () => {
    const id = await draft();
    await announcementsChannel(false);
    const res = await call(publish, { token: await adminToken(), params: { id } });
    expect(res.status).toBe(409);
    expect(res.body.messages[0]!.key).toBe('ERROR.TELEGRAM_NO_ANNOUNCEMENTS_CHAT');
  });

  it('publishes an album with the caption in HTML, once (no button: Telegram allows none on albums)', async () => {
    process.env.APP_URL = 'https://crociatanera.it';
    resetEnvCache();
    const telegram = mockTelegramApi({ sendMediaGroup: () => ({ result: [{ message_id: 41 }, { message_id: 42 }] }) });
    const id = await draft();
    await announcementsChannel();
    const admin = await adminToken();
    await call(updateAnnouncement, { method: 'PATCH', token: admin, params: { id }, body: { caption: '**Ottobre** <ok>' } });

    const res = await call(publish, { token: admin, params: { id } });
    expect(res.status).toBe(200);
    expect(res.body.result).toMatchObject({ state: 'published', postUrl: 'https://t.me/crociata_annunci/41' });
    const [sent] = telegram.of('sendMediaGroup');
    expect(sent!.params['chat_id']).toBe(String(ANNOUNCEMENTS_CHANNEL));
    const media = JSON.parse(sent!.params['media'] as string) as { media: string; caption?: string; parse_mode?: string }[];
    expect(media).toEqual([
      { type: 'photo', media: 'attach://page0', caption: '<b>Ottobre</b> &lt;ok&gt;', parse_mode: 'HTML' },
      { type: 'photo', media: 'attach://page1' },
    ]);
    expect(sent!.params['page1']).toBeInstanceOf(Blob);
    expect(sent!.params['reply_markup']).toBeUndefined();
    expect((await AnnouncementModel.findById(id).lean())!.messageIds).toEqual([41, 42]);

    const again = await call(publish, { token: admin, params: { id } });
    expect(again.status).toBe(409);
    expect(again.body.messages[0]!.key).toBe('ERROR.ANNOUNCEMENT_NOT_DRAFT');
  }, 30_000);

  it('publishes a single picture with sendPhoto and the button to the site, and settles the record', async () => {
    process.env.APP_URL = 'https://crociatanera.it';
    resetEnvCache();
    const telegram = mockTelegramApi();
    await records(MAIN);
    await syncAnnouncementDrafts(T0);
    await records(MAIN, { localRank: 20 });
    await syncAnnouncementDrafts(LATER);
    await announcementsChannel();
    const id = (await AnnouncementModel.findOne({ subject: 'localRank' }))!._id.toString();
    const res = await call(publish, { token: await adminToken(), params: { id } });
    expect(res.status).toBe(200);
    expect(telegram.of('sendPhoto')).toHaveLength(1);
    expect(String(telegram.of('sendPhoto')[0]!.params['caption'])).toContain('<b>20° posto</b>');
    expect(String(telegram.of('sendPhoto')[0]!.params['caption'])).toContain('<a href="https://crociatanera.it/">crociatanera.it</a>');
    expect(JSON.parse(String(telegram.of('sendPhoto')[0]!.params['reply_markup']))).toEqual({
      inline_keyboard: [[{ text: '🌐 Apri sul sito', url: 'https://crociatanera.it/' }]],
    });
    const baseline = await AnnouncementBaselineModel.findOne({ clanTag: MAIN }).lean();
    expect((baseline!.records as Record<string, number>)['localRank']).toBe(20);
  });

  it('keeps the draft with the error when Telegram refuses', async () => {
    mockTelegramApi({ sendMediaGroup: () => ({ error: 400, description: 'Bad Request: too many photos' }) });
    const id = await draft();
    await announcementsChannel();
    const res = await call(publish, { token: await adminToken(), params: { id } });
    expect(res.status).toBe(502);
    const saved = await AnnouncementModel.findById(id).lean();
    expect(saved).toMatchObject({ state: 'draft', error: 'Bad Request: too many photos' });
  }, 30_000);

  it('a publication interrupted goes back to draft, flagged to be checked', async () => {
    const id = await draft();
    await AnnouncementModel.collection.updateOne(
      { _id: new (await import('mongoose')).Types.ObjectId(id) },
      { $set: { state: 'publishing', updatedAt: new Date('2026-12-01T05:00:00Z') } },
    );
    await syncAnnouncementDrafts(new Date('2026-12-01T05:11:00Z'));
    const res = await call(listAnnouncements, { token: await adminToken() });
    expect(res.body.result[0]).toMatchObject({ state: 'draft', interrupted: true });
  });

  it('writes the captions in the language asked, and publishes in it; a published one keeps its language', async () => {
    const telegram = mockTelegramApi({ sendMediaGroup: () => ({ result: [{ message_id: 7 }, { message_id: 8 }] }) });
    const id = await draft();
    await announcementsChannel();
    const admin = await adminToken();
    const path = (lang: string) => `/api/v1/admin/announcements?lang=${lang}`;

    const english = await call(listAnnouncements, { token: admin, path: path('en-US') });
    expect(english.body.result[0]).toMatchObject({ language: 'en-US' });
    expect(english.body.result[0].caption).toContain('**Crociata Nera · November 2026**');
    expect(english.body.result[0].caption).toContain('Commendations');
    const wrong = await call(listAnnouncements, { token: admin, path: path('fr-FR') });
    expect(wrong.status).toBe(400);

    const published = await call(publish, { token: admin, params: { id }, path: `/api/v1/admin/announcements/${id}/publish?lang=es-ES` });
    expect(published.status).toBe(200);
    const media = JSON.parse(telegram.of('sendMediaGroup')[0]!.params['media'] as string) as { caption?: string }[];
    expect(media[0]!.caption).toContain('Noviembre de 2026');
    expect(media[0]!.caption).toContain('Encomios');

    const later = await call(listAnnouncements, { token: admin, path: path('it-IT') });
    expect(later.body.result[0]).toMatchObject({ state: 'published', language: 'es-ES' });
    expect(later.body.result[0].caption).toContain('Noviembre de 2026');
  }, 30_000);

  it('names the leagues in the language asked', () => {
    const data = {
      kind: 'promotion',
      clanTag: MAIN,
      clanName: 'Crociata Nera',
      playerTag: '#P',
      playerName: 'Mik',
      league: { id: 105000035, name: 'Legend League II' },
      previousLeague: null,
    } as PromotionData;
    expect(generatedCaption(data, 'it-IT')).toContain('**Mik** sale in **Lega Leggende II**!');
    expect(generatedCaption(data, 'en-US')).toContain('**Mik** reaches **Legend League II**!');
    expect(generatedCaption(data, 'es-ES')).toContain('¡**Mik** sube a **Liga Leyenda II**!');
  });

  it('discards a draft, which then cannot be published', async () => {
    const id = await draft();
    const admin = await adminToken();
    const res = await call(discard, { token: admin, params: { id } });
    expect(res.status).toBe(200);
    expect(res.body.result.state).toBe('discarded');
    expect((await call(discard, { token: admin, params: { id } })).status).toBe(409);
  });
});
