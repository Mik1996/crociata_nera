import { Attack, Clan, ClanMember, ClanRole, War, WarClan, WarParticipant } from '../models';
import { warResult } from '../utils/war-stats';
import { Random } from './random';

/**
 * Realistic mock data generator for development.
 * Names are made up and tags are randomly generated: no real data.
 */

export interface MockDataset {
  clan: Clan;
  /** All wars, from the most recent (possibly in progress) to the oldest. */
  wars: War[];
}

export interface MockOptions {
  clanTag: string;
  clanName: string;
  /** Reference date used to place wars in time. */
  now?: Date;
  seed?: number;
  pastWars?: number;
  /** When true the most recent war is still in progress. */
  includeCurrentWar?: boolean;
}

interface PlayerProfile {
  tag: string;
  name: string;
  townHall: number;
  /** Attack skill (0-1). */
  skill: number;
  /** Probability of using each available attack. */
  reliability: number;
  /** Probability of signing up for a war. */
  attendance: number;
}

interface AttackEvent extends Omit<Attack, 'order'> {
  instant: number;
}

const MEMBER_NAMES = [
  'Templare Nero', 'Lord Baldovino', 'Excalibur', 'Ser Goffredo', 'DarkPaladin',
  'Mjolnir', 'Valkyria87', 'Barbaro Pigro', 'Il Conte', "Fra' Tuck",
  'Corvo Rosso', 'Ragnar', 'Draghetta', 'Spartaco', 'Guardiano',
  'Lady Morgana', 'Tancredi', 'Re Artù', 'Elfa Scura', 'Bombarolo',
  'PEKKA Furiosa', 'Golem di Ferro', 'Mago Merlino', 'Cavaliere Oscuro', 'Ascia di Guerra',
  'Sentinella', 'Arciere Nero', 'Leone di Sicilia', 'Vichingo_Mike', 'Stendardo',
];

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
/** Number of oldest wars generated without participant details. */
const SUMMARY_ONLY_WARS = 4;

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
      if (n === 0) {
        index = clamp(position + rnd.int(-2, 2), 0, defenders.length - 1);
      } else {
        // Second attack: clean-up on the highest target not yet at 3 stars.
        const candidates = defenders
          .map((_, i) => i)
          .filter((i) => i >= position - 3 && (best.get(defenders[i].tag) ?? 0) < 3);
        index = candidates.length > 0 ? candidates[0] : rnd.int(0, defenders.length - 1);
      }
      const defender = defenders[index];
      const { stars, destruction } = attackOutcome(rnd, attacker, defender);
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

function strength(p: PlayerProfile): number {
  return p.townHall * 10 + p.skill * 6;
}

export function generateMockData(options: MockOptions): MockDataset {
  const rnd = new Random(options.seed ?? 2026);
  const now = options.now ?? new Date();
  const pastCount = options.pastWars ?? 24;
  const inProgress = options.includeCurrentWar ?? true;

  const memberProfiles: PlayerProfile[] = MEMBER_NAMES.map((name, i) => ({
    tag: generateTag(rnd),
    name,
    townHall: clamp(17 - Math.floor(i / 5) + rnd.int(-1, 1), 10, 17),
    skill: rnd.range(0.25, 0.95),
    reliability: rnd.chance(0.15) ? rnd.range(0.45, 0.7) : rnd.range(0.85, 1),
    attendance: rnd.chance(0.2) ? rnd.range(0.35, 0.6) : rnd.range(0.75, 1),
  }));

  const members: ClanMember[] = memberProfiles.map((p, i) => ({
    tag: p.tag,
    name: p.name,
    role: roleForIndex(i),
    townHall: p.townHall,
    expLevel: 120 + p.townHall * 8 + rnd.int(0, 40),
    trophies: 3200 + p.townHall * 150 + rnd.int(-400, 600),
    donations: rnd.int(0, 2500),
    donationsReceived: rnd.int(100, 1800),
  }));

  const wars: War[] = [];
  const total = pastCount + (inProgress ? 1 : 0);
  const shuffledOpponents = rnd.shuffle(OPPONENT_NAMES);

  for (let i = 0; i < total; i++) {
    const isCurrent = inProgress && i === 0;
    const teamSize = TEAM_SIZES[i % TEAM_SIZES.length];
    const attacksPerMember = 2;

    // Dates: the current war started 10 hours ago; previous ones every ~2.5 days.
    const start = isCurrent
      ? new Date(now.getTime() - 10 * HOUR)
      : new Date(now.getTime() - (inProgress ? i : i + 1) * 60 * HOUR - 36 * HOUR);
    start.setMinutes(0, 0, 0);
    const end = new Date(start.getTime() + 24 * HOUR);
    const preparation = new Date(start.getTime() - 23 * HOUR);

    // Clan line-up: who signs up, sorted by strength.
    const signedUp = memberProfiles.filter((p) => rnd.chance(p.attendance));
    const reserves = memberProfiles.filter((p) => !signedUp.includes(p));
    const lineUp = [...rnd.shuffle(signedUp), ...rnd.shuffle(reserves)]
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

    const opponentName = shuffledOpponents[i % shuffledOpponents.length];
    const opponentTag = generateTag(rnd);

    // As with the real API, older wars are known only from the war log (no participants).
    const hasDetails = i < total - SUMMARY_ONLY_WARS;
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
  }

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
    members,
  };

  return { clan, wars };
}

function winStreak(ended: War[]): number {
  const index = ended.findIndex((w) => warResult(w) !== 'victory');
  return index === -1 ? ended.length : index;
}
