import {
  Commendation,
  CommendationEmblem,
  CommendationTier,
  CommendationType,
  HistoryPeriod,
  HistoryPlayerStats,
} from '../models';
import { compareForRanking, monthOf } from './monthly-history';

/** Display order of the types, from the most prestigious. */
export const COMMENDATION_TYPES: readonly CommendationType[] = [
  'champion',
  'perfect',
  'giantSlayer',
  'wall',
  'tireless',
  'present',
];

/** From the most valuable. */
export const COMMENDATION_TIERS: readonly CommendationTier[] = ['gold', 'silver', 'bronze'];

/**
 * Requirement of each tier (also shown in the descriptions as `{{n}}`):
 * - champion: position in the monthly ranking (players with at least {@link MIN_WARS} wars);
 * - perfect: average stars per attack, with at least {@link PERFECT_MIN_ATTACKS} attacks;
 * - giantSlayer: 3-star attacks against a higher Town Hall;
 * - wall: maximum average stars conceded per war on defence (at least {@link MIN_WARS} wars and attacks received);
 * - tireless: wars played without missing any attack;
 * - present: share (%) of the clan's wars of the month with at least one attack (months with at least {@link MIN_WARS} wars).
 */
export const COMMENDATION_THRESHOLDS: Readonly<Record<CommendationType, Readonly<Record<CommendationTier, number>>>> = {
  champion: { bronze: 3, silver: 2, gold: 1 },
  perfect: { bronze: 2.5, silver: 2.8, gold: 3 },
  giantSlayer: { bronze: 2, silver: 5, gold: 10 },
  wall: { bronze: 2.5, silver: 2, gold: 1.5 },
  tireless: { bronze: 3, silver: 5, gold: 8 },
  present: { bronze: 50, silver: 75, gold: 100 },
};

/** Minimum wars played in the month for the commendations based on averages. */
export const MIN_WARS = 3;
/** "Perfect" needs at least this many attacks (no lucky single hit). */
export const PERFECT_MIN_ATTACKS = 4;

/** Is a higher value better for this type? (ranking position and stars conceded: lower is better) */
const LOWER_IS_BETTER: ReadonlySet<CommendationType> = new Set(['champion', 'wall']);

/** Highest tier reached by a value; `null` when not even bronze. */
export function tierFor(type: CommendationType, value: number): CommendationTier | null {
  const thresholds = COMMENDATION_THRESHOLDS[type];
  const reached = (tier: CommendationTier) =>
    LOWER_IS_BETTER.has(type) ? value <= thresholds[tier] : value >= thresholds[tier];
  return COMMENDATION_TIERS.find(reached) ?? null;
}

/** Most valuable first: gold before silver before bronze, then by type. */
export function compareCommendations(a: Commendation, b: Commendation): number {
  return (
    COMMENDATION_TIERS.indexOf(a.tier) - COMMENDATION_TIERS.indexOf(b.tier) ||
    COMMENDATION_TYPES.indexOf(a.type) - COMMENDATION_TYPES.indexOf(b.type)
  );
}

export function emblemOf(c: Commendation): CommendationEmblem {
  return `${c.type}-${c.tier}`;
}

/**
 * Assigns the monthly commendations to every player of a period (a month of the history),
 * already sorted with {@link compareCommendations}. Players without commendations are not in the map.
 */
export function awardCommendations(period: HistoryPeriod): Map<string, Commendation[]> {
  const awards = new Map<string, Commendation[]>();
  const give = (tag: string, type: CommendationType, value: number) => {
    const tier = tierFor(type, value);
    if (tier) awards.set(tag, [...(awards.get(tag) ?? []), { type, tier }]);
  };

  // Champion: podium of the players with enough wars (and at least one star).
  const podium = period.players
    .filter((p) => p.wars >= MIN_WARS && p.stars > 0)
    .sort(compareForRanking)
    .slice(0, COMMENDATION_THRESHOLDS.champion.bronze);
  podium.forEach((p, i) => give(p.tag, 'champion', i + 1));

  for (const p of period.players) {
    if (p.attacksUsed >= PERFECT_MIN_ATTACKS) give(p.tag, 'perfect', starsPerAttack(p));
    if (p.attacksMissed === 0) give(p.tag, 'tireless', p.wars);
    if (p.wars >= MIN_WARS && p.opponentAttacks >= MIN_WARS) give(p.tag, 'wall', p.averageStarsConceded);
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
    for (const [tag, count] of warsWithAttacks) give(tag, 'present', (count / period.wars.length) * 100);
  }
  for (const [tag, kills] of giantKills) give(tag, 'giantSlayer', kills);

  for (const list of awards.values()) list.sort(compareCommendations);
  return awards;
}

/** Exact average (the rounded `averageStarsPerAttack` would turn 2.996 into 3). */
function starsPerAttack(p: HistoryPlayerStats): number {
  return p.attacksUsed ? p.stars / p.attacksUsed : 0;
}

/** Last completed month (`YYYY-MM`, Italian time zone): the one commendations refer to. */
export function previousMonth(now = new Date()): string {
  const [year, month] = monthOf(now.toISOString()).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
