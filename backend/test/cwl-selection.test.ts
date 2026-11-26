import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET as me } from '@/app/api/v1/auth/me/route';
import { POST as closeRoute } from '@/app/api/v1/cwl/selection/[season]/close/route';
import { POST as reopenRoute } from '@/app/api/v1/cwl/selection/[season]/reopen/route';
import { DELETE as readmit, PUT as exclude } from '@/app/api/v1/cwl/selection/exclusions/[tag]/route';
import { GET as selectionPlayers } from '@/app/api/v1/cwl/selection/players/route';
import { GET as getSelection } from '@/app/api/v1/cwl/selection/route';
import { AnnouncementModel } from '@/modules/announcements/announcement.model';
import { updateAnnouncementSettings } from '@/modules/announcements/announcement-settings.service';
import { CwlExclusionModel } from '@/modules/cwl/cwl-exclusion.model';
import { CwlSelectionModel } from '@/modules/cwl/cwl-selection.model';
import {
  closeSelection,
  ensureOpenSelection,
  excludePlayer,
  getCwlSelection,
  nextSeason,
  seasonOf,
  syncCwlSelections,
} from '@/modules/cwl/cwl-selection.service';
import { signAccessToken } from '@/lib/auth/tokens';
import { UserRole } from '@/lib/auth/user-role';
import { crusadeChiefTags, crusadeLeaderTags, resetClanAccessCache } from '@/modules/access/clan-access.service';
import { ClanRosterModel } from '@/modules/access/clan-roster.model';
import { UserModel } from '@/modules/auth/user.model';
import { CommendationAwardModel } from '@/modules/commendations/commendation-award.model';
import { syncMembers } from '@/modules/commendations/commendation-sync.service';
import { COMMENDATION_IDS } from '@/modules/commendations/commendation-rules';
import { PlayerModel } from '@/modules/commendations/player.model';
import { PROFILE_RETRY_MS, PROFILE_TTL_MS, PROFILES_PER_RUN, syncPlayerProfiles } from '@/modules/commendations/player-profile-sync.service';
import {
  cwlCommendationScore,
  cwlPerformanceScore,
  heroRatios,
  heroScore,
  leagueScore,
  LastCwl,
  missedAttacksPenalty,
  MISSED_ATTACKS_MAX_PENALTY,
  POINTS,
  rankCandidates,
  SelectionCandidate,
  SelectionContext,
  warPointsFor,
  warScore,
} from '@/modules/cwl/cwl-selection.rules';
import { CwlSeasonModel } from '@/modules/cwl/cwl.model';
import { syncWars } from '@/modules/wars/war-sync.service';
import { mockCocApi } from './coc-mock';
import { call, cocWar, seedCrusadeRosters } from './helpers';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const DAY = 86_400_000;
const NOW = new Date('2026-11-14T12:00:00Z');
const NERA = '#2J8JVVCLC';
const ROSSA = '#2JU8RPR2G';
const NO_WAR = { wars: 0, attacksUsed: 0, attacksAvailable: 0, stars: 0, totalDestruction: 0 };
const FLAWLESS_WAR = { wars: 4, attacksUsed: 8, attacksAvailable: 8, stars: 24, totalDestruction: 800 };
const CONTEXT: SelectionContext = { now: NOW, heroMaxLevels: new Map() };

function lastCwl(overrides: Partial<LastCwl> = {}): LastCwl {
  return { clanTag: NERA, wars: 7, attacks: 7, stars: 21, totalDestruction: 700, allAttacks: true, striker: 'gold', ...overrides };
}

function candidate(tag: string, townHallLevel: number | null, overrides: Partial<SelectionCandidate> = {}): SelectionCandidate {
  return {
    tag,
    name: tag,
    clanTag: NERA,
    role: 'member',
    league: null,
    townHallLevel,
    war: NO_WAR,
    cwl: null,
    heroes: null,
    equipment: null,
    joinedAt: null,
    exclusion: null,
    ...overrides,
  };
}

/** A user created straight in the database and its access token. */
async function register(username: string, playerTags: string[] = [], roles: UserRole[] = [UserRole.USER]) {
  const user = await UserModel.create({
    email: `${username}@x.io`,
    username,
    usernameKey: username,
    passwordHash: 'x',
    roles,
    playerTags,
  });
  return (await signAccessToken({ sub: user._id.toString(), roles })).token;
}

const admin = () => register('boss', [], [UserRole.USER, UserRole.ADMIN]);

const MAXED_HEROES = { heroes: [{ name: 'Barbarian King', level: 100, maxLevel: 100 }], equipment: [{ name: 'Rage Vial', level: 18, maxLevel: 18 }] };

describe('CWL line-up scores', () => {
  it('splits the 25 points of the last CWL between its commendations and its attacks', () => {
    expect(POINTS.cwlCommendations + POINTS.cwlPerformance).toBe(25);
    expect(POINTS.cwlCommendations + POINTS.cwlPerformance + POINTS.war + POINTS.heroes + POINTS.townHall + POINTS.league).toBe(100);
    expect(cwlCommendationScore(lastCwl())).toBeCloseTo(POINTS.cwlCommendations);
    expect(cwlCommendationScore(null)).toBe(0);
    const tier = (striker: LastCwl['striker']) => cwlCommendationScore(lastCwl({ allAttacks: false, striker }));
    expect(tier('gold')).toBeGreaterThan(tier('silver'));
    expect(tier('silver')).toBeGreaterThan(tier('bronze'));
    expect(tier(null)).toBe(0);
    expect(cwlCommendationScore(lastCwl({ striker: null }))).toBeCloseTo(5);

    expect(cwlPerformanceScore(lastCwl())).toBeCloseTo(POINTS.cwlPerformance);
    expect(cwlPerformanceScore(lastCwl({ stars: 7, totalDestruction: 350 }))).toBeLessThan(POINTS.cwlPerformance / 2);
    // Too few attacks to judge: scaled down.
    expect(cwlPerformanceScore(lastCwl({ attacks: 1, stars: 3, totalDestruction: 100 }))).toBeCloseTo(POINTS.cwlPerformance / 3);
    expect(cwlPerformanceScore(null)).toBe(0);
  });

  it('penalises the league attacks missed in the last CWL', () => {
    expect(missedAttacksPenalty(lastCwl())).toBeCloseTo(0);
    expect(missedAttacksPenalty(lastCwl({ attacks: 5 }))).toBe(-6);
    expect(missedAttacksPenalty(lastCwl({ attacks: 0 }))).toBe(-MISSED_ATTACKS_MAX_PENALTY);
    expect(missedAttacksPenalty(null)).toBeCloseTo(0);
  });

  it('gives the CWL points to the regular wars of who was not in the last CWL', () => {
    expect(warPointsFor(lastCwl())).toBe(40);
    expect(warPointsFor(null)).toBe(65);
    expect(warScore(NO_WAR)).toBe(0);
    expect(warScore(FLAWLESS_WAR)).toBeCloseTo(40);
    expect(warScore(FLAWLESS_WAR, 65)).toBeCloseTo(65);
    expect(warScore({ ...FLAWLESS_WAR, attacksAvailable: 16 })).toBeLessThan(warScore(FLAWLESS_WAR));
    expect(warScore({ ...FLAWLESS_WAR, stars: 16 })).toBeLessThan(warScore(FLAWLESS_WAR));
    expect(warScore({ wars: 1, attacksUsed: 2, attacksAvailable: 2, stars: 6, totalDestruction: 200 })).toBeCloseTo(10);
  });

  it('lets a perfect player reach 100, with or without the last CWL', () => {
    const maxLevels = new Map([['Barbarian King', 100]]);
    const league = { id: 105_000_036, name: 'Legend I', iconUrl: null };
    const { rows } = rankCandidates(
      [
        candidate('#CWL', 17, { cwl: lastCwl(), war: FLAWLESS_WAR, league, ...MAXED_HEROES }),
        candidate('#NOCWL', 17, { war: FLAWLESS_WAR, league, ...MAXED_HEROES }),
      ],
      { ...CONTEXT, heroMaxLevels: maxLevels },
    );
    expect(rows.map((r) => r.score)).toEqual([100, 100]);
    expect(rows.find((r) => r.tag === '#NOCWL')).toMatchObject({ cwl: null, war: { maxPoints: 65 }, breakdown: { war: 65, cwlCommendations: 0 } });
  });

  it('gives 1 point per league tier from Electro League 31, up to 5 for Legend II and I', () => {
    const league = (id: number) => leagueScore({ id, name: `${id}`, iconUrl: null });
    expect(leagueScore(null)).toBe(0);
    expect(league(105_000_000)).toBe(0); // Unranked
    expect(league(105_000_030)).toBe(0); // Dragon League 30
    expect(league(105_000_031)).toBe(1); // Electro League 31
    expect(league(105_000_032)).toBe(2);
    expect(league(105_000_033)).toBe(3);
    expect(league(105_000_034)).toBe(4); // Legend III
    expect(league(105_000_035)).toBe(POINTS.league); // Legend II
    expect(league(105_000_036)).toBe(POINTS.league); // Legend I
  });

  it('compares heroes and equipment with the highest levels of the game', () => {
    const maxLevels = new Map([
      ['Barbarian King', 100],
      ['Archer Queen', 100],
    ]);
    expect(heroRatios(null, null, maxLevels)).toBeNull();
    expect(heroScore(null)).toBe(0);
    const maxed = heroRatios(
      [
        { name: 'Barbarian King', level: 100, maxLevel: 100 },
        { name: 'Archer Queen', level: 100, maxLevel: 100 },
      ],
      [{ name: 'Giant Gauntlet', level: 27, maxLevel: 27 }],
      maxLevels,
    );
    expect(maxed).toEqual({ levels: 1, equipment: 1 });
    expect(heroScore(maxed)).toBeCloseTo(POINTS.heroes);
    // A hero not unlocked counts 0; half-levelled equipment counts half.
    expect(
      heroRatios([{ name: 'Barbarian King', level: 50, maxLevel: 100 }], [{ name: 'Rage Vial', level: 9, maxLevel: 18 }], maxLevels),
    ).toEqual({ levels: 0.25, equipment: 0.5 });
  });

  it('gives a bonus to the highest town hall and penalises new arrivals', () => {
    const { rows } = rankCandidates(
      [
        candidate('#TOP', 17),
        candidate('#LOW', 16),
        candidate('#NEW', 17, { joinedAt: new Date(NOW.getTime() - 3 * DAY) }),
        candidate('#OLD', 17, { joinedAt: new Date(NOW.getTime() - 100 * DAY) }),
        // Elders and above who come back are not new.
        candidate('#CO', 17, { role: 'coLeader', joinedAt: new Date(NOW.getTime() - 3 * DAY) }),
        candidate('#ELD', 17, { role: 'admin', joinedAt: new Date(NOW.getTime() - 3 * DAY) }),
      ],
      CONTEXT,
    );
    const byTag = new Map(rows.map((r) => [r.tag, r]));
    expect(byTag.get('#TOP')!.breakdown.townHall).toBe(POINTS.townHall);
    expect(byTag.get('#LOW')!.breakdown.townHall).toBe(0);
    expect(byTag.get('#NEW')!.activity).toMatchObject({ newcomer: true });
    expect(byTag.get('#NEW')!.breakdown.activity).toBe(-5);
    expect(byTag.get('#OLD')!.breakdown.activity).toBe(0);
    for (const tag of ['#CO', '#ELD']) {
      expect(byTag.get(tag)!.activity).toMatchObject({ newcomer: false });
      expect(byTag.get(tag)!.breakdown.activity).toBe(0);
    }
  });

  it('breaks an exact tie with the league, then the role', () => {
    const league = (id: number) => ({ id, name: `League ${id}`, iconUrl: null });
    const { rows } = rankCandidates(
      [
        candidate('#AAA', 17, { name: 'Aaron', role: 'leader', league: league(105000010) }),
        candidate('#BBB', 17, { name: 'Bea', role: 'member', league: league(105000020) }),
        candidate('#CCC', 17, { name: 'Cleo', role: 'coLeader', league: null }),
        candidate('#DDD', 17, { name: 'Dan', role: 'member', league: league(105000010) }),
        // A higher score still comes first, whatever the league.
        candidate('#FFF', 17, { name: 'Finn', role: 'member', league: null, war: FLAWLESS_WAR }),
      ],
      CONTEXT,
    );
    // Leagues first (higher id first, unknown last), then the role among equal leagues.
    expect(rows.map((r) => r.tag)).toEqual(['#FFF', '#BBB', '#AAA', '#DDD', '#CCC']);
    expect(rows[1]!.league).toEqual(league(105000020));
  });

  it('breaks an exact tie with the role: leader, co-leader, elder, member', () => {
    const { rows } = rankCandidates(
      [
        candidate('#AAA', 17, { name: 'Aaron', role: 'member' }),
        candidate('#BBB', 17, { name: 'Bea', role: 'admin' }),
        candidate('#CCC', 17, { name: 'Cleo', role: 'leader' }),
        candidate('#DDD', 17, { name: 'Dan', role: 'coLeader' }),
        candidate('#EEE', 17, { name: 'Eve', role: null }),
        // A higher score still comes first, whatever the role.
        candidate('#FFF', 17, { name: 'Finn', role: 'member', war: FLAWLESS_WAR }),
      ],
      CONTEXT,
    );
    expect(rows.map((r) => r.tag)).toEqual(['#FFF', '#CCC', '#DDD', '#BBB', '#AAA', '#EEE']);
  });

  it('picks 15 starters and 3 reserves among the highest town halls, skipping the excluded players', () => {
    const exclusion = { reason: 'Away', untilRevoked: false, excludedBy: 'boss', excludedAt: NOW.toISOString() };
    const candidates = [
      candidate('#OLD', 15, { cwl: lastCwl(), war: FLAWLESS_WAR }),
      candidate('#BEST', 17, { cwl: lastCwl(), war: FLAWLESS_WAR, exclusion }),
      ...Array.from({ length: 20 }, (_, i) =>
        candidate(`#P${String(i).padStart(2, '0')}`, i % 2 ? 17 : 16, {
          war: { wars: 2, attacksUsed: 4, attacksAvailable: 4, stars: Math.min(12, i), totalDestruction: 300 },
        }),
      ),
      candidate('#NOTH', null),
    ];
    const { maxTownHall, rows } = rankCandidates(candidates, CONTEXT);
    expect(maxTownHall).toBe(17);
    expect(rows.map((r) => r.rank)).toEqual(rows.map((_, i) => i + 1));
    // The excluded player keeps its place (first) but takes no slot.
    expect(rows[0]).toMatchObject({ tag: '#BEST', status: 'excluded', eligible: false, exclusion });
    expect(rows.filter((r) => r.status === 'starter')).toHaveLength(15);
    expect(rows.filter((r) => r.status === 'reserve')).toHaveLength(3);
    expect(rows.filter((r) => r.status === 'bench')).toHaveLength(2);
    expect(rows.slice(-2).map((r) => [r.tag, r.status])).toEqual([
      ['#OLD', 'ineligible'],
      ['#NOTH', 'ineligible'],
    ]);
    const scores = rows.slice(0, -2).map((r) => r.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
});

describe('GET /cwl/selection', () => {
  it('is read by every member of the clans of the Crusade, with what each may do besides reading', async () => {
    await seedCrusadeRosters(['#MEMBER'], ['#LEADER'], ['#CHIEF']);
    const outsider = await register('outsider', ['#ELSEWHERE']);
    const member = await register('member', ['#MEMBER']);
    const leader = await register('leader', ['#LEADER']);
    const chief = await register('chief', ['#CHIEF']);

    expect((await call(getSelection)).status).toBe(401);
    const denied = await call(getSelection, { token: outsider });
    expect(denied.status).toBe(403);
    expect(denied.body.messages).toEqual([{ key: 'ERROR.CLAN_ACCESS_REQUIRED' }]);
    const permissions = async (token: string) => {
      const reply = await call(getSelection, { token });
      expect(reply.status).toBe(200);
      return reply.body.result.permissions;
    };
    // Members read only; leaders and co-leaders also export; the leader of Crociata Nera decides.
    expect(await permissions(member)).toEqual({ manage: false, export: false });
    expect(await permissions(leader)).toEqual({ manage: false, export: true });
    expect(await permissions(chief)).toEqual({ manage: true, export: true });
    expect(await permissions(await admin())).toEqual({ manage: true, export: true });

    expect((await call(me, { token: member })).body.result.leaderAccess).toBe(false);
    expect((await call(me, { token: leader })).body.result.leaderAccess).toBe(true);
  });

  it('reads the leaders and co-leaders from the member lists of the clans', async () => {
    resetClanAccessCache();
    mockCocApi({
      '/clans/%232J8JVVCLC': {
        body: {
          memberList: [
            { tag: '#l1', role: 'leader' },
            { tag: '#C2', role: 'coLeader' },
            { tag: '#E3', role: 'admin' },
            { tag: '#M4', role: 'member' },
          ],
        },
      },
      '/clans/%232JU8RPR2G': {
        body: {
          memberList: [
            { tag: '#R0', role: 'leader' },
            { tag: '#R1', role: 'coLeader' },
          ],
        },
      },
      '/clans/%232RRYUGQYJ': { body: { memberList: [] } },
    });
    expect(await crusadeLeaderTags()).toEqual(new Set(['#L1', '#C2', '#R0', '#R1']));
    // Only the leader of Crociata Nera decides the line-up (not its co-leaders, nor the other clans' leaders).
    expect(await crusadeChiefTags()).toEqual(new Set(['#L1']));
    expect(await ClanRosterModel.findOne({ clanTag: NERA }).lean()).toMatchObject({ chiefTags: ['#L1'] });
  });

  it('reads the member list again when the saved one does not know the leader yet', async () => {
    resetClanAccessCache();
    // Saved before the leader was kept: fresh, but without `chiefTags`.
    await ClanRosterModel.collection.insertOne({ clanTag: NERA, memberTags: ['#L1'], leaderTags: ['#L1'], syncedAt: new Date() });
    const coc = mockCocApi({
      '/clans/%232J8JVVCLC': { body: { memberList: [{ tag: '#L1', role: 'leader' }] } },
      '/clans/%232JU8RPR2G': { body: { memberList: [] } },
      '/clans/%232RRYUGQYJ': { body: { memberList: [] } },
    });
    expect(await crusadeChiefTags()).toEqual(new Set(['#L1']));
    expect(coc).toHaveBeenCalledTimes(3);
  });


  it('ranks the members of every clan of the Crusade on the last CWL of any clan, recent wars, heroes and town hall', async () => {
    await seedCrusadeRosters([], ['#LEADER']);
    const token = await register('leader', ['#LEADER']);
    const now = new Date();
    await PlayerModel.create([
      {
        tag: '#AAA111',
        name: 'Alice',
        role: 'member',
        clanTag: NERA,
        townHallLevel: 16,
        inClan: true,
        heroes: [{ name: 'Barbarian King', level: 50, maxLevel: 100 }],
        equipment: [{ name: 'Rage Vial', level: 18, maxLevel: 18 }],
      },
      { tag: '#AAA222', name: 'Bob', role: 'coLeader', clanTag: NERA, townHallLevel: 15, inClan: true },
      {
        tag: '#CCC333',
        name: 'Carol',
        role: 'member',
        clanTag: NERA,
        townHallLevel: 17,
        inClan: true,
        heroes: [{ name: 'Barbarian King', level: 100, maxLevel: 100 }],
        equipment: [],
      },
      {
        tag: '#RED444',
        name: 'Red',
        role: 'member',
        clanTag: ROSSA,
        townHallLevel: 17,
        inClan: true,
        league: { id: 105000034, name: 'Legend III', iconUrl: 'https://x.io/legend.png' },
      },
      { tag: '#OLD555', name: 'Gone', role: 'member', clanTag: NERA, townHallLevel: 17, inClan: false },
    ]);
    const leagueWar = (clanTag: string, members: { tag: string; attacks?: { stars: number; destructionPercentage: number }[] }[]) => ({
      warTag: `#W${Math.random()}`,
      state: 'warEnded',
      war: { state: 'warEnded', clan: { tag: clanTag, members }, opponent: { tag: '#ENEMY', members: [] } },
    });
    // Last CWL: Carol fought it with Crociata Rossa, Alice with Nera (one attack missed).
    await CwlSeasonModel.create([
      {
        season: '2026-10',
        clanTag: ROSSA,
        state: 'ended',
        lastSyncedAt: now,
        wars: [
          leagueWar(ROSSA, [{ tag: '#CCC333', attacks: [{ stars: 3, destructionPercentage: 100 }] }]),
          leagueWar(ROSSA, [{ tag: '#CCC333', attacks: [{ stars: 2, destructionPercentage: 80 }] }]),
        ],
      },
      {
        season: '2026-10',
        clanTag: NERA,
        state: 'ended',
        lastSyncedAt: now,
        wars: [leagueWar(NERA, [{ tag: '#AAA111' }])],
      },
      // An older season does not count.
      { season: '2026-09', clanTag: NERA, state: 'ended', lastSyncedAt: now, wars: [leagueWar(NERA, [{ tag: '#AAA222', attacks: [{ stars: 3, destructionPercentage: 100 }] }])] },
      // A season still in progress does not count.
      { season: '2026-11', clanTag: NERA, state: 'inWar', lastSyncedAt: now },
    ]);
    for (const [periodKey, tag, type, tier] of [
      [`cwl:2026-10@${ROSSA}`, '#CCC333', 'cwlStriker', 'gold'],
      ['cwl:2026-09', '#AAA222', 'cwlStriker', 'gold'],
    ] as const) {
      await CommendationAwardModel.create({
        periodKey,
        playerTag: tag,
        playerName: tag,
        commendationId: COMMENDATION_IDS[type][tier],
        type,
        tier,
        awardedAt: now,
      });
    }
    // A regular war of Crociata Rossa ended yesterday: Alice used 1 of her 2 attacks (3 stars, 100%).
    const coc = (date: Date) => date.toISOString().replace(/[-:]/g, '');
    mockCocApi({
      '/currentwar': {
        body: cocWar({
          state: 'warEnded',
          preparationStartTime: coc(new Date(now.getTime() - 3 * DAY)),
          startTime: coc(new Date(now.getTime() - 2 * DAY)),
          endTime: coc(new Date(now.getTime() - DAY)),
          clan: { ...cocWar().clan, tag: ROSSA, name: 'Crociata Rossa' },
        }),
      },
      '/warlog': { status: 403, body: { reason: 'accessDenied' } },
    });
    await syncWars(now, ROSSA);

    const res = await call(getSelection, { token });
    expect(res.status).toBe(200);
    const result = res.body.result;
    expect(result).toMatchObject({
      starters: 15,
      reserves: 3,
      maxTownHall: 17,
      minEligibleTownHall: 16,
      cwlSeason: '2026-10',
      warWindow: { days: 90, wars: 1 },
    });
    // Every clan of the Crusade: Red is in Crociata Rossa; Gone has left.
    expect(result.players.map((p: { tag: string }) => p.tag)).toEqual(['#CCC333', '#AAA111', '#RED444', '#AAA222']);
    const [carol, alice, red, bob] = result.players;
    expect(red).toMatchObject({
      clanTag: ROSSA,
      status: 'starter',
      league: { id: 105000034, name: 'Legend III', iconUrl: 'https://x.io/legend.png' },
      breakdown: { townHall: 10, league: 4 },
    });
    expect(carol).toMatchObject({ clanTag: NERA, league: null });
    expect(carol).toMatchObject({
      rank: 1,
      status: 'starter',
      heroes: { levels: 100, equipment: 0 },
      cwl: { clanTag: ROSSA, allAttacks: false, striker: 'gold', wars: 2, attacks: 2, missed: 0, averageStarsPerAttack: 2.5, averageDestruction: 90 },
      war: { maxPoints: 40 },
      breakdown: { townHall: 10, missedAttacks: 0, cwlCommendations: 7 },
    });
    expect(carol.breakdown.cwlPerformance).toBeGreaterThan(0);
    expect(alice).toMatchObject({
      status: 'starter',
      heroes: { levels: 50, equipment: 100 },
      cwl: { clanTag: NERA, wars: 1, attacks: 0, missed: 1, striker: null },
      breakdown: { townHall: 0, missedAttacks: -3, cwlCommendations: 0, cwlPerformance: 0 },
      war: { wars: 1, attacksUsed: 1, attacksAvailable: 2, averageStarsPerAttack: 3, averageDestruction: 100, maxPoints: 40 },
      exclusion: null,
    });
    expect(alice.breakdown.war).toBeGreaterThan(0);
    // Bob: town hall 15, too low; his gold is from an older season; not in the last CWL; profile never read.
    expect(bob).toMatchObject({ eligible: false, status: 'ineligible', heroes: null, cwl: null, war: { maxPoints: 65 } });
  });
});

describe('exclusions from the CWL line-up', () => {
  it('are for administrators and the leader of Crociata Nera, and show in the ranking', async () => {
    await seedCrusadeRosters([], ['#LEADER'], ['#CHIEF']);
    const leader = await register('leader', ['#LEADER']);
    const token = await register('chief', ['#CHIEF']);
    await PlayerModel.create([
      { tag: '#AAA111', name: 'Alice', clanTag: NERA, townHallLevel: 17, inClan: true },
      { tag: '#BBB222', name: 'Bob', townHallLevel: 17, inClan: true },
      { tag: '#RED333', name: 'Red', clanTag: ROSSA, townHallLevel: 17, inClan: true },
    ]);

    const body = { reason: '  Away all month  ' };
    const denied = await call(exclude, { token: leader, params: { tag: 'AAA111' }, body });
    expect(denied.status).toBe(403);
    expect(denied.body.messages).toEqual([{ key: 'ERROR.CHIEF_ACCESS_REQUIRED' }]);
    expect((await call(readmit, { token: leader, params: { tag: 'AAA111' } })).status).toBe(403);

    const excluded = await call(exclude, { token, params: { tag: 'aaa111' }, body });
    expect(excluded.status).toBe(200);
    expect(excluded.body.result).toMatchObject({ tag: '#AAA111', reason: 'Away all month', untilRevoked: false, excludedBy: 'chief' });
    expect(excluded.body.messages).toEqual([{ key: 'SUCCESS.PLAYER_EXCLUDED' }]);

    let ranking = (await call(getSelection, { token: leader })).body.result.players;
    const alice = ranking.find((p: { tag: string }) => p.tag === '#AAA111');
    expect(alice).toMatchObject({ status: 'excluded', eligible: false, exclusion: { reason: 'Away all month', excludedBy: 'chief' } });
    expect(ranking.find((p: { tag: string }) => p.tag === '#BBB222').status).toBe('starter');

    // Excluding again replaces the reason; no reason is fine.
    expect((await call(exclude, { token, params: { tag: '%23AAA111' }, body: {} })).body.result.reason).toBeNull();

    const back = await call(readmit, { token, params: { tag: 'AAA111' } });
    expect(back.status).toBe(200);
    expect(back.body.messages).toEqual([{ key: 'SUCCESS.PLAYER_READMITTED' }]);
    ranking = (await call(getSelection, { token: leader })).body.result.players;
    expect(ranking.find((p: { tag: string }) => p.tag === '#AAA111')).toMatchObject({ status: 'starter', exclusion: null });
    // Taking back a player who is not excluded changes nothing.
    expect((await call(readmit, { token, params: { tag: 'AAA111' } })).status).toBe(200);
  });

  it('refuse players outside the clan, invalid tags and long reasons', async () => {
    const token = await admin();
    await PlayerModel.create({ tag: '#GONE11', name: 'Gone', townHallLevel: 17, inClan: false });
    await PlayerModel.create({ tag: '#RED111', name: 'Red', clanTag: ROSSA, townHallLevel: 17, inClan: true });
    expect((await call(exclude, { token, params: { tag: 'GONE11' }, body: {} })).status).toBe(404);
    // Members of the other clans of the Crusade are candidates too.
    expect((await call(exclude, { token, params: { tag: 'RED111' }, body: {} })).status).toBe(200);
    expect((await call(exclude, { token, params: { tag: 'NOPE11' }, body: {} })).status).toBe(404);
    const invalid = await call(exclude, { token, params: { tag: 'x' }, body: {} });
    expect(invalid.status).toBe(400);
    expect(invalid.body.messages).toContainEqual(expect.objectContaining({ key: 'ERROR.PLAYER_TAG_IS_NOT_VALID' }));
    await PlayerModel.create({ tag: '#AAA111', name: 'Alice', townHallLevel: 17, inClan: true });
    const long = await call(exclude, { token, params: { tag: 'AAA111' }, body: { reason: 'x'.repeat(201) } });
    expect(long.status).toBe(400);
    expect(long.body.messages).toContainEqual(expect.objectContaining({ key: 'ERROR.EXCLUSION_REASON_IS_TOO_LONG' }));
  });
});

describe('selections by season', () => {
  /** Players for a line-up: 18 of town hall 17 in Nera (16 starters + reserves), one in Rossa. */
  async function seedPlayers() {
    await PlayerModel.create([
      ...Array.from({ length: 18 }, (_, i) => ({
        tag: `#P${String(i).padStart(3, '0')}`,
        name: `Player ${i}`,
        clanTag: NERA,
        townHallLevel: 17,
        inClan: true,
      })),
      { tag: '#RED001', name: 'Red', clanTag: ROSSA, townHallLevel: 17, inClan: true, ...MAXED_HEROES },
    ]);
  }

  it('opens the season after the last CWL started, and moves on when it is closed', async () => {
    const now = new Date('2026-11-22T10:00:00Z');
    expect(seasonOf(now)).toBe('2026-11');
    expect(nextSeason('2026-12')).toBe('2027-01');
    // No CWL of November yet: November is open.
    expect(await ensureOpenSelection(now)).toBe('2026-11');
    // November's CWL started: its selection is closed by the scheduler and December opens.
    await CwlSeasonModel.create({ season: '2026-11', clanTag: NERA, state: 'inWar', lastSyncedAt: now });
    expect(await syncCwlSelections(now)).toEqual(['2026-11']);
    const november = await CwlSelectionModel.findOne({ season: '2026-11' }).lean();
    expect(november).toMatchObject({ state: 'closed', closedBy: null, closedAutomatically: true });
    expect(await ensureOpenSelection(now)).toBe('2026-12');
    // Nothing else to close.
    expect(await syncCwlSelections(now)).toEqual([]);

    const december = await getCwlSelection(undefined, now);
    expect(december).toMatchObject({
      season: '2026-12',
      state: 'open',
      signupStart: '2026-12-01T00:00:00.000Z',
      closedAt: null,
      canReopen: false,
      seasons: [
        { season: '2026-12', state: 'open' },
        { season: '2026-11', state: 'closed' },
      ],
    });
  });

  it('never makes selections for the seasons before the first one', async () => {
    const now = new Date('2026-11-22T10:00:00Z');
    await CwlSeasonModel.create([
      { season: '2026-10', clanTag: NERA, state: 'ended', lastSyncedAt: now },
      { season: '2026-11', clanTag: NERA, state: 'ended', lastSyncedAt: now },
    ]);
    expect(await syncCwlSelections(now)).toEqual([]);
    expect((await CwlSelectionModel.find().lean()).map((s) => [s.season, s.state])).toEqual([['2026-12', 'open']]);
    // An open selection whose CWL never came (no sign-up) is dropped when its month is over.
    expect(await ensureOpenSelection(new Date('2027-01-05T10:00:00Z'))).toBe('2027-01');
    expect((await CwlSelectionModel.find().lean()).map((s) => s.season)).toEqual(['2027-01']);
  });

  it('closes by the leader of Crociata Nera: the ranking is frozen, the line-up drafted, the next season opened', async () => {
    await seedCrusadeRosters(['#MEMBER'], ['#LEADER'], ['#CHIEF']);
    const member = await register('member', ['#MEMBER']);
    const leader = await register('leader', ['#LEADER']);
    const token = await register('chief', ['#CHIEF']);
    await seedPlayers();
    const season = (await call(getSelection, { token: member })).body.result.season as string;

    for (const denied of [member, leader]) {
      const reply = await call(closeRoute, { token: denied, params: { season } });
      expect(reply.status).toBe(403);
      expect(reply.body.messages).toEqual([{ key: 'ERROR.CHIEF_ACCESS_REQUIRED' }]);
    }
    expect((await call(closeRoute, { token, params: { season: 'nope' } })).status).toBe(400);
    expect((await call(closeRoute, { token, params: { season: '2020-01' } })).status).toBe(404);

    const closed = await call(closeRoute, { token, params: { season } });
    expect(closed.status).toBe(200);
    expect(closed.body.messages).toEqual([{ key: 'SUCCESS.CWL_SELECTION_CLOSED' }]);
    expect(closed.body.result).toMatchObject({ season, state: 'closed', closedBy: 'chief', closedAutomatically: false, canReopen: true });
    expect(closed.body.result.players).toHaveLength(19);
    const again = await call(closeRoute, { token, params: { season } });
    expect(again.status).toBe(409);
    expect(again.body.messages).toEqual([{ key: 'ERROR.CWL_SELECTION_NOT_OPEN' }]);

    // The next season is open now; the closed one keeps its ranking.
    await PlayerModel.create({ tag: '#NEW001', name: 'Newcomer', clanTag: NERA, townHallLevel: 17, inClan: true });
    const open = (await call(getSelection, { token: leader })).body.result;
    expect(open).toMatchObject({ season: nextSeason(season), state: 'open' });
    expect(open.players).toHaveLength(20);
    const frozen = await call(getSelection, { token: leader, path: `/api/v1/cwl/selection?season=${season}` });
    expect(frozen.body.result).toMatchObject({ season, state: 'closed' });
    expect(frozen.body.result.players).toHaveLength(19);
    // Every member reads the closed ones too.
    const reserves = await call(selectionPlayers, { token: member, path: `/api/v1/cwl/selection/players?season=${season}&status=reserve` });
    expect(reserves.status).toBe(200);
    expect(reserves.body.result.items).toHaveLength(3);
    expect((await call(getSelection, { token: leader, path: '/api/v1/cwl/selection?season=2020-01' })).status).toBe(404);

    // The draft of the announcement: the 15 starters and 3 reserves, Red from Crociata Rossa among them.
    const draft = await AnnouncementModel.findOne({ kind: 'lineup' }).lean();
    expect(draft).toMatchObject({ state: 'draft', clanTag: NERA, subject: season });
    const data = draft!.data as { starters: { name: string; clanTag: string; townHallLevel: number }[]; reserves: unknown[]; season: string };
    expect(data.season).toBe(season);
    expect(data.starters).toHaveLength(15);
    expect(data.reserves).toHaveLength(3);
    expect(data.starters[0]).toEqual({ name: 'Red', townHallLevel: 17, clanTag: ROSSA });
  });

  it('opens a closed selection again until its CWL starts', async () => {
    await seedCrusadeRosters([], ['#LEADER']);
    const leader = await register('leader', ['#LEADER']);
    const token = await admin();
    await seedPlayers();
    const now = new Date();
    const season = await ensureOpenSelection(now);
    await closeSelection(season, null, now);
    expect(await AnnouncementModel.countDocuments({ kind: 'lineup', state: 'draft' })).toBe(1);

    expect((await call(reopenRoute, { token: leader, params: { season } })).status).toBe(403);
    const back = await call(reopenRoute, { token, params: { season } });
    expect(back.status).toBe(200);
    expect(back.body.messages).toEqual([{ key: 'SUCCESS.CWL_SELECTION_REOPENED' }]);
    expect(back.body.result).toMatchObject({ season, state: 'open', closedAt: null });
    // The next season waits; the unpublished draft goes.
    expect(await CwlSelectionModel.exists({ season: nextSeason(season) })).toBeNull();
    expect(await AnnouncementModel.countDocuments({ kind: 'lineup' })).toBe(0);
    const notClosed = await call(reopenRoute, { token, params: { season } });
    expect(notClosed.status).toBe(409);
    expect(notClosed.body.messages).toEqual([{ key: 'ERROR.CWL_SELECTION_NOT_CLOSED' }]);

    // Closed again (a new draft), then its CWL starts: no way back.
    await closeSelection(season, null, new Date(now.getTime() + 1000));
    expect(await AnnouncementModel.countDocuments({ kind: 'lineup', state: 'draft' })).toBe(1);
    await CwlSeasonModel.create({ season, clanTag: NERA, state: 'preparation', lastSyncedAt: now });
    const late = await call(reopenRoute, { token, params: { season } });
    expect(late.status).toBe(409);
    expect(late.body.messages).toEqual([{ key: 'ERROR.CWL_SELECTION_CANNOT_REOPEN' }]);
    expect((await getCwlSelection(season)).canReopen).toBe(false);
  });

  it('prepares no draft while the line-up announcements are turned off', async () => {
    await seedPlayers();
    await updateAnnouncementSettings([{ kind: 'lineup', enabled: false }]);
    const now = new Date();
    await closeSelection(await ensureOpenSelection(now), null, now);
    expect(await AnnouncementModel.countDocuments({ kind: 'lineup' })).toBe(0);
  });

  it('keeps an exclusion for its season only, unless it lasts until revoked', async () => {
    await seedPlayers();
    const adminUser = await UserModel.create({
      email: 'boss@x.io',
      username: 'boss',
      usernameKey: 'boss',
      passwordHash: 'x',
      roles: [UserRole.USER, UserRole.ADMIN],
    });
    const now = new Date('2026-11-22T10:00:00Z');
    const season = await ensureOpenSelection(now);
    const id = adminUser._id.toString();
    await excludePlayer('#P000', { reason: 'Away', untilRevoked: false }, id, now);
    await excludePlayer('#P001', { reason: 'Alt account', untilRevoked: true }, id, now);
    // An exclusion saved before selections had seasons lasts until revoked.
    await CwlExclusionModel.create({ playerTag: '#P002', reason: null, excludedBy: 'old', excludedAt: now });
    const status = async (s?: string) =>
      Object.fromEntries((await getCwlSelection(s, now)).players.map((p) => [p.tag, [p.status, p.exclusion?.untilRevoked ?? null]]));

    let open = await status();
    expect(open['#P000']).toEqual(['excluded', false]);
    expect(open['#P001']).toEqual(['excluded', true]);
    expect(open['#P002']).toEqual(['excluded', true]);

    await closeSelection(season, null, now);
    open = await status();
    expect(open['#P000']![0]).not.toBe('excluded');
    expect(open['#P001']![0]).toBe('excluded');
    // The closed selection keeps them as they were.
    expect((await status(season))['#P000']).toEqual(['excluded', false]);

    // Changing the duration replaces the exclusion.
    await excludePlayer('#P001', { reason: null, untilRevoked: false }, id, now);
    expect(await CwlExclusionModel.countDocuments({ playerTag: '#P001' })).toBe(1);
    expect((await status())['#P001']).toEqual(['excluded', false]);
  });
});

describe('data for the line-up', () => {
  it('reads the heroes and their equipment from the profiles, a few per run', async () => {
    await PlayerModel.create([
      { tag: '#AAA111', name: 'Alice', inClan: true },
      { tag: '#OLD222', name: 'Gone', inClan: false },
      { tag: '#ERR333', name: 'Broken', inClan: true },
    ]);
    const coc = mockCocApi({
      '/players/%23AAA111': {
        body: {
          heroes: [
            {
              name: 'Barbarian King',
              level: 90,
              maxLevel: 100,
              village: 'home',
              equipment: [{ name: 'Rage Vial', level: 10, maxLevel: 18, village: 'home' }],
            },
            { name: 'Battle Machine', level: 30, maxLevel: 35, village: 'builderBase' },
          ],
        },
      },
      '/players/%23ERR333': { status: 503, body: { reason: 'inMaintenance' } },
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await syncPlayerProfiles(NOW)).toEqual({ refreshed: 1, failed: 1 });
    expect(await PlayerModel.findOne({ tag: '#AAA111' }).lean()).toMatchObject({
      heroes: [{ name: 'Barbarian King', level: 90, maxLevel: 100 }],
      equipment: [{ name: 'Rage Vial', level: 10, maxLevel: 18 }],
      profileSyncedAt: NOW,
    });
    expect(coc).toHaveBeenCalledTimes(2);

    // Read again only after a while, the failed one too.
    coc.mockClear();
    await syncPlayerProfiles(new Date(NOW.getTime() + 60_000));
    expect(coc).not.toHaveBeenCalled();
    await syncPlayerProfiles(new Date(NOW.getTime() + PROFILE_RETRY_MS));
    expect(coc).toHaveBeenCalledTimes(1); // the failed one only
    expect(PROFILES_PER_RUN).toBeGreaterThan(0);
  });

  it('lets the other players go first while a profile keeps failing', async () => {
    await PlayerModel.create([
      ...Array.from({ length: PROFILES_PER_RUN }, (_, i) => ({ tag: `#ERR${i}`, name: `Broken ${i}`, inClan: true })),
      { tag: '#AAA111', name: 'Alice', inClan: true, profileSyncedAt: new Date(NOW.getTime() - PROFILE_TTL_MS - 1) },
    ]);
    // Only Alice's profile can be read (the others answer 404).
    mockCocApi({ '/players/%23AAA111': { body: { heroes: [] } } });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await syncPlayerProfiles(NOW)).toEqual({ refreshed: 0, failed: PROFILES_PER_RUN });
    expect(await syncPlayerProfiles(new Date(NOW.getTime() + 60_000))).toEqual({ refreshed: 1, failed: 0 });
  });

  it('remembers when a player joined (or came back to) the clan', async () => {
    const bob = { tag: '#AAA222', name: 'Bob' };
    let members = [{ tag: '#AAA111', name: 'Alice' }, bob];
    mockCocApi({
      '/clans/%232J8JVVCLC': () => ({ body: { memberList: members } }),
      '/goldpass/seasons/current': { status: 404, body: {} },
    });
    await PlayerModel.create({ tag: '#AAA111', name: 'Alice', inClan: true, joinedAt: null });
    const first = new Date('2026-11-01T00:00:00Z');
    await syncMembers(first);
    // Already in the clan before joins were tracked: unknown.
    expect((await PlayerModel.findOne({ tag: '#AAA111' }).lean())!.joinedAt).toBeNull();

    members = [bob];
    await syncMembers(new Date('2026-11-05T00:00:00Z'));
    members = [{ tag: '#AAA111', name: 'Alice' }, bob];
    const back = new Date('2026-11-10T00:00:00Z');
    await syncMembers(back);
    expect((await PlayerModel.findOne({ tag: '#AAA111' }).lean())!.joinedAt).toEqual(back);
    await syncMembers(new Date('2026-11-12T00:00:00Z'));
    expect((await PlayerModel.findOne({ tag: '#AAA111' }).lean())!.joinedAt).toEqual(back);
  });
});
