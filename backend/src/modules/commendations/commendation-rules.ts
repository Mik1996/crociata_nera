import { compareForRanking, HistoryPeriod, HistoryPlayerStats, HistoryWar } from '@/modules/wars/history.service';

/**
 * Rules of the commendations. Same rules as the frontend (`src/app/core/utils/commendations.ts`),
 * applied here once, when a period closes: the result is saved and never recomputed, so later
 * changes to the rules do not alter the history.
 */

export type CommendationType =
  | 'legendTop'
  | 'cwlAllAttacks'
  | 'perfectWar'
  | 'chiefHunter'
  | 'fortress'
  | 'champion'
  | 'perfect'
  | 'giantSlayer'
  | 'cwlStriker'
  | 'capitalRaider'
  | 'donor'
  | 'wall'
  | 'tireless'
  | 'present';
/** Commendations with a single medal of their own colour, and no bronze, silver and gold. */
export type SingleCommendationType = 'legendTop' | 'cwlAllAttacks' | 'perfectWar' | 'chiefHunter' | 'fortress';
/** Commendations with bronze, silver and gold medals. */
export type GradedCommendationType = Exclude<CommendationType, SingleCommendationType>;
/** Rank of a graded commendation; one-off commendations have none (`null`). */
export type CommendationTier = 'bronze' | 'silver' | 'gold';

export interface Commendation {
  type: CommendationType;
  /** `null` for a one-off commendation. */
  tier: CommendationTier | null;
}

export const COMMENDATION_TYPES: readonly CommendationType[] = [
  'legendTop',
  'cwlAllAttacks',
  'perfectWar',
  'chiefHunter',
  'fortress',
  'champion',
  'perfect',
  'giantSlayer',
  'cwlStriker',
  'capitalRaider',
  'donor',
  'wall',
  'tireless',
  'present',
];
/** From the most valuable. */
export const COMMENDATION_TIERS: readonly CommendationTier[] = ['gold', 'silver', 'bronze'];

/** Requirement of each tier of the graded commendations. */
export const COMMENDATION_THRESHOLDS: Readonly<Record<GradedCommendationType, Readonly<Record<CommendationTier, number>>>> = {
  champion: { bronze: 3, silver: 2, gold: 1 },
  perfect: { bronze: 2.5, silver: 2.8, gold: 3 },
  giantSlayer: { bronze: 2, silver: 5, gold: 10 },
  wall: { bronze: 2.8, silver: 2.5, gold: 2 },
  tireless: { bronze: 3, silver: 5, gold: 8 },
  present: { bronze: 50, silver: 75, gold: 100 },
  cwlStriker: { bronze: 2.5, silver: 2.75, gold: 3 },
  capitalRaider: { bronze: 25_000, silver: 27_500, gold: 30_000 },
  donor: { bronze: 5_000, silver: 7_500, gold: 10_000 },
};

/**
 * The one-off commendations: requirement and catalogue id (see {@link COMMENDATION_IDS}). Their
 * colour (style) is in the frontend twin and in their medal image.
 */
export const SINGLE_COMMENDATIONS: Readonly<Record<SingleCommendationType, { threshold: number; id: string }>> = {
  cwlAllAttacks: { threshold: 3, id: '95000028' },
  chiefHunter: { threshold: 1, id: '95000029' },
  /** Attacks received at least, never three stars conceded. */
  fortress: { threshold: 2, id: '95000030' },
  /** Attacks made at least, all three-star, in a war won with every star. */
  perfectWar: { threshold: 1, id: '95000031' },
  /** Final world position at most, in Legend League I. */
  legendTop: { threshold: 10_000, id: '95000032' },
};

export const MIN_WARS = 3;
export const PERFECT_MIN_ATTACKS = 4;
export const CWL_MIN_ATTACKS = 3;

const LOWER_IS_BETTER: ReadonlySet<CommendationType> = new Set(['champion', 'wall']);
const STRICTLY_ABOVE: ReadonlySet<CommendationType> = new Set(['capitalRaider']);

/**
 * Catalogue of the graded commendations: a stable unique id for each type and tier (one-off ones:
 * {@link SINGLE_COMMENDATIONS}). Ids are never changed nor reused: a new commendation gets a new
 * id, a retired one keeps its id in the saved history.
 */
export const COMMENDATION_IDS: Readonly<Record<GradedCommendationType, Readonly<Record<CommendationTier, string>>>> = {
  champion: { bronze: '95000001', silver: '95000002', gold: '95000003' },
  perfect: { bronze: '95000004', silver: '95000005', gold: '95000006' },
  giantSlayer: { bronze: '95000007', silver: '95000008', gold: '95000009' },
  cwlStriker: { bronze: '95000010', silver: '95000011', gold: '95000012' },
  capitalRaider: { bronze: '95000013', silver: '95000014', gold: '95000015' },
  wall: { bronze: '95000016', silver: '95000017', gold: '95000018' },
  tireless: { bronze: '95000019', silver: '95000020', gold: '95000021' },
  present: { bronze: '95000022', silver: '95000023', gold: '95000024' },
  donor: { bronze: '95000025', silver: '95000026', gold: '95000027' },
};

export function isSingle(type: CommendationType): type is SingleCommendationType {
  return type in SINGLE_COMMENDATIONS;
}

/** The medals of a commendation, most valuable first: one for a one-off commendation. */
export function medalsOf(type: CommendationType): Commendation[] {
  return isSingle(type) ? [{ type, tier: null }] : COMMENDATION_TIERS.map((tier) => ({ type, tier }));
}

/** Unique id of a commendation (see {@link COMMENDATION_IDS}). */
export function commendationId(c: Commendation): string {
  const id = isSingle(c.type) ? (c.tier ? undefined : SINGLE_COMMENDATIONS[c.type].id) : c.tier ? COMMENDATION_IDS[c.type][c.tier] : undefined;
  if (!id) throw new Error(`No catalogue id for ${commendationName(c)}`);
  return id;
}

/**
 * Name of a medal, also the name of its image: `<type>-<tier>` (e.g. `capitalRaider-gold`), the
 * type alone for a one-off commendation (`chiefHunter`).
 */
export function commendationName(c: Commendation): string {
  return c.tier ? `${c.type}-${c.tier}` : c.type;
}

/** The commendation of a catalogue id, `null` if unknown. */
export function commendationOf(id: string): Commendation | null {
  for (const type of COMMENDATION_TYPES) {
    for (const medal of medalsOf(type)) if (commendationId(medal) === id) return medal;
  }
  return null;
}

export function tierFor(type: GradedCommendationType, value: number): CommendationTier | null {
  const thresholds = COMMENDATION_THRESHOLDS[type];
  const reached = (tier: CommendationTier) => {
    const threshold = thresholds[tier];
    return LOWER_IS_BETTER.has(type)
      ? value <= threshold
      : STRICTLY_ABOVE.has(type)
        ? value > threshold
        : value >= threshold;
  };
  return COMMENDATION_TIERS.find(reached) ?? null;
}

type Awards = Map<string, Commendation[]>;

function give(awards: Awards, tag: string, type: GradedCommendationType, value: number): void {
  const tier = tierFor(type, value);
  if (tier) awards.set(tag, [...(awards.get(tag) ?? []), { type, tier }]);
}

function giveSingle(awards: Awards, tag: string, type: SingleCommendationType): void {
  awards.set(tag, [...(awards.get(tag) ?? []), { type, tier: null }]);
}

/** War commendations of a completed month. */
export function awardMonthCommendations(period: HistoryPeriod): Awards {
  const awards: Awards = new Map();

  const podium = period.players
    .filter((p) => p.wars >= MIN_WARS && p.stars > 0)
    .sort(compareForRanking)
    .slice(0, COMMENDATION_THRESHOLDS.champion.bronze);
  podium.forEach((p, i) => give(awards, p.tag, 'champion', i + 1));

  for (const p of period.players) {
    if (p.attacksUsed >= PERFECT_MIN_ATTACKS) give(awards, p.tag, 'perfect', starsPerAttack(p));
    if (p.attacksMissed === 0) give(awards, p.tag, 'tireless', p.wars);
    if (p.wars >= MIN_WARS && p.opponentAttacks >= MIN_WARS) give(awards, p.tag, 'wall', p.averageStarsConceded);
  }

  const warsWithAttacks = new Map<string, number>();
  const giantKills = new Map<string, number>();
  for (const war of period.wars) {
    for (const p of war.players) {
      if (p.attacks.length > 0) warsWithAttacks.set(p.tag, (warsWithAttacks.get(p.tag) ?? 0) + 1);
      const kills = p.attacks.filter(
        (a) => a.stars === 3 && a.defenderTownHall !== null && a.defenderTownHall > p.townHall,
      ).length;
      if (kills) giantKills.set(p.tag, (giantKills.get(p.tag) ?? 0) + kills);
    }
  }
  if (period.wars.length >= MIN_WARS) {
    for (const [tag, count] of warsWithAttacks) give(awards, tag, 'present', (count / period.wars.length) * 100);
  }
  for (const [tag, kills] of giantKills) give(awards, tag, 'giantSlayer', kills);
  return awards;
}

/**
 * The kinds awarded by each ended war ({@link awardWarCommendations}). A war period remembers the
 * kinds it was checked for: a kind added later is checked on the wars already closed too.
 */
export const WAR_COMMENDATION_TYPES: readonly SingleCommendationType[] = ['chiefHunter', 'fortress', 'perfectWar'];

/** Map position of the enemy number 1, the top of the war map (`chiefHunter`). */
export const CHIEF_POSITION = 1;

/**
 * One-off commendations of an ended war, one of each per player:
 * - `chiefHunter`: three stars on the enemy number 1 ({@link CHIEF_POSITION}). The clan's attacks are
 *   replayed in order: the first three-star on it always earns the medal; a later one only when the
 *   clan already had every star of the war (`teamSize × 3`) before it, so a repeat hit counts once
 *   nothing else was left to take, never when it wasted an attack;
 * - `fortress`: attacked at least twice and never three-starred;
 * - `perfectWar`: in a war won with every star, the players who three-starred with every attack they made.
 */
export function awardWarCommendations(war: HistoryWar): Awards {
  const awards: Awards = new Map();
  const has = (tag: string, type: SingleCommendationType) => awards.get(tag)?.some((c) => c.type === type) ?? false;

  const attacks = war.players
    .flatMap((p) => p.attacks.map((a) => ({ ...a, tag: p.tag })))
    .sort((a, b) => a.order - b.order);
  const best = new Map<number, number>();
  let stars = 0;
  for (const a of attacks) {
    if (a.defenderPosition === null) continue;
    const before = best.get(a.defenderPosition) ?? 0;
    const chief = a.defenderPosition === CHIEF_POSITION && a.stars === 3;
    if (chief && (before < 3 || stars >= war.teamSize * 3) && !has(a.tag, 'chiefHunter')) giveSingle(awards, a.tag, 'chiefHunter');
    if (a.stars > before) {
      stars += a.stars - before;
      best.set(a.defenderPosition, a.stars);
    }
  }

  const perfect = war.result === 'victory' && war.stars >= war.teamSize * 3;
  for (const p of war.players) {
    if (p.opponentAttacks >= SINGLE_COMMENDATIONS.fortress.threshold && p.starsConceded < 3) giveSingle(awards, p.tag, 'fortress');
    const flawless = p.attacks.length >= SINGLE_COMMENDATIONS.perfectWar.threshold && p.attacks.every((a) => a.stars === 3);
    if (perfect && flawless) giveSingle(awards, p.tag, 'perfectWar');
  }
  return awards;
}

/** `legendTop` of an ended Legend League season, from the members' final world positions. */
export function awardLegendCommendations(results: { tag: string; rank: number }[]): Awards {
  const awards: Awards = new Map();
  for (const r of results) if (r.rank <= SINGLE_COMMENDATIONS.legendTop.threshold) giveSingle(awards, r.tag, 'legendTop');
  return awards;
}

/** `capitalRaider` of an ended Raid Weekend, from the saved members. */
export function awardRaidCommendations(members: { tag: string; capitalResourcesLooted: number }[]): Awards {
  const awards: Awards = new Map();
  for (const m of members) give(awards, m.tag, 'capitalRaider', m.capitalResourcesLooted);
  return awards;
}

/** `donor` of an ended game season, from the troops donated as counted by the backend. */
export function awardDonationCommendations(players: { tag: string; donations: number }[]): Awards {
  const awards: Awards = new Map();
  for (const p of players) give(awards, p.tag, 'donor', p.donations);
  return awards;
}

/** Attacks and stars of a player over the clan's wars of a CWL season. */
export interface CwlPlayerResult {
  tag: string;
  name: string;
  /** Wars (days) in the line-up: one attack each. */
  wars: number;
  attacks: number;
  stars: number;
}

/**
 * Commendations of an ended CWL season: `cwlStriker` on the exact average stars per attack,
 * `cwlAllAttacks` to who used the attack of every day in the line-up (at least 3 days).
 */
export function awardCwlCommendations(players: CwlPlayerResult[]): Awards {
  const awards: Awards = new Map();
  for (const p of players) {
    if (p.attacks >= p.wars && p.wars >= SINGLE_COMMENDATIONS.cwlAllAttacks.threshold) giveSingle(awards, p.tag, 'cwlAllAttacks');
    if (p.attacks >= CWL_MIN_ATTACKS) give(awards, p.tag, 'cwlStriker', p.stars / p.attacks);
  }
  return awards;
}

function starsPerAttack(p: HistoryPlayerStats): number {
  return p.attacksUsed ? p.stars / p.attacksUsed : 0;
}
