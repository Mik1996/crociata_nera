import { Attack, Clan, ClanMember, ClanRole, MemberLeague, War, WarClan, WarParticipant } from '../models';
import { warResult } from '../utils/war-stats';
import { Random } from './random';

/**
 * Realistic mock data generator for development: about one year of wars, with players who
 * join and leave, upgrade their Town Hall and improve (or lose interest) over time.
 * Names are made up and tags are randomly generated: no real data.
 */

export interface MockDataset {
  clan: Clan;
  /** All wars, from the most recent (possibly in progress) to the oldest. */
  wars: War[];
  /** Players who took part in past wars and have since left the clan. */
  formerMembers: { tag: string; name: string }[];
}

export interface MockOptions {
  clanTag: string;
  clanName: string;
  /** Reference date used to place wars in time. */
  now?: Date;
  seed?: number;
  /** Ended wars to generate (default 120: about one year, with the monthly league breaks). */
  pastWars?: number;
  /** When true the most recent war is still in progress. */
  includeCurrentWar?: boolean;
}

/** A player's state in a given war. */
interface PlayerProfile {
  tag: string;
  name: string;
  townHall: number;
  /** Attack skill (0-1, up to 1.6 for exceptional players). */
  skill: number;
  /** Probability of using each available attack. */
  reliability: number;
  /** Probability of signing up for a war. */
  attendance: number;
  /** Legendary player: always in the line-up, only 3-stars against stronger bases, unbeatable on defence. */
  legend?: boolean;
}

/** [value at the start of the timeline (or when joining), value at the end (or when leaving)]. */
type Trend = [from: number, to: number];

/** How a player evolves over the whole timeline (positions are fractions from 0 = oldest war to 1 = today). */
interface PlayerTimeline {
  tag: string;
  name: string;
  joinsAt: number;
  /** `null` = still in the clan. */
  leavesAt: number | null;
  townHall: Trend;
  skill: Trend;
  reliability: Trend;
  attendance: Trend;
  legend?: boolean;
}

interface AttackEvent extends Omit<Attack, 'order'> {
  instant: number;
}

/**
 * Current members, by role: leader, 3 co-leaders, 8 elders, then members.
 * The last {@link NEWCOMERS} joined during the year.
 */
const MEMBER_NAMES = [
  'Templare Nero', 'Lord Baldovino', 'Excalibur', 'Ser Goffredo', 'DarkPaladin',
  'Mjolnir', 'Valkyria87', 'Barbaro Pigro', 'Il Conte', "Fra' Tuck",
  'Corvo Rosso', 'Ragnar', 'Spartaco', 'Guardiano', 'Lady Morgana',
  'Tancredi', 'Re Artù', 'Elfa Scura', 'Bombarolo', 'PEKKA Furiosa',
  'Golem di Ferro', 'Mago Merlino',
  'Draghetta', 'Cavaliere Oscuro', 'Ascia di Guerra', 'Sentinella',
  'Arciere Nero', 'Leone di Sicilia', 'Vichingo_Mike', 'Stendardo',
];
const NEWCOMERS = 8;

/** Players who left the clan during the year: they only appear in past wars. */
const FORMER_NAMES = [
  'Saladino', 'Rinaldo', 'Hellfire', 'Gattuso', 'NotteBuia', 'Orso Bruno',
  'Brancaleone', 'Lupo Grigio', 'Zeus_ITA', 'Ombra', 'Falco', 'Sir Lancillotto',
];

/**
 * Recognizable characters, so the long-term statistics have something to show.
 * Overrides the randomly generated trends of the named player.
 */
const PERSONAS: Record<string, Partial<PlayerTimeline>> = {
  // The leader is a legend: earns every commendation, gold tier, each month.
  'Templare Nero': { townHall: [15, 15], skill: [1.6, 1.6], reliability: [1, 1], attendance: [1, 1], legend: true },
  // Always there; in the last months every attack is a 3-star ("Perfect" commendation).
  Excalibur: { townHall: [17, 17], skill: [1.2, 1.6], reliability: [0.99, 1], attendance: [0.97, 0.8] },
  // Lower Town Hall but great skill: 3 stars against stronger bases ("Giant Hunter", silver).
  Ragnar: { townHall: [13, 13], skill: [1.3, 1.6], reliability: [1, 1], attendance: [1, 1] },
  // Strong but often forgets the second attack.
  'Barbaro Pigro': { townHall: [16, 17], skill: [0.7, 0.75], reliability: [0.5, 0.45], attendance: [0.8, 0.8] },
  // Veteran slowly losing interest.
  'Il Conte': { townHall: [16, 16], skill: [0.85, 0.55], reliability: [0.98, 0.65], attendance: [0.95, 0.35] },
  // Newcomer who grows fast: Town Hall and skill climb month after month.
  Draghetta: { joinsAt: 0.3, townHall: [11, 16], skill: [0.2, 0.85], reliability: [0.9, 1], attendance: [1, 1] },
  // Left after a few months of decline.
  Saladino: { joinsAt: 0, leavesAt: 0.45, townHall: [17, 17], skill: [0.9, 0.6], reliability: [1, 0.6], attendance: [1, 0.5] },
};

const OPPONENT_NAMES = [
  'Legione Oscura', 'I Predoni del Nord', 'Dragon Slayers', 'Fenice Rossa', 'Brotherhood ITA',
  'Spartans 300', 'Lupi Solitari', 'Clan Titan', 'Ordine del Drago', 'Black Knights',
  'Les Invincibles', 'Iron Wolves', 'Os Guerreiros', 'Kaiser Krieger', 'Shadow Hunters',
  'Royal Ghosts', 'Valhalla Rising', 'Los Conquistadores', 'Akatsuki Clan', 'Samurai Spirit',
  'Thunder Bros', 'Elite Warriors', 'Northern Lights', 'Phoenix Army', 'Desert Storm',
];

const PREFIXES = ['Dark', 'Mega', 'Shadow', 'King', 'Lil', 'Pro', 'Mr', 'Iron', 'Fire', 'Ice', 'Wild', 'Big'];
const SUFFIXES = ['Hog', 'Wizard', 'Golem', 'Archer', 'Dragon', 'Miner', 'Witch', 'Titan', 'Wolf', 'Bowler', 'Yeti', 'Knight'];

const TAG_CHARS = '0289PYLQGRJCUV';
const HOUR = 3_600_000;
const TEAM_SIZES = [15, 20, 15, 25, 15, 10, 20, 15];
/** Number of oldest wars generated without participant details (before archiving started). */
const SUMMARY_ONLY_WARS = 4;
/** The monthly Clan War League takes the first days of each month: no regular wars then. */
const LEAGUE_DAYS = 8;

function generateTag(rnd: Random): string {
  let tag = '#';
  const length = rnd.int(8, 9);
  for (let i = 0; i < length; i++) {
    tag += rnd.pick([...TAG_CHARS]);
  }
  return tag;
}

function roleForIndex(i: number): ClanRole {
  if (i === 0) return 'leader';
  if (i <= 3) return 'coLeader';
  if (i <= 11) return 'elder';
  return 'member';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Computes the outcome of an attack based on town halls and skill. */
function attackOutcome(
  rnd: Random,
  attacker: PlayerProfile,
  defender: PlayerProfile,
): { stars: number; destruction: number } {
  const quality = clamp(
    0.32 + 0.5 * attacker.skill + 0.2 * (attacker.townHall - defender.townHall) + rnd.range(-0.3, 0.3),
    0,
    1,
  );
  if (quality > 0.8) return { stars: 3, destruction: 100 };
  if (quality > 0.45) return { stars: 2, destruction: rnd.int(50, 99) };
  if (quality > 0.2) return { stars: 1, destruction: rnd.int(32, 75) };
  return { stars: 0, destruction: rnd.int(8, 49) };
}

/** Simulates the attacks of one side against the other. */
function simulateAttacks(
  rnd: Random,
  attackers: PlayerProfile[],
  defenders: PlayerProfile[],
  attacksPerMember: number,
  progress: number,
): AttackEvent[] {
  const events: AttackEvent[] = [];
  const best = new Map<string, number>();

  attackers.forEach((attacker, position) => {
    for (let n = 0; n < attacksPerMember; n++) {
      if (!rnd.chance(attacker.reliability * progress)) {
        continue;
      }
      let index: number;
      if (attacker.legend) {
        // Goes for the strongest bases: a higher Town Hall not yet at 3 stars.
        const stronger = defenders
          .map((d, i) => ({ d, i }))
          .filter(({ d }) => d.townHall > attacker.townHall && (best.get(d.tag) ?? 0) < 3);
        index = stronger.length > 0 ? stronger[stronger.length - 1].i : 0;
      } else if (n === 0) {
        index = clamp(position + rnd.int(-2, 2), 0, defenders.length - 1);
      } else {
        // Second attack: clean-up on the highest target not yet at 3 stars.
        const candidates = defenders
          .map((_, i) => i)
          .filter((i) => i >= position - 3 && (best.get(defenders[i].tag) ?? 0) < 3);
        index = candidates.length > 0 ? candidates[0] : rnd.int(0, defenders.length - 1);
      }
      const defender = defenders[index];
      let { stars, destruction } = attackOutcome(rnd, attacker, defender);
      if (attacker.legend) {
        stars = 3;
        destruction = 100;
      } else if (defender.legend && stars > 0) {
        // Legendary base: nobody gets a star.
        stars = 0;
        destruction = Math.min(destruction, 45);
      }
      best.set(defender.tag, Math.max(best.get(defender.tag) ?? 0, stars));
      events.push({
        attackerTag: attacker.tag,
        defenderTag: defender.tag,
        stars,
        destructionPercentage: destruction,
        durationSeconds: rnd.int(85, 180),
        instant: rnd.next() * progress + n * 0.001,
      });
    }
  });
  return events;
}

function buildWarClan(
  tag: string,
  name: string,
  level: number,
  profiles: PlayerProfile[],
  attacksMade: Attack[],
  attacksReceived: Attack[],
): WarClan {
  const members: WarParticipant[] = profiles.map((p, i) => {
    const received = attacksReceived.filter((a) => a.defenderTag === p.tag);
    const bestReceived = [...received].sort(
      (a, b) => b.stars - a.stars || b.destructionPercentage - a.destructionPercentage,
    )[0];
    return {
      tag: p.tag,
      name: p.name,
      townHall: p.townHall,
      mapPosition: i + 1,
      attacks: attacksMade.filter((a) => a.attackerTag === p.tag),
      opponentAttacks: received.length,
      bestOpponentAttack: bestReceived,
    };
  });

  // Stars and destruction are computed on the best result achieved against each opposing defender.
  const best = new Map<string, { stars: number; destruction: number }>();
  for (const a of attacksMade) {
    const current = best.get(a.defenderTag) ?? { stars: 0, destruction: 0 };
    best.set(a.defenderTag, {
      stars: Math.max(current.stars, a.stars),
      destruction: Math.max(current.destruction, a.destructionPercentage),
    });
  }
  const values = [...best.values()];
  const stars = values.reduce((s, v) => s + v.stars, 0);
  const destruction = values.reduce((s, v) => s + v.destruction, 0) / profiles.length;

  return {
    tag,
    name,
    level,
    stars,
    destructionPercentage: Math.round(destruction * 100) / 100,
    attacksUsed: attacksMade.length,
    members,
  };
}

/** Leagues of the mock members by trophies, with the local league images (offline demo). */
const MOCK_LEAGUES: [minTrophies: number, league: MemberLeague][] = [
  [5900, { id: 105000037, name: 'Legend League', iconUrl: 'game/leagues/legend.webp' }],
  [5500, { id: 105000034, name: 'Titan League', iconUrl: 'game/leagues/titan.webp' }],
  [5000, { id: 105000031, name: 'Champion League', iconUrl: 'game/leagues/champion.webp' }],
  [4500, { id: 105000028, name: 'Master League', iconUrl: 'game/leagues/master.webp' }],
  [0, { id: 105000025, name: 'Crystal League', iconUrl: 'game/leagues/crystal.webp' }],
];

function mockLeague(trophies: number): MemberLeague {
  return MOCK_LEAGUES.find(([min]) => trophies >= min)![1];
}

function strength(p: PlayerProfile): number {
  return p.townHall * 10 + p.skill * 6;
}

function lerp([from, to]: Trend, t: number): number {
  return from + (to - from) * t;
}

/** Random trends for every player that ever was in the clan, current and former. */
function buildTimelines(rnd: Random): PlayerTimeline[] {
  const current = MEMBER_NAMES.map((name, i): PlayerTimeline => {
    const isNewcomer = i >= MEMBER_NAMES.length - NEWCOMERS;
    if (isNewcomer) {
      // Joined during the year with a lower Town Hall, improving quickly.
      const finalTh = rnd.int(12, 16);
      const skill = rnd.range(0.2, 0.4);
      return {
        tag: generateTag(rnd),
        name,
        joinsAt: rnd.range(0.25, 0.92),
        leavesAt: null,
        townHall: [Math.max(9, finalTh - rnd.int(1, 3)), finalTh],
        skill: [skill, skill + rnd.range(0.2, 0.4)],
        reliability: [rnd.range(0.75, 0.95), rnd.range(0.85, 1)],
        attendance: [rnd.range(0.8, 1), rnd.range(0.75, 1)],
      };
    }
    const finalTh = clamp(17 - Math.floor(i / 6) + rnd.int(-1, 1), 12, 17);
    const skill = rnd.range(0.35, 0.95);
    const reliability = rnd.chance(0.15) ? rnd.range(0.5, 0.7) : rnd.range(0.85, 1);
    const attendance = rnd.chance(0.2) ? rnd.range(0.4, 0.6) : rnd.range(0.75, 1);
    return {
      tag: generateTag(rnd),
      name,
      joinsAt: 0,
      leavesAt: null,
      townHall: [Math.max(10, finalTh - rnd.int(0, 2)), finalTh],
      skill: [Math.max(0.2, skill - rnd.range(0, 0.15)), skill],
      reliability: [reliability, clamp(reliability + rnd.range(-0.1, 0.05), 0.4, 1)],
      attendance: [attendance, clamp(attendance + rnd.range(-0.15, 0.05), 0.3, 1)],
    };
  });

  const former = FORMER_NAMES.map((name): PlayerTimeline => {
    const joinsAt = rnd.chance(0.75) ? 0 : rnd.range(0.05, 0.3);
    const finalTh = rnd.int(13, 17);
    const skill = rnd.range(0.3, 0.9);
    return {
      tag: generateTag(rnd),
      name,
      joinsAt,
      leavesAt: clamp(joinsAt + rnd.range(0.12, 0.7), 0.1, 0.85),
      townHall: [Math.max(10, finalTh - rnd.int(0, 1)), finalTh],
      skill: [skill, skill + rnd.range(-0.15, 0.05)],
      reliability: [rnd.range(0.7, 1), rnd.range(0.5, 0.9)],
      attendance: [rnd.range(0.7, 1), rnd.range(0.4, 0.8)],
    };
  });

  return [...current, ...former].map((p) => ({ ...p, ...PERSONAS[p.name] }));
}

/** State of a player in the war at position `t` of the timeline; `null` if not in the clan then. */
function profileAt(p: PlayerTimeline, t: number): PlayerProfile | null {
  if (t < p.joinsAt || (p.leavesAt !== null && t >= p.leavesAt)) return null;
  const end = p.leavesAt ?? 1;
  const progress = end > p.joinsAt ? clamp((t - p.joinsAt) / (end - p.joinsAt), 0, 1) : 1;
  return {
    tag: p.tag,
    name: p.name,
    // Town Hall upgrades are steps, not a smooth curve.
    townHall: Math.round(lerp(p.townHall, progress)),
    // Above 1 = exceptional players who almost never miss a 3-star.
    skill: clamp(lerp(p.skill, progress), 0.05, 1.6),
    reliability: clamp(lerp(p.reliability, progress), 0, 1),
    attendance: clamp(lerp(p.attendance, progress), 0, 1),
    legend: p.legend,
  };
}

/**
 * War start times, from the most recent to the oldest: one war every 2-2.5 days, with no
 * regular wars during the first {@link LEAGUE_DAYS} days of each month (Clan War League).
 */
function warStarts(rnd: Random, now: Date, count: number, inProgress: boolean): Date[] {
  const starts: Date[] = [];
  let start = new Date(now.getTime() - (inProgress ? 10 : 48) * HOUR);
  for (let i = 0; i < count; i++) {
    if (i > 0) {
      start = new Date(start.getTime() - rnd.int(48, 62) * HOUR);
      if (start.getUTCDate() <= LEAGUE_DAYS) {
        // Back to the end of the previous month, before the league started.
        start = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 0, rnd.int(8, 20)));
      }
    }
    start.setUTCMinutes(0, 0, 0);
    starts.push(start);
  }
  return starts;
}

export function generateMockData(options: MockOptions): MockDataset {
  const rnd = new Random(options.seed ?? 2026);
  const now = options.now ?? new Date();
  const pastCount = options.pastWars ?? 120;
  const inProgress = options.includeCurrentWar ?? true;
  const total = pastCount + (inProgress ? 1 : 0);

  const timelines = buildTimelines(rnd);
  const currentTimelines = timelines.slice(0, MEMBER_NAMES.length);

  const members: ClanMember[] = currentTimelines.map((p, i) => {
    const townHall = p.townHall[1];
    const trophies = 3200 + townHall * 150 + rnd.int(-400, 600);
    return {
      tag: p.tag,
      name: p.name,
      role: roleForIndex(i),
      townHall,
      expLevel: 120 + townHall * 8 + rnd.int(0, 40) - (p.joinsAt > 0 ? 30 : 0),
      trophies,
      donations: rnd.int(0, 2500),
      donationsReceived: rnd.int(100, 1800),
      league: mockLeague(trophies),
    };
  });

  // Oldest first: players evolve along the timeline.
  const starts = warStarts(rnd, now, total, inProgress).reverse();
  const shuffledOpponents = rnd.shuffle(OPPONENT_NAMES);
  const wars: War[] = [];

  starts.forEach((start, k) => {
    const isCurrent = inProgress && k === total - 1;
    const t = total > 1 ? k / (total - 1) : 1;
    const attacksPerMember = 2;
    const end = new Date(start.getTime() + 24 * HOUR);
    const preparation = new Date(start.getTime() - 23 * HOUR);

    const roster = timelines.map((p) => profileAt(p, t)).filter((p): p is PlayerProfile => p !== null);
    const teamSize = Math.min(TEAM_SIZES[k % TEAM_SIZES.length], Math.floor(roster.length / 5) * 5);

    // Clan line-up: who signs up, sorted by strength.
    const signedUp = roster.filter((p) => rnd.chance(p.attendance));
    const reserves = roster.filter((p) => !signedUp.includes(p));
    const legends = roster.filter((p) => p.legend);
    const lineUp = [
      ...legends,
      ...rnd.shuffle(signedUp.filter((p) => !p.legend)),
      ...rnd.shuffle(reserves.filter((p) => !p.legend)),
    ]
      .slice(0, teamSize)
      .sort((a, b) => strength(b) - strength(a));

    // Opponent line-up with similar strength (± one town hall).
    const offset = rnd.int(-1, 1);
    const opponents: PlayerProfile[] = lineUp
      .map((p) => ({
        tag: generateTag(rnd),
        name: `${rnd.pick(PREFIXES)}${rnd.pick(SUFFIXES)}${rnd.chance(0.4) ? rnd.int(1, 99) : ''}`,
        townHall: clamp(p.townHall + offset + rnd.int(-1, 1), 9, 17),
        skill: rnd.range(0.3, 0.9),
        reliability: rnd.range(0.75, 1),
        attendance: 1,
      }))
      .sort((a, b) => strength(b) - strength(a));

    const progress = isCurrent ? 0.55 : 1;
    const events = [
      ...simulateAttacks(rnd, lineUp, opponents, attacksPerMember, progress).map((e) => ({ ...e, ours: true })),
      ...simulateAttacks(rnd, opponents, lineUp, attacksPerMember, progress).map((e) => ({ ...e, ours: false })),
    ].sort((a, b) => a.instant - b.instant);

    const attacks = events.map(({ instant: _instant, ours, ...a }, order) => ({
      attack: { ...a, order: order + 1 } satisfies Attack,
      ours,
    }));
    const ourAttacks = attacks.filter((a) => a.ours).map((a) => a.attack);
    const theirAttacks = attacks.filter((a) => !a.ours).map((a) => a.attack);

    const opponentName = shuffledOpponents[k % shuffledOpponents.length];
    const opponentTag = generateTag(rnd);

    // As with the real API, older wars are known only from the war log (no participants).
    const hasDetails = k >= SUMMARY_ONLY_WARS;
    const clanSide = buildWarClan(options.clanTag, options.clanName, 18, lineUp, ourAttacks, theirAttacks);
    const opponentSide = buildWarClan(
      opponentTag,
      opponentName,
      rnd.int(10, 22),
      opponents,
      theirAttacks,
      ourAttacks,
    );

    wars.push({
      id: `${preparation.toISOString().slice(0, 10).replaceAll('-', '')}-${opponentTag.slice(1)}`,
      state: isCurrent ? 'battle' : 'ended',
      preparationStartTime: preparation.toISOString(),
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      teamSize,
      attacksPerMember,
      hasDetails,
      clan: hasDetails ? clanSide : { ...clanSide, members: [] },
      opponent: hasDetails ? opponentSide : { ...opponentSide, members: [] },
    });
  });
  wars.reverse();

  const ended = wars.filter((w) => w.state === 'ended');
  const won = ended.filter((w) => warResult(w) === 'victory').length;
  const lost = ended.filter((w) => warResult(w) === 'defeat').length;

  const clan: Clan = {
    tag: options.clanTag,
    name: options.clanName,
    level: 18,
    description: 'Clan italiano dedito alla guerra. Attacchi sempre usati, rispetto per il piano!',
    warWins: 187 + won,
    warLosses: 64 + lost,
    warTies: 5 + ended.length - won - lost,
    warWinStreak: winStreak(ended),
    isWarLogPublic: true,
    warLeague: { id: 48000015, name: 'Master League I' },
    capitalLeague: 'Legend League',
    capitalHallLevel: 10,
    clanPoints: 140_174,
    capitalPoints: 5_365,
    location: 'Italy',
    countryCode: 'IT',
    chatLanguage: 'Italiano',
    labels: [{ name: 'Clan Wars' }, { name: 'Friendly' }, { name: 'Competitive' }],
    type: 'inviteOnly',
    requiredTownHall: 17,
    requiredTrophies: 1400,
    requiredLeague: { name: 'Master League', iconUrl: 'game/leagues/master.webp' },
    members,
  };

  const formerMembers = timelines.slice(MEMBER_NAMES.length).map(({ tag, name }) => ({ tag, name }));
  return { clan, wars, formerMembers };
}

function winStreak(ended: War[]): number {
  const index = ended.findIndex((w) => warResult(w) !== 'victory');
  return index === -1 ? ended.length : index;
}
