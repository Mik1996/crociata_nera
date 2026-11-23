// Deterministic Clash of Clans data for the e2e stack, in the official API format. Times are
// relative to the moment the stack starts, so the same scenario holds whenever the suite runs:
// three ended wars and one battle day for Crociata Nera, two Raid Weekends, no CWL.
//
// Player tags are invented (letters and digits, as the backend's validation requires) and the
// names are fictional: no real player's data is used.

import { CLANS, FAKES_URL } from './config.mjs';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/**
 * Pictures (clan badges) are served by the fake API, never by the game's CDN: the backend draws
 * remote badges only from `api-assets.clashofclans.com`, so it does not even try to read these, and
 * the browser shows a local picture.
 */
const ASSETS = `${FAKES_URL}/assets`;

/** `20261105T100000.000Z`, the API's date format. */
export function cocDate(date) {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.(\d{3})Z$/, '.$1Z');
}

const badge = (id) => ({
  small: `${ASSETS}/badges/70/${id}.png`,
  medium: `${ASSETS}/badges/200/${id}.png`,
  large: `${ASSETS}/badges/512/${id}.png`,
});

const NERA_NAMES = [
  'Goffredo',
  'Baldovino',
  'Tancredi',
  'Boemondo',
  'Raimondo',
  'Ugo',
  'Roberto',
  'Eustachio',
  'Folco',
  'Rinaldo',
  'Guglielmo',
  'Arnolfo',
  'Gualtiero',
  'Ademaro',
  'Pietro',
  'Corrado',
  'Federico',
  'Riccardo',
  'Filippo',
  'Ottone',
  'Enrico',
  'Lamberto',
  'Ruggero',
  'Oddone',
  'Gerardo',
  'Ildebrando',
  'Manfredi',
  'Teobaldo',
];

/** One member of a clan, with the role and the numbers the site shows. */
function member(tag, name, role, index, clanSize) {
  return {
    tag,
    name,
    role,
    townHallLevel: 17 - (index % 5),
    expLevel: 250 - index * 3,
    trophies: 5400 - index * 37,
    builderBaseTrophies: 3800 - index * 20,
    clanRank: index + 1,
    previousClanRank: Math.min(clanSize, index + 2),
    donations: 1200 - index * 31,
    donationsReceived: 600 + index * 11,
    leagueTier: { id: 105000034 - (index % 4), name: 'Legend League' },
  };
}

/**
 * Crociata Nera: a leader, 5 co-leaders, 6 elders (`admin` in the API) and 16 members.
 * Crociata Rossa: a leader, 2 co-leaders, 10 members. Crociata d'Oro: a leader and 6 members.
 */
function buildRosters() {
  const nera = NERA_NAMES.map((name, index) => {
    const role =
      index === 0 ? 'leader' : index <= 5 ? 'coLeader' : index <= 11 ? 'admin' : 'member';
    const prefix = { leader: 'NERAL', coLeader: 'NERAC', admin: 'NERAE', member: 'NERAM' }[role];
    return member(
      `#${prefix}${String(index).padStart(2, '0')}`,
      name,
      role,
      index,
      NERA_NAMES.length,
    );
  });
  const rossa = Array.from({ length: 13 }, (_, index) => {
    const role = index === 0 ? 'leader' : index <= 2 ? 'coLeader' : 'member';
    const prefix = { leader: 'ROSSAL', coLeader: 'ROSSAC', member: 'ROSSAM' }[role];
    return member(
      `#${prefix}${String(index).padStart(2, '0')}`,
      `Templare ${index + 1}`,
      role,
      index,
      13,
    );
  });
  const oro = Array.from({ length: 7 }, (_, index) => {
    const role = index === 0 ? 'leader' : 'member';
    return member(
      `#OROM${String(index).padStart(2, '0')}`,
      `Cavaliere ${index + 1}`,
      role,
      index,
      7,
    );
  });
  return { nera, rossa, oro };
}

function clan(tag, name, members, extra) {
  return {
    tag,
    name,
    type: 'inviteOnly',
    description: `${name} — e2e test clan`,
    location: { id: 32000120, name: 'Italy', isCountry: true, countryCode: 'IT' },
    isFamilyFriendly: true,
    badgeUrls: badge(tag.slice(1)),
    clanLevel: 20,
    clanPoints: 52000,
    clanBuilderBasePoints: 40000,
    clanCapitalPoints: 3100,
    capitalLeague: { id: 85000018, name: 'Master League I' },
    requiredTrophies: 4000,
    warFrequency: 'always',
    warWinStreak: 3,
    warWins: 412,
    warTies: 9,
    warLosses: 120,
    isWarLogPublic: true,
    warLeague: { id: 48000018, name: 'Champion League I' },
    members: members.length,
    labels: [],
    requiredBuilderBaseTrophies: 0,
    requiredTownhallLevel: 14,
    clanCapital: { capitalHallLevel: 10, districts: [] },
    chatLanguage: { id: 75000005, name: 'Italian', languageCode: 'IT' },
    memberList: members,
    ...extra,
  };
}

/** Opponent clans of the wars (fictional). */
const OPPONENTS = [
  { tag: '#OPPA001', name: 'Saraceni del Deserto' },
  { tag: '#OPPB002', name: 'Lupi del Nord' },
  { tag: '#OPPC003', name: 'Corsari Neri' },
  { tag: '#OPPD004', name: 'Legione Ombra' },
];

const TEAM_SIZE = 10;

/**
 * A war of Crociata Nera against `opponent`: our first 10 members against 10 opponents. `stars` of
 * our attacks decide the outcome; `ended` wars have every attack done.
 */
function war(opponent, preparationStart, state, ourStars, theirStars, rosters) {
  const startTime = new Date(preparationStart.getTime() + 23 * HOUR);
  const endTime = new Date(startTime.getTime() + DAY);
  const ours = rosters.nera.slice(0, TEAM_SIZE);
  const theirs = Array.from({ length: TEAM_SIZE }, (_, i) => ({
    tag: `${opponent.tag}P${i}`.slice(0, 16),
    name: `${opponent.name.split(' ')[0]} ${i + 1}`,
  }));
  let order = 1;
  const attack = (attackerTag, defenderTag, stars) => ({
    attackerTag,
    defenderTag,
    stars,
    destructionPercentage: stars === 3 ? 100 : stars === 2 ? 78 : stars === 1 ? 52 : 31,
    order: order++,
    duration: 150,
  });
  // Spread a total of stars over the attacks of a side (one attack each, 3 stars at most).
  const spread = (total, n) =>
    Array.from({ length: n }, (_, i) => Math.max(0, Math.min(3, total - i * 3)));
  const ourAttackStars = spread(ourStars, TEAM_SIZE);
  const theirAttackStars = spread(theirStars, TEAM_SIZE);
  const members = ours.map((m, i) => ({
    tag: m.tag,
    name: m.name,
    townhallLevel: m.townHallLevel,
    mapPosition: i + 1,
    opponentAttacks: 1,
    attacks:
      state === 'preparation' ? undefined : [attack(m.tag, theirs[i].tag, ourAttackStars[i])],
  }));
  const opponentMembers = theirs.map((m, i) => ({
    tag: m.tag,
    name: m.name,
    townhallLevel: 16,
    mapPosition: i + 1,
    opponentAttacks: 1,
    attacks:
      state === 'preparation' ? undefined : [attack(m.tag, ours[i].tag, theirAttackStars[i])],
  }));
  const destruction = (stars) =>
    Math.min(100, Math.round((stars / (TEAM_SIZE * 3)) * 1000) / 10 + 20);
  const side = (tag, name, stars, list) => ({
    tag,
    name,
    clanLevel: 20,
    badgeUrls: badge(tag.slice(1)),
    attacks: state === 'preparation' ? 0 : TEAM_SIZE,
    stars: state === 'preparation' ? 0 : stars,
    destructionPercentage: state === 'preparation' ? 0 : destruction(stars),
    members: list,
  });
  return {
    state,
    teamSize: TEAM_SIZE,
    attacksPerMember: 2,
    battleModifier: 'none',
    preparationStartTime: cocDate(preparationStart),
    startTime: cocDate(startTime),
    endTime: cocDate(endTime),
    clan: side(CLANS.nera, 'Crociata Nera', ourStars, members),
    opponent: side(opponent.tag, opponent.name, theirStars, opponentMembers),
  };
}

function warLogEntry(w, result) {
  const side = (s) => ({
    tag: s.tag,
    name: s.name,
    badgeUrls: s.badgeUrls,
    clanLevel: s.clanLevel,
    attacks: s.attacks,
    stars: s.stars,
    destructionPercentage: s.destructionPercentage,
  });
  return {
    result,
    endTime: w.endTime,
    teamSize: w.teamSize,
    attacksPerMember: w.attacksPerMember,
    battleModifier: 'none',
    clan: { ...side(w.clan), expEarned: result === 'win' ? 240 : 80 },
    opponent: side(w.opponent),
  };
}

/** Raid Weekends: Friday 07:00 UTC to Monday 07:00 UTC. The latest one started is listed first. */
function raidSeasons(now, rosters) {
  const friday = new Date(now);
  friday.setUTCHours(7, 0, 0, 0);
  while (friday.getUTCDay() !== 5 || friday > now) friday.setTime(friday.getTime() - DAY);
  const weekends = [friday, new Date(friday.getTime() - 7 * DAY)];
  return weekends.map((start, w) => {
    const end = new Date(start.getTime() + 3 * DAY);
    const members = rosters.nera.slice(0, 20).map((m, i) => ({
      tag: m.tag,
      name: m.name,
      attacks: 6 - (i % 3),
      attackLimit: 5,
      bonusAttackLimit: 1,
      capitalResourcesLooted: 24000 - i * 700 - w * 1000,
    }));
    const loot = members.reduce((sum, m) => sum + m.capitalResourcesLooted, 0);
    return {
      state: now < end ? 'ongoing' : 'ended',
      startTime: cocDate(start),
      endTime: cocDate(end),
      capitalTotalLoot: loot,
      raidsCompleted: 6 - w,
      totalAttacks: members.reduce((sum, m) => sum + m.attacks, 0),
      enemyDistrictsDestroyed: 40 - w * 3,
      offensiveReward: 1500 - w * 100,
      defensiveReward: 400,
      members,
      attackLog: [],
      defenseLog: [],
    };
  });
}

/** Profile of a player (`GET /players/{tag}`). */
function playerProfile(m, clanInfo) {
  return {
    tag: m.tag,
    name: m.name,
    townHallLevel: m.townHallLevel,
    expLevel: m.expLevel,
    trophies: m.trophies,
    bestTrophies: m.trophies + 300,
    warStars: 1500,
    attackWins: 120,
    defenseWins: 14,
    builderHallLevel: 10,
    builderBaseTrophies: m.builderBaseTrophies ?? 3000,
    bestBuilderBaseTrophies: 4200,
    role: m.role,
    warPreference: 'in',
    donations: m.donations ?? 0,
    donationsReceived: m.donationsReceived ?? 0,
    clanCapitalContributions: 250000,
    clan: clanInfo,
    leagueTier: m.leagueTier,
    achievements: [],
    labels: [],
    troops: [{ name: 'Barbarian', level: 12, maxLevel: 12, village: 'home' }],
    heroes: [
      { name: 'Barbarian King', level: 95, maxLevel: 100, village: 'home' },
      { name: 'Archer Queen', level: 95, maxLevel: 100, village: 'home' },
      { name: 'Grand Warden', level: 70, maxLevel: 75, village: 'home' },
      { name: 'Royal Champion', level: 45, maxLevel: 50, village: 'home' },
    ],
    heroEquipment: [],
    spells: [],
  };
}

/**
 * The whole world at `now`. `currentWar` of the main clan is switched by the stack while seeding
 * (each ended war is shown as `warEnded` once, then the battle day), see `seedGameData`.
 */
export function buildGameData(now = new Date()) {
  const rosters = buildRosters();
  const clans = {
    [CLANS.nera]: clan(CLANS.nera, 'Crociata Nera', rosters.nera),
    [CLANS.rossa]: clan(CLANS.rossa, 'Crociata Rossa', rosters.rossa),
    [CLANS.oro]: clan(CLANS.oro, "Crociata d'Oro", rosters.oro, { isWarLogPublic: false }),
  };

  // Ended wars, oldest first (outcomes: win, lose, win), then the war on its battle day.
  const endedWars = [
    war(OPPONENTS[0], new Date(now.getTime() - 9 * DAY), 'warEnded', 26, 18, rosters),
    war(OPPONENTS[1], new Date(now.getTime() - 6 * DAY), 'warEnded', 17, 24, rosters),
    war(OPPONENTS[2], new Date(now.getTime() - 3 * DAY), 'warEnded', 28, 21, rosters),
  ];
  const results = ['win', 'lose', 'win'];
  const battleDay = war(
    OPPONENTS[3],
    new Date(now.getTime() - 29 * HOUR),
    'inWar',
    15,
    12,
    rosters,
  );

  const players = new Map();
  for (const [key, list] of Object.entries(rosters)) {
    const c = clans[CLANS[key]];
    for (const m of list) {
      players.set(
        m.tag,
        playerProfile(m, {
          tag: c.tag,
          name: c.name,
          clanLevel: c.clanLevel,
          badgeUrls: c.badgeUrls,
        }),
      );
    }
  }
  // Players outside the Crusade: linking them gives no access to the clans' pages.
  for (let i = 0; i < 12; i++) {
    const m = member(
      `#OUTSIDE${String(i).padStart(2, '0')}`,
      `Pellegrino ${i + 1}`,
      'member',
      i,
      12,
    );
    players.set(m.tag, playerProfile(m, undefined));
  }
  players.set(
    '#VERIFY503',
    playerProfile(member('#VERIFY503', 'Eremita', 'member', 0, 1), undefined),
  );

  const seasonStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 8));
  const seasonEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 8));

  return {
    now,
    rosters,
    clans,
    endedWars,
    warLog: endedWars.map((w, i) => warLogEntry(w, results[i])).reverse(),
    battleDay,
    raids: raidSeasons(now, rosters),
    players,
    goldPass: { startTime: cocDate(seasonStart), endTime: cocDate(seasonEnd) },
  };
}
