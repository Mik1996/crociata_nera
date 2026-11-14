import { CommendationTier } from '@/modules/commendations/commendation-rules';

/**
 * Ranking used to pick the Clan War League line-up: the best {@link STARTERS} eligible players and
 * {@link RESERVES} reserves. Pure functions: the service (`cwl-selection.service.ts`) reads the data.
 *
 * Score out of 100 (see {@link POINTS}), minus the penalties, never below 0:
 * - last CWL (in any clan of the Crusade): its commendations, `cwlAllAttacks` (Certezza di Lega) and
 *   the tier of `cwlStriker` (Guerriero / Campione / Leggenda di Lega), and the stars per attack and
 *   destruction of its league attacks;
 * - regular wars of the last {@link WAR_WINDOW_DAYS} days (in any clan of the Crusade): stars per
 *   attack, destruction and attacks used. Who was not in the last CWL gets the CWL points here
 *   instead ({@link warPointsFor}), so can still reach 100;
 * - heroes: hero levels and equipped hero equipment against the highest levels of the game;
 * - town hall: a bonus for the highest town hall of the clan;
 * - penalties: league attacks missed in the last CWL, new arrivals.
 *
 * On equal score: higher town hall first, then the higher role (leader, co-leader, elder, member).
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
  cwlCommendations: 12,
  cwlPerformance: 13,
  war: 40,
  heroes: 25,
  townHall: 10,
} as const;

/** Points of each CWL commendation (they add up to {@link POINTS}.cwlCommendations at best). */
export const COMMENDATION_POINTS = {
  cwlAllAttacks: 5,
  cwlStriker: { bronze: 3, silver: 5, gold: 7 } as Readonly<Partial<Record<CommendationTier, number>>>,
} as const;
const COMMENDATIONS_MAX = COMMENDATION_POINTS.cwlAllAttacks + 7;

/** League attacks needed for the CWL performance to count in full. */
export const CWL_FULL_CONFIDENCE_ATTACKS = 3;

export const WAR_WINDOW_DAYS = 90;
/** Attacks needed for the war score to count in full. */
export const WAR_FULL_CONFIDENCE_ATTACKS = 8;
/** Shares of the war score: quality of the attacks and attacks used. */
const WAR_QUALITY_SHARE = 0.75;
/** Shares of the quality of an attack: stars and destruction. */
const STARS_SHARE = 0.8;

/** Shares of the heroes score: hero levels and equipped equipment. */
const HERO_LEVELS_SHARE = 2 / 3;

/** Points lost for each league attack missed in the last CWL, and the most lost this way. */
export const MISSED_ATTACK_PENALTY = 3;
export const MISSED_ATTACKS_MAX_PENALTY = 15;
/** New arrival: in the clans of the Crusade for fewer days than this. */
export const NEWCOMER_DAYS = 14;
export const NEWCOMER_PENALTY = 5;

export type SelectionStatus = 'starter' | 'reserve' | 'bench' | 'ineligible' | 'excluded';

export interface WarTotals {
  wars: number;
  attacksUsed: number;
  attacksAvailable: number;
  stars: number;
  totalDestruction: number;
}

/** A player in the last CWL: where, league wars in the line-up, attacks, commendations. */
export interface LastCwl {
  /** Clan of the Crusade the player fought the CWL with. */
  clanTag: string;
  wars: number;
  attacks: number;
  stars: number;
  totalDestruction: number;
  allAttacks: boolean;
  striker: CommendationTier | null;
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
  /** `null`: not in the line-up of the last CWL. */
  cwl: LastCwl | null;
  /** Home village heroes and the equipment they wear; `null` while the profile was never read. */
  heroes: Level[] | null;
  equipment: Level[] | null;
  /** When the player (last) joined the clans of the Crusade; `null` when unknown. */
  joinedAt: Date | null;
  exclusion: Exclusion | null;
}

/** What the clan looks like, for the parts that compare players. */
export interface SelectionContext {
  now: Date;
  /** Highest level of each home village hero (from the game), for the heroes nobody has yet too. */
  heroMaxLevels: Map<string, number>;
}

export interface ScoreBreakdown {
  cwlCommendations: number;
  cwlPerformance: number;
  /** Up to {@link POINTS}.war, or with the CWL points too for who was not in the last CWL. */
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
    /** Most points of the regular wars for this player (more without the last CWL). */
    maxPoints: number;
  };
  /** The last CWL; `null` when not in its line-up. */
  cwl: {
    clanTag: string;
    allAttacks: boolean;
    striker: CommendationTier | null;
    wars: number;
    attacks: number;
    missed: number;
    averageStarsPerAttack: number;
    averageDestruction: number;
  } | null;
  /** Percentages of the highest levels; `null` while the profile was never read. */
  heroes: { levels: number; equipment: number } | null;
  activity: { joinedAt: string | null; newcomer: boolean };
  exclusion: Exclusion | null;
}

const DAY_MS = 86_400_000;
const round = (value: number, decimals = 1) => Math.round(value * 10 ** decimals) / 10 ** decimals;

/** Quality of attacks, 0–1: stars per attack and destruction. */
function attackQuality(stars: number, totalDestruction: number, attacks: number): number {
  if (!attacks) return 0;
  return STARS_SHARE * (stars / attacks / 3) + (1 - STARS_SHARE) * (totalDestruction / attacks / 100);
}

/** Commendations of the last CWL, 0–{@link POINTS}.cwlCommendations. */
export function cwlCommendationScore(cwl: LastCwl | null): number {
  if (!cwl) return 0;
  const striker = cwl.striker ? (COMMENDATION_POINTS.cwlStriker[cwl.striker] ?? 0) : 0;
  const points = (cwl.allAttacks ? COMMENDATION_POINTS.cwlAllAttacks : 0) + striker;
  return (POINTS.cwlCommendations * points) / COMMENDATIONS_MAX;
}

/**
 * League attacks of the last CWL, 0–{@link POINTS}.cwlPerformance, scaled down below
 * {@link CWL_FULL_CONFIDENCE_ATTACKS} attacks.
 */
export function cwlPerformanceScore(cwl: LastCwl | null): number {
  if (!cwl?.attacks) return 0;
  const quality = attackQuality(cwl.stars, cwl.totalDestruction, cwl.attacks);
  return POINTS.cwlPerformance * quality * Math.min(1, cwl.attacks / CWL_FULL_CONFIDENCE_ATTACKS);
}

/** Penalty (≤ 0) for the league attacks missed in the last CWL. */
export function missedAttacksPenalty(cwl: LastCwl | null): number {
  if (!cwl) return 0;
  return -Math.min(MISSED_ATTACKS_MAX_PENALTY, Math.max(0, cwl.wars - cwl.attacks) * MISSED_ATTACK_PENALTY);
}

/** Most points of the regular wars: with the CWL points too for who was not in the last CWL. */
export function warPointsFor(cwl: LastCwl | null): number {
  return cwl ? POINTS.war : POINTS.war + POINTS.cwlCommendations + POINTS.cwlPerformance;
}

/** Regular wars, 0–`maxPoints`. */
export function warScore(war: WarTotals, maxPoints: number = POINTS.war): number {
  if (!war.attacksUsed || !war.attacksAvailable) return 0;
  const quality = attackQuality(war.stars, war.totalDestruction, war.attacksUsed);
  const participation = Math.min(1, war.attacksUsed / war.attacksAvailable);
  const confidence = Math.min(1, war.attacksUsed / WAR_FULL_CONFIDENCE_ATTACKS);
  return maxPoints * (WAR_QUALITY_SHARE * quality + (1 - WAR_QUALITY_SHARE) * participation) * confidence;
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

/** In the clans of the Crusade for fewer than {@link NEWCOMER_DAYS} days. */
export function isNewcomer(c: SelectionCandidate, now: Date): boolean {
  return !!c.joinedAt && now.getTime() - c.joinedAt.getTime() < NEWCOMER_DAYS * DAY_MS;
}

/** The parts of the score of a candidate. */
export function scoreBreakdown(
  c: SelectionCandidate,
  context: SelectionContext,
  maxTownHall: number | null,
): ScoreBreakdown {
  return {
    cwlCommendations: cwlCommendationScore(c.cwl),
    cwlPerformance: cwlPerformanceScore(c.cwl),
    war: warScore(c.war, warPointsFor(c.cwl)),
    heroes: heroScore(heroRatios(c.heroes, c.equipment, context.heroMaxLevels)),
    townHall: maxTownHall !== null && c.townHallLevel === maxTownHall ? POINTS.townHall : 0,
    missedAttacks: missedAttacksPenalty(c.cwl),
    activity: isNewcomer(c, context.now) ? -NEWCOMER_PENALTY : 0,
  };
}

/** Order of the clan roles on equal score and town hall (`admin` is the elder); unknown last. */
export const ROLE_ORDER: readonly string[] = ['leader', 'coLeader', 'admin', 'member'];

function roleRank(role: string | null): number {
  const index = role ? ROLE_ORDER.indexOf(role) : -1;
  return index === -1 ? ROLE_ORDER.length : index;
}

/**
 * Ranks the candidates: players with an eligible town hall first, by score, then town hall, then
 * role (leader, co-leader, elder, member), then name; the first {@link STARTERS} not excluded are starters, the next {@link RESERVES} reserves.
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
      roleRank(a.candidate.role) - roleRank(b.candidate.role) ||
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
    const ratios = heroRatios(c.heroes, c.equipment, context.heroMaxLevels);
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
        maxPoints: warPointsFor(c.cwl),
      },
      cwl: c.cwl
        ? {
            clanTag: c.cwl.clanTag,
            allAttacks: c.cwl.allAttacks,
            striker: c.cwl.striker,
            wars: c.cwl.wars,
            attacks: c.cwl.attacks,
            missed: Math.max(0, c.cwl.wars - c.cwl.attacks),
            averageStarsPerAttack: c.cwl.attacks ? round(c.cwl.stars / c.cwl.attacks, 2) : 0,
            averageDestruction: c.cwl.attacks ? round(c.cwl.totalDestruction / c.cwl.attacks) : 0,
          }
        : null,
      heroes: ratios ? { levels: round(ratios.levels * 100), equipment: round(ratios.equipment * 100) } : null,
      activity: { joinedAt: c.joinedAt?.toISOString() ?? null, newcomer: isNewcomer(c, context.now) },
      exclusion: c.exclusion,
    };
  });
  return { maxTownHall, rows };
}
