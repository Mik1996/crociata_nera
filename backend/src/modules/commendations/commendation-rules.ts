import { compareForRanking, HistoryPeriod, HistoryPlayerStats } from '@/modules/wars/history.service';

/**
 * Rules of the commendations. Same rules as the frontend (`src/app/core/utils/commendations.ts`),
 * applied here once, when a period closes: the result is saved and never recomputed, so later
 * changes to the rules do not alter the history.
 */

export type CommendationType =
  | 'champion'
  | 'perfect'
  | 'giantSlayer'
  | 'cwlStriker'
  | 'capitalRaider'
  | 'donor'
  | 'wall'
  | 'tireless'
  | 'present';
export type CommendationTier = 'bronze' | 'silver' | 'gold';

export interface Commendation {
  type: CommendationType;
  tier: CommendationTier;
}

export const COMMENDATION_TYPES: readonly CommendationType[] = [
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
export const COMMENDATION_TIERS: readonly CommendationTier[] = ['gold', 'silver', 'bronze'];

export const COMMENDATION_THRESHOLDS: Readonly<Record<CommendationType, Readonly<Record<CommendationTier, number>>>> = {
  champion: { bronze: 3, silver: 2, gold: 1 },
  perfect: { bronze: 2.5, silver: 2.8, gold: 3 },
  giantSlayer: { bronze: 2, silver: 5, gold: 10 },
  wall: { bronze: 2.5, silver: 2, gold: 1.5 },
  tireless: { bronze: 3, silver: 5, gold: 8 },
  present: { bronze: 50, silver: 75, gold: 100 },
  cwlStriker: { bronze: 2.5, silver: 2.75, gold: 3 },
  capitalRaider: { bronze: 25_000, silver: 27_500, gold: 30_000 },
  donor: { bronze: 5_000, silver: 7_500, gold: 10_000 },
};

export const MIN_WARS = 3;
export const PERFECT_MIN_ATTACKS = 4;
export const CWL_MIN_ATTACKS = 3;

const LOWER_IS_BETTER: ReadonlySet<CommendationType> = new Set(['champion', 'wall']);
const STRICTLY_ABOVE: ReadonlySet<CommendationType> = new Set(['capitalRaider']);

/**
 * Catalogue of the commendations: a stable unique id for each type and tier. Ids are never
 * changed nor reused: a new commendation gets a new id, a retired one keeps its id in the
 * saved history.
 */
export const COMMENDATION_IDS: Readonly<Record<CommendationType, Readonly<Record<CommendationTier, string>>>> = {
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

/** Unique id of a commendation (see {@link COMMENDATION_IDS}). */
export function commendationId(c: Commendation): string {
  return COMMENDATION_IDS[c.type][c.tier];
}

/** `<type>-<tier>`, e.g. `capitalRaider-gold` (also the name of the medal image). */
export function commendationName(c: Commendation): string {
  return `${c.type}-${c.tier}`;
}

/** The commendation of a catalogue id, `null` if unknown. */
export function commendationOf(id: string): Commendation | null {
  for (const type of COMMENDATION_TYPES) {
    for (const tier of COMMENDATION_TIERS) if (COMMENDATION_IDS[type][tier] === id) return { type, tier };
  }
  return null;
}

export function tierFor(type: CommendationType, value: number): CommendationTier | null {
  const thresholds = COMMENDATION_THRESHOLDS[type];
  const reached = (tier: CommendationTier) =>
    LOWER_IS_BETTER.has(type)
      ? value <= thresholds[tier]
      : STRICTLY_ABOVE.has(type)
        ? value > thresholds[tier]
        : value >= thresholds[tier];
  return COMMENDATION_TIERS.find(reached) ?? null;
}

type Awards = Map<string, Commendation[]>;

function give(awards: Awards, tag: string, type: CommendationType, value: number): void {
  const tier = tierFor(type, value);
  if (tier) awards.set(tag, [...(awards.get(tag) ?? []), { type, tier }]);
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
  attacks: number;
  stars: number;
}

/** `cwlStriker` of an ended CWL season, on the exact average stars per attack. */
export function awardCwlCommendations(players: CwlPlayerResult[]): Awards {
  const awards: Awards = new Map();
  for (const p of players) {
    if (p.attacks >= CWL_MIN_ATTACKS) give(awards, p.tag, 'cwlStriker', p.stars / p.attacks);
  }
  return awards;
}

function starsPerAttack(p: HistoryPlayerStats): number {
  return p.attacksUsed ? p.stars / p.attacksUsed : 0;
}
