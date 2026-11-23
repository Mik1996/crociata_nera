import {
  Commendation,
  CommendationEmblem,
  CommendationTier,
  CommendationType,
  CwlSeason,
  DonationSeason,
  GradedCommendationType,
  HistoryPeriod,
  HistoryPlayerStats,
  HistoryWar,
  LatestLegendSeason,
  MedalStyle,
  RaidSeason,
  SingleCommendationType,
} from '../models';
import { compareForRanking, monthOf } from './monthly-history';

/** Display order of the types, from the most prestigious. */
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

/**
 * Requirement of each tier of the graded commendations (also shown in the descriptions as `{{n}}`):
 * - champion: position in the monthly ranking (players with at least {@link MIN_WARS} wars);
 * - perfect: average stars per attack, with at least {@link PERFECT_MIN_ATTACKS} attacks;
 * - giantSlayer: 3-star attacks against a higher Town Hall;
 * - wall: maximum average stars conceded per war on defence (at least {@link MIN_WARS} wars and attacks received);
 * - tireless: wars played without missing any attack;
 * - present: share (%) of the clan's wars of the month with at least one attack (months with at least {@link MIN_WARS} wars);
 * - cwlStriker: average stars per attack in the last ended Clan War League (at least {@link CWL_MIN_ATTACKS} attacks);
 * - capitalRaider: Capital Gold looted in the last ended Raid Weekend (more than the threshold);
 * - donor: troops donated in the game season, as counted by the backend; awarded as soon as a
 *   tier is reached (one per season, raised to the higher tiers).
 */
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
 * The one-off commendations: a single medal with its own colour, no tiers. `threshold` is shown in
 * the description as `{{n}}`:
 * - cwlAllAttacks: the attack of every day in the line-up of the last ended Clan War League, with at
 *   least this many days;
 * - chiefHunter: three stars on the enemy number 1 in an ended war, see {@link awardWarCommendations};
 * - fortress: in an ended war, attacked at least this many times and never three-starred;
 * - perfectWar: at least this many attacks, all three-star, in a war won with every star;
 * - legendTop: a Legend League season ended within this world position (saved by the backend only:
 *   the frontend has no Legend League results, so it never awards it itself).
 */
export const SINGLE_COMMENDATIONS: Readonly<Record<SingleCommendationType, { threshold: number; style: MedalStyle }>> = {
  cwlAllAttacks: { threshold: 3, style: 'crimson' },
  chiefHunter: { threshold: 1, style: 'sapphire' },
  fortress: { threshold: 2, style: 'emerald' },
  perfectWar: { threshold: 1, style: 'pearl' },
  legendTop: { threshold: 10_000, style: 'obsidian' },
};

/** `cwlStriker` needs at least this many attacks (one per war). */
export const CWL_MIN_ATTACKS = 3;

/** Minimum wars played in the month for the commendations based on averages. */
export const MIN_WARS = 3;
/** "Perfect" needs at least this many attacks (no lucky single hit). */
export const PERFECT_MIN_ATTACKS = 4;

/** Is a higher value better for this type? (ranking position and stars conceded: lower is better) */
const LOWER_IS_BETTER: ReadonlySet<CommendationType> = new Set(['champion', 'wall']);
/** The value must exceed the threshold ("more than"), not just reach it. */
const STRICTLY_ABOVE: ReadonlySet<CommendationType> = new Set(['capitalRaider']);

export function isSingle(type: CommendationType): type is SingleCommendationType {
  return type in SINGLE_COMMENDATIONS;
}

/** The medals of a commendation, most valuable first: one for a one-off commendation. */
export function medalsOf(type: CommendationType): Commendation[] {
  return isSingle(type) ? [{ type, tier: null }] : COMMENDATION_TIERS.map((tier) => ({ type, tier }));
}

/** Requirement of a medal (`{{n}}` of its description). */
export function thresholdOf(c: Commendation): number | undefined {
  if (isSingle(c.type)) return SINGLE_COMMENDATIONS[c.type].threshold;
  return c.tier ? COMMENDATION_THRESHOLDS[c.type][c.tier] : undefined;
}

/** Look of a medal: the metal of its tier, or the colour of a one-off commendation. */
export function styleOf(c: Commendation): MedalStyle {
  return isSingle(c.type) ? SINGLE_COMMENDATIONS[c.type].style : (c.tier ?? 'gold');
}

/** Translation key of the name of a medal. */
export function nameKeyOf(c: { type: string; tier: string | null }): string {
  return `commendations.${c.type}.${c.tier ?? 'name'}`;
}

/** Highest tier reached by a value; `null` when not even the lowest one. */
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

/** Most valuable first: one-off medals, then gold before silver before bronze, then by type. */
export function compareCommendations(a: Commendation, b: Commendation): number {
  const rank = (c: Commendation) => (c.tier ? 1 + COMMENDATION_TIERS.indexOf(c.tier) : 0);
  return rank(a) - rank(b) || COMMENDATION_TYPES.indexOf(a.type) - COMMENDATION_TYPES.indexOf(b.type);
}

export function emblemOf(c: Commendation): CommendationEmblem {
  return (c.tier ? `${c.type}-${c.tier}` : c.type) as CommendationEmblem;
}

/**
 * Assigns the monthly commendations to every player of a period (a month of the history),
 * already sorted with {@link compareCommendations}. Players without commendations are not in the map.
 */
export function awardCommendations(period: HistoryPeriod): Map<string, Commendation[]> {
  const awards = new Map<string, Commendation[]>();
  const give = (tag: string, type: GradedCommendationType, value: number) => {
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
export function awardWarCommendations(war: HistoryWar): Map<string, Commendation[]> {
  const awards = new Map<string, Commendation[]>();
  const give = (tag: string, type: SingleCommendationType) => {
    const items = awards.get(tag) ?? [];
    if (!items.some((c) => c.type === type)) awards.set(tag, [...items, { type, tier: null }]);
  };

  const attacks = war.players
    .flatMap((p) => p.attacks.map((a) => ({ ...a, tag: p.tag })))
    .sort((a, b) => a.order - b.order);
  const best = new Map<number, number>();
  let stars = 0;
  for (const a of attacks) {
    if (a.defenderPosition === null) continue;
    const before = best.get(a.defenderPosition) ?? 0;
    const chief = a.defenderPosition === CHIEF_POSITION && a.stars === 3;
    if (chief && (before < 3 || stars >= war.teamSize * 3)) give(a.tag, 'chiefHunter');
    if (a.stars > before) {
      stars += a.stars - before;
      best.set(a.defenderPosition, a.stars);
    }
  }

  const perfect = war.result === 'victory' && war.stars >= war.teamSize * 3;
  for (const p of war.players) {
    if (p.opponentAttacks >= SINGLE_COMMENDATIONS.fortress.threshold && p.starsConceded < 3) give(p.tag, 'fortress');
    const flawless = p.attacks.length >= SINGLE_COMMENDATIONS.perfectWar.threshold && p.attacks.every((a) => a.stars === 3);
    if (perfect && flawless) give(p.tag, 'perfectWar');
  }
  return awards;
}

/** The one-off commendations of some months of wars, with the month each one was last earned in. */
export interface RecentWarCommendations {
  /** Per player, each kind once. */
  awards: Map<string, Commendation[]>;
  /** Per player, the month (`YYYY-MM`) of the last war that earned each kind. */
  months: Map<string, Partial<Record<CommendationType, string>>>;
}

/**
 * The one-off commendations of the wars of some months (the last completed one and the one in
 * progress), once per player and kind, with the most recent month each one was earned in
 * ({@link awardWarCommendations} counts every war). Months missing (`null`) are skipped.
 */
export function recentWarCommendations(periods: readonly (HistoryPeriod | null)[]): RecentWarCommendations {
  const awards = new Map<string, Commendation[]>();
  const months = new Map<string, Partial<Record<CommendationType, string>>>();
  const ordered = periods.filter((p): p is HistoryPeriod => p !== null).sort((a, b) => a.period.localeCompare(b.period));
  for (const period of ordered) {
    for (const war of period.wars) {
      for (const [tag, items] of awardWarCommendations(war)) {
        const known = awards.get(tag) ?? [];
        awards.set(tag, [...known, ...items.filter((c) => !known.some((k) => k.type === c.type))]);
        const earned = months.get(tag) ?? {};
        for (const c of items) earned[c.type] = period.period;
        months.set(tag, earned);
      }
    }
  }
  return { awards, months };
}

/** `legendTop` of the last Legend League season: its members among the first 10,000 of the world. */
export function awardLegendCommendations(season: LatestLegendSeason): Map<string, Commendation[]> {
  const awards = new Map<string, Commendation[]>();
  for (const r of season.results) {
    if (r.rank <= SINGLE_COMMENDATIONS.legendTop.threshold) awards.set(r.tag, [{ type: 'legendTop', tier: null }]);
  }
  return awards;
}

/** Commendations of a Raid Weekend (`capitalRaider`), by Capital Gold looted. */
export function awardRaidCommendations(season: RaidSeason): Map<string, Commendation[]> {
  const awards = new Map<string, Commendation[]>();
  for (const m of season.members) {
    const tier = tierFor('capitalRaider', m.looted);
    if (tier) awards.set(m.tag, [{ type: 'capitalRaider', tier }]);
  }
  return awards;
}

/**
 * Commendations of a Clan War League season: `cwlAllAttacks` to who used the attack of every day
 * in the line-up (at least 3 days), `cwlStriker` by exact average stars per attack.
 */
export function awardCwlCommendations(season: CwlSeason): Map<string, Commendation[]> {
  const awards = new Map<string, Commendation[]>();
  for (const p of season.players) {
    const items: Commendation[] = [];
    if (p.attacks >= p.wars && p.wars >= SINGLE_COMMENDATIONS.cwlAllAttacks.threshold) {
      items.push({ type: 'cwlAllAttacks', tier: null });
    }
    const striker = p.attacks >= CWL_MIN_ATTACKS ? tierFor('cwlStriker', p.stars / p.attacks) : null;
    if (striker) items.push({ type: 'cwlStriker', tier: striker });
    if (items.length) awards.set(p.tag, items);
  }
  return awards;
}

/** Commendations of a game season (`donor`), by troops donated. */
export function awardDonationCommendations(season: DonationSeason): Map<string, Commendation[]> {
  const awards = new Map<string, Commendation[]>();
  for (const p of season.players) {
    const tier = tierFor('donor', p.donations);
    if (tier) awards.set(p.tag, [{ type: 'donor', tier }]);
  }
  return awards;
}

/** Merges commendation maps (one per kind of period), each list sorted most valuable first. */
export function mergeCommendations(...maps: Map<string, Commendation[]>[]): Map<string, Commendation[]> {
  const merged = new Map<string, Commendation[]>();
  for (const map of maps) {
    for (const [tag, items] of map) merged.set(tag, [...(merged.get(tag) ?? []), ...items]);
  }
  for (const list of merged.values()) list.sort(compareCommendations);
  return merged;
}

/** How many times each player earned each medal ({@link emblemOf}), over several periods. */
export type CommendationCounts = Map<string, Map<CommendationEmblem, number>>;

/** Sums the commendations of several periods (each map: commendations per player tag). */
export function countCommendations(periods: Map<string, Commendation[]>[]): CommendationCounts {
  const counts: CommendationCounts = new Map();
  for (const period of periods) {
    for (const [tag, items] of period) {
      const player = counts.get(tag) ?? new Map<CommendationEmblem, number>();
      for (const item of items) player.set(emblemOf(item), (player.get(emblemOf(item)) ?? 0) + 1);
      counts.set(tag, player);
    }
  }
  return counts;
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
