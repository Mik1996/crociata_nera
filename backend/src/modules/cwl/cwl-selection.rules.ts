import { CommendationTier } from '@/modules/commendations/commendation-rules';

/**
 * Ranking used to pick the Clan War League line-up: the best {@link STARTERS} eligible players and
 * {@link RESERVES} reserves. Pure functions: the service (`cwl-selection.service.ts`) reads the data.
 *
 * Score out of 100 (see {@link POINTS}), minus the penalties, never below 0:
 * - CWL commendations: `cwlAllAttacks` (Certezza di Lega) and the tier of `cwlStriker`
 *   (Guerriero / Campione / Leggenda di Lega) of the last {@link CWL_SEASONS} seasons;
 * - CWL performance: stars per attack and destruction in the league wars of those seasons;
 * - regular wars: stars per attack, destruction and attacks used in the last {@link WAR_WINDOW_DAYS} days;
 * - heroes: hero levels and equipped hero equipment against the highest levels of the game;
 * - town hall: a bonus for the highest town hall of the clan;
 * - penalties: CWL attacks missed, new arrivals, no regular war attacks lately.
 * In every season-based part the most recent season weighs most ({@link SEASON_WEIGHTS}).
 *
 * Eligible: town hall at most {@link TOWN_HALL_GAP} below the highest of the clan, and not
 * excluded by an administrator. Excluded players keep their place in the ranking but take no slot.
 */

export const STARTERS = 15;
export const RESERVES = 3;
/** Town hall levels below the highest of the clan that are still eligible. */
export const TOWN_HALL_GAP = 1;

/** Most points of each part of the score (they add up to 100). */
export const POINTS = {
  cwlCommendations: 30,
  cwlPerformance: 20,
  war: 25,
  heroes: 15,
  townHall: 10,
} as const;

/** CWL seasons considered, most recent first, and their weights. */
export const SEASON_WEIGHTS: readonly number[] = [1, 0.75, 0.5, 0.25];
export const CWL_SEASONS = SEASON_WEIGHTS.length;

/** Points of each CWL commendation in one season. */
export const COMMENDATION_POINTS = {
  cwlAllAttacks: 5,
  cwlStriker: { bronze: 3, silver: 5, gold: 7 } as Readonly<Partial<Record<CommendationTier, number>>>,
} as const;
/** Most points in one season: every attack done and the gold tier. */
const SEASON_MAX = COMMENDATION_POINTS.cwlAllAttacks + 7;

/** CWL attacks needed for the CWL performance to count in full. */
export const CWL_FULL_CONFIDENCE_ATTACKS = 5;

export const WAR_WINDOW_DAYS = 90;
/** Attacks needed for the war score to count in full. */
export const WAR_FULL_CONFIDENCE_ATTACKS = 8;
/** Shares of the war score: quality of the attacks and attacks used. */
const WAR_QUALITY_SHARE = 0.75;
/** Shares of the quality of an attack: stars and destruction. */
const STARS_SHARE = 0.8;

/** Shares of the heroes score: hero levels and equipped equipment. */
const HERO_LEVELS_SHARE = 2 / 3;

/** Points lost for each CWL attack missed (weighted by season), and the most lost this way. */
export const MISSED_ATTACK_PENALTY = 3;
export const MISSED_ATTACKS_MAX_PENALTY = 15;
/** New arrival: in the clan for fewer days than this. */
export const NEWCOMER_DAYS = 14;
export const NEWCOMER_PENALTY = 5;
/** No regular war attack in the last days although the clan fought at least this many wars. */
export const INACTIVE_DAYS = 30;
export const INACTIVE_MIN_CLAN_WARS = 2;
export const INACTIVE_PENALTY = 10;

export type SelectionStatus = 'starter' | 'reserve' | 'bench' | 'ineligible' | 'excluded';

export interface WarTotals {
  wars: number;
  attacksUsed: number;
  attacksAvailable: number;
  stars: number;
  totalDestruction: number;
}

/** League wars of one season: days in the line-up, attacks done, stars and destruction. */
export interface CwlSeasonTotals {
  wars: number;
  attacks: number;
  stars: number;
  totalDestruction: number;
}

export interface Level {
  name: string;
  level: number;
  maxLevel: number;
}

export interface Exclusion {
  reason: string | null;
  excludedBy: string;
  excludedAt: string;
}

export interface SelectionCandidate {
  tag: string;
  name: string;
  role: string | null;
  townHallLevel: number | null;
  /** Regular wars of the window. */
  war: WarTotals;
  /** Regular war attacks in the last {@link INACTIVE_DAYS} days. */
  recentAttacks: number;
  /** CWL commendations per season, index 0 the most recent of {@link SEASON_WEIGHTS}. */
  cwl: { allAttacks: boolean; striker: CommendationTier | null }[];
  /** League wars per season, same order as `cwl`. */
  cwlWars: CwlSeasonTotals[];
  /** Home village heroes and the equipment they wear; `null` while the profile was never read. */
  heroes: Level[] | null;
  equipment: Level[] | null;
  /** When the player (last) joined the clan; `null` when unknown. */
  joinedAt: Date | null;
  exclusion: Exclusion | null;
}

/** What the clan looks like, for the parts that compare players. */
export interface SelectionContext {
  now: Date;
  /** Regular wars of the clan ended in the last {@link INACTIVE_DAYS} days. */
  recentClanWars: number;
  /** Highest level of each home village hero (from the game), for the heroes nobody has yet too. */
  heroMaxLevels: Map<string, number>;
}

export interface ScoreBreakdown {
  cwlCommendations: number;
  cwlPerformance: number;
  war: number;
  heroes: number;
  townHall: number;
  /** Negative or 0. */
  missedAttacks: number;
  /** Negative or 0. */
  activity: number;
}

export interface SelectionRow {
  rank: number;
  tag: string;
  name: string;
  role: string | null;
  townHallLevel: number | null;
  eligible: boolean;
  status: SelectionStatus;
  score: number;
  breakdown: ScoreBreakdown;
  war: {
    wars: number;
    attacksUsed: number;
    attacksAvailable: number;
    averageStarsPerAttack: number;
    averageDestruction: number;
  };
  cwl: {
    allAttacks: number;
    gold: number;
    silver: number;
    bronze: number;
    wars: number;
    attacks: number;
    missed: number;
    averageStarsPerAttack: number;
    averageDestruction: number;
  };
  /** Percentages of the highest levels; `null` while the profile was never read. */
  heroes: { levels: number; equipment: number } | null;
  activity: { joinedAt: string | null; newcomer: boolean; inactive: boolean; recentAttacks: number };
  exclusion: Exclusion | null;
}

const DAY_MS = 86_400_000;
const round = (value: number, decimals = 1) => Math.round(value * 10 ** decimals) / 10 ** decimals;
const weightOf = (season: number) => SEASON_WEIGHTS[season] ?? 0;
const WEIGHT_TOTAL = SEASON_WEIGHTS.reduce((sum, w) => sum + w, 0);

/** Quality of attacks, 0–1: stars per attack and destruction. */
function attackQuality(stars: number, totalDestruction: number, attacks: number): number {
  if (!attacks) return 0;
  return STARS_SHARE * (stars / attacks / 3) + (1 - STARS_SHARE) * (totalDestruction / attacks / 100);
}

/** CWL commendations, 0–{@link POINTS}.cwlCommendations. */
export function cwlCommendationScore(seasons: SelectionCandidate['cwl']): number {
  const points = seasons.slice(0, CWL_SEASONS).reduce((sum, season, i) => {
    const striker = season.striker ? (COMMENDATION_POINTS.cwlStriker[season.striker] ?? 0) : 0;
    return sum + weightOf(i) * ((season.allAttacks ? COMMENDATION_POINTS.cwlAllAttacks : 0) + striker);
  }, 0);
  return (POINTS.cwlCommendations * points) / (WEIGHT_TOTAL * SEASON_MAX);
}

/**
 * CWL performance, 0–{@link POINTS}.cwlPerformance: quality of the league attacks, each season
 * weighed by {@link SEASON_WEIGHTS}, scaled down below {@link CWL_FULL_CONFIDENCE_ATTACKS} attacks.
 */
export function cwlPerformanceScore(seasons: CwlSeasonTotals[]): number {
  let weighted = 0;
  let weights = 0;
  let attacks = 0;
  seasons.slice(0, CWL_SEASONS).forEach((s, i) => {
    if (!s.attacks) return;
    weighted += weightOf(i) * s.attacks * attackQuality(s.stars, s.totalDestruction, s.attacks);
    weights += weightOf(i) * s.attacks;
    attacks += s.attacks;
  });
  if (!weights) return 0;
  return POINTS.cwlPerformance * (weighted / weights) * Math.min(1, attacks / CWL_FULL_CONFIDENCE_ATTACKS);
}

/** Penalty (≤ 0) for the CWL attacks missed, weighted by season. */
export function missedAttacksPenalty(seasons: CwlSeasonTotals[]): number {
  const missed = seasons
    .slice(0, CWL_SEASONS)
    .reduce((sum, s, i) => sum + weightOf(i) * Math.max(0, s.wars - s.attacks), 0);
  return -Math.min(MISSED_ATTACKS_MAX_PENALTY, missed * MISSED_ATTACK_PENALTY);
}

/** Regular wars, 0–{@link POINTS}.war. */
export function warScore(war: WarTotals): number {
  if (!war.attacksUsed || !war.attacksAvailable) return 0;
  const quality = attackQuality(war.stars, war.totalDestruction, war.attacksUsed);
  const participation = Math.min(1, war.attacksUsed / war.attacksAvailable);
  const confidence = Math.min(1, war.attacksUsed / WAR_FULL_CONFIDENCE_ATTACKS);
  return POINTS.war * (WAR_QUALITY_SHARE * quality + (1 - WAR_QUALITY_SHARE) * participation) * confidence;
}

/**
 * Hero levels against the highest of the game (heroes not unlocked count 0), and equipped
 * equipment against its highest level. `null` when the profile was never read.
 */
export function heroRatios(
  heroes: Level[] | null,
  equipment: Level[] | null,
  heroMaxLevels: Map<string, number>,
): { levels: number; equipment: number } | null {
  if (!heroes) return null;
  const maxTotal = [...heroMaxLevels.values()].reduce((sum, max) => sum + max, 0);
  const levels = heroes.reduce((sum, h) => sum + Math.min(h.level, heroMaxLevels.get(h.name) ?? h.maxLevel), 0);
  const items = (equipment ?? []).filter((e) => e.maxLevel > 0);
  return {
    levels: maxTotal ? Math.min(1, levels / maxTotal) : 0,
    equipment: items.length ? items.reduce((sum, e) => sum + Math.min(1, e.level / e.maxLevel), 0) / items.length : 0,
  };
}

/** Heroes, 0–{@link POINTS}.heroes. */
export function heroScore(ratios: { levels: number; equipment: number } | null): number {
  if (!ratios) return 0;
  return POINTS.heroes * (HERO_LEVELS_SHARE * ratios.levels + (1 - HERO_LEVELS_SHARE) * ratios.equipment);
}

/** Activity of a player: new arrival, no regular war attack lately. */
export function activityOf(c: SelectionCandidate, context: SelectionContext): { newcomer: boolean; inactive: boolean } {
  const newcomer = !!c.joinedAt && context.now.getTime() - c.joinedAt.getTime() < NEWCOMER_DAYS * DAY_MS;
  const inactive = context.recentClanWars >= INACTIVE_MIN_CLAN_WARS && c.recentAttacks === 0;
  return { newcomer, inactive };
}

/** The parts of the score of a candidate. */
export function scoreBreakdown(
  c: SelectionCandidate,
  context: SelectionContext,
  maxTownHall: number | null,
): ScoreBreakdown {
  const activity = activityOf(c, context);
  return {
    cwlCommendations: cwlCommendationScore(c.cwl),
    cwlPerformance: cwlPerformanceScore(c.cwlWars),
    war: warScore(c.war),
    heroes: heroScore(heroRatios(c.heroes, c.equipment, context.heroMaxLevels)),
    townHall: maxTownHall !== null && c.townHallLevel === maxTownHall ? POINTS.townHall : 0,
    missedAttacks: missedAttacksPenalty(c.cwlWars),
    activity: -((activity.newcomer ? NEWCOMER_PENALTY : 0) + (activity.inactive ? INACTIVE_PENALTY : 0)),
  };
}

/**
 * Ranks the candidates: players with an eligible town hall first, by score, then town hall, then
 * name; the first {@link STARTERS} not excluded are starters, the next {@link RESERVES} reserves.
 */
export function rankCandidates(
  candidates: SelectionCandidate[],
  context: SelectionContext,
): { maxTownHall: number | null; rows: SelectionRow[] } {
  const levels = candidates.map((c) => c.townHallLevel).filter((l): l is number => l !== null);
  const maxTownHall = levels.length ? Math.max(...levels) : null;
  const scored = candidates.map((c) => {
    const breakdown = scoreBreakdown(c, context, maxTownHall);
    const total = Object.values(breakdown).reduce((sum, part) => sum + part, 0);
    return {
      candidate: c,
      townHallOk: maxTownHall !== null && c.townHallLevel !== null && c.townHallLevel >= maxTownHall - TOWN_HALL_GAP,
      breakdown,
      score: Math.max(0, Math.min(100, total)),
    };
  });
  scored.sort(
    (a, b) =>
      Number(b.townHallOk) - Number(a.townHallOk) ||
      b.score - a.score ||
      (b.candidate.townHallLevel ?? 0) - (a.candidate.townHallLevel ?? 0) ||
      a.candidate.name.localeCompare(b.candidate.name),
  );
  let slotsTaken = 0;
  const rows = scored.map(({ candidate: c, townHallOk, breakdown, score }, index): SelectionRow => {
    let status: SelectionStatus;
    if (c.exclusion) status = 'excluded';
    else if (!townHallOk) status = 'ineligible';
    else {
      slotsTaken += 1;
      status = slotsTaken <= STARTERS ? 'starter' : slotsTaken <= STARTERS + RESERVES ? 'reserve' : 'bench';
    }
    const seasons = c.cwl.slice(0, CWL_SEASONS);
    const cwlWars = c.cwlWars.slice(0, CWL_SEASONS);
    const cwlTotals = cwlWars.reduce(
      (t, s) => ({
        wars: t.wars + s.wars,
        attacks: t.attacks + s.attacks,
        stars: t.stars + s.stars,
        totalDestruction: t.totalDestruction + s.totalDestruction,
      }),
      { wars: 0, attacks: 0, stars: 0, totalDestruction: 0 },
    );
    const ratios = heroRatios(c.heroes, c.equipment, context.heroMaxLevels);
    const activity = activityOf(c, context);
    return {
      rank: index + 1,
      tag: c.tag,
      name: c.name,
      role: c.role,
      townHallLevel: c.townHallLevel,
      eligible: townHallOk && !c.exclusion,
      status,
      score: round(score),
      breakdown: {
        cwlCommendations: round(breakdown.cwlCommendations),
        cwlPerformance: round(breakdown.cwlPerformance),
        war: round(breakdown.war),
        heroes: round(breakdown.heroes),
        townHall: round(breakdown.townHall),
        missedAttacks: round(breakdown.missedAttacks),
        activity: round(breakdown.activity),
      },
      war: {
        wars: c.war.wars,
        attacksUsed: c.war.attacksUsed,
        attacksAvailable: c.war.attacksAvailable,
        averageStarsPerAttack: c.war.attacksUsed ? round(c.war.stars / c.war.attacksUsed, 2) : 0,
        averageDestruction: c.war.attacksUsed ? round(c.war.totalDestruction / c.war.attacksUsed) : 0,
      },
      cwl: {
        allAttacks: seasons.filter((s) => s.allAttacks).length,
        gold: seasons.filter((s) => s.striker === 'gold').length,
        silver: seasons.filter((s) => s.striker === 'silver').length,
        bronze: seasons.filter((s) => s.striker === 'bronze').length,
        wars: cwlTotals.wars,
        attacks: cwlTotals.attacks,
        missed: Math.max(0, cwlTotals.wars - cwlTotals.attacks),
        averageStarsPerAttack: cwlTotals.attacks ? round(cwlTotals.stars / cwlTotals.attacks, 2) : 0,
        averageDestruction: cwlTotals.attacks ? round(cwlTotals.totalDestruction / cwlTotals.attacks) : 0,
      },
      heroes: ratios ? { levels: round(ratios.levels * 100), equipment: round(ratios.equipment * 100) } : null,
      activity: {
        joinedAt: c.joinedAt?.toISOString() ?? null,
        newcomer: activity.newcomer,
        inactive: activity.inactive,
        recentAttacks: c.recentAttacks,
      },
      exclusion: c.exclusion,
    };
  });
  return { maxTownHall, rows };
}
