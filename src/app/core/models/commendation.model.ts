/** Monthly honours shown in the player banner (rules in `utils/commendations.ts`). */
export type CommendationType =
  | 'champion'
  | 'perfect'
  | 'giantSlayer'
  | 'cwlStriker'
  | 'capitalRaider'
  | 'wall'
  | 'tireless'
  | 'present';

/** Each commendation has three tiers with increasing requirements. */
export type CommendationTier = 'bronze' | 'silver' | 'gold';

/** Name of a medal image: `public/commendations/<type>-<tier>.svg`. */
export type CommendationEmblem = `${CommendationType}-${CommendationTier}`;

/** A commendation earned in a month: only the highest tier reached is kept. */
export interface Commendation {
  type: CommendationType;
  tier: CommendationTier;
}

/** Periods the commendations refer to: each kind has its own. */
export interface CommendationPeriods {
  /** Month of the war commendations (`YYYY-MM`): the last completed month. */
  month: string;
  /** Last ended Raid Weekend (`capitalRaider`). */
  raidWeekend?: { startTime: string; endTime: string };
  /** Last ended Clan War League season, `YYYY-MM` (`cwlStriker`). */
  cwlSeason?: string;
}

/** Commendations earned by a player. */
export interface PlayerCommendations extends CommendationPeriods {
  items: Commendation[];
}
